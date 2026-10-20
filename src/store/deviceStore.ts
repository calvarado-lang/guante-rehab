import { create } from 'zustand'
import { DEVICE_STATES } from '../ble/gattSpec'
import type { GloveTransport, MotorPacket, SensorPacket, StatusPacket } from '../ble/types'
import { telemetryBuffer } from './telemetryBuffer'

export type ConnectionState =
  | 'desconectado'
  | 'conectando'
  | 'conectado'
  | 'reconectando'
  | 'error'

interface DeviceStore {
  connectionState: ConnectionState
  batteryPct: number | null
  deviceState: SensorPacket['state']
  statusFlags: number
  errorCode: number | null
  errorMessage: string | null
  lostPackets: number
  lastSensorSeq: number | null
  connect: (transport: GloveTransport) => Promise<void>
  disconnect: () => Promise<void>
  clearError: () => void
}

let activeTransport: GloveTransport | undefined
let cleanupSubscriptions: Array<() => void> = []

function resetSubscriptions(): void {
  for (const cleanup of cleanupSubscriptions) {
    cleanup()
  }
  cleanupSubscriptions = []
}

function countLostPackets(previousSeq: number, currentSeq: number): number {
  const difference = (currentSeq - previousSeq + 0x10000) % 0x10000
  return difference > 1 && difference < 0x8000 ? difference - 1 : 0
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  connectionState: 'desconectado',
  batteryPct: null,
  deviceState: DEVICE_STATES.IDLE,
  statusFlags: 0,
  errorCode: null,
  errorMessage: null,
  lostPackets: 0,
  lastSensorSeq: null,

  connect: async (transport) => {
    resetSubscriptions()
    activeTransport = transport
    telemetryBuffer.clear()
    set({
      connectionState: 'conectando',
      errorCode: null,
      errorMessage: null,
      lostPackets: 0,
      lastSensorSeq: null,
    })

    const onSensors = (packet: SensorPacket) => {
      const previousSeq = get().lastSensorSeq
      const lostPackets = previousSeq === null
        ? 0
        : countLostPackets(previousSeq, packet.seq)
      telemetryBuffer.add({ timestamp: Date.now(), sensors: packet })
      set((state) => ({
        batteryPct: packet.batteryPct,
        deviceState: packet.state,
        lastSensorSeq: packet.seq,
        lostPackets: state.lostPackets + lostPackets,
      }))
    }
    const onMotors = (packet: MotorPacket) => {
      telemetryBuffer.add({ timestamp: Date.now(), motors: packet })
    }
    const onStatus = (status: StatusPacket) => {
      set({
        deviceState: status.state,
        statusFlags: status.flags,
        errorCode: status.errorCode,
        errorMessage: status.errorCode === 0 ? null : `Error del dispositivo: ${status.errorCode}`,
      })
    }
    const onDisconnected = () => {
      set({
        connectionState: transport.onReconnecting === undefined
          ? 'desconectado'
          : 'reconectando',
        errorMessage: 'El guante se desconectó. El firmware debe entrar por sí solo en estado seguro.',
      })
    }

    const onReconnecting = () => set({ connectionState: 'reconectando' })
    const onReconnected = () => set({ connectionState: 'conectado', errorMessage: null })
    const onReconnectFailed = () => set({
      connectionState: 'error',
      errorMessage: 'No fue posible reconectar el guante después de 5 intentos.',
    })

    cleanupSubscriptions = [
      transport.onSensors(onSensors),
      transport.onMotors(onMotors),
      transport.onStatus(onStatus),
      transport.onDisconnected(onDisconnected),
    ]
    if (transport.onReconnecting !== undefined) {
      cleanupSubscriptions.push(transport.onReconnecting(onReconnecting))
    }
    if (transport.onReconnected !== undefined) {
      cleanupSubscriptions.push(transport.onReconnected(onReconnected))
    }
    if (transport.onReconnectFailed !== undefined) {
      cleanupSubscriptions.push(transport.onReconnectFailed(onReconnectFailed))
    }

    try {
      await transport.connect()
      set({ connectionState: 'conectado' })
    } catch (error) {
      set({
        connectionState: 'error',
        errorMessage: error instanceof Error ? error.message : 'No fue posible conectar el guante.',
      })
    }
  },

  disconnect: async () => {
    resetSubscriptions()
    if (activeTransport !== undefined) {
      await activeTransport.disconnect()
    }
    activeTransport = undefined
    set({ connectionState: 'desconectado' })
  },

  clearError: () => set({ errorCode: null, errorMessage: null }),
}))

export function getActiveTransport(): GloveTransport | undefined {
  return activeTransport
}
