import { GATT_CHARACTERISTICS, GATT_SERVICE_UUID } from './gattSpec'
import { parseMotors, parseSensors, parseStatus, encodeCommand } from './parsers'
import { retryWithBackoff } from './reconnect'
import type {
  Command,
  GloveTransport,
  MotorPacket,
  SensorPacket,
  StatusPacket,
} from './types'

type SensorCallback = (packet: SensorPacket) => void
type MotorCallback = (packet: MotorPacket) => void
type StatusCallback = (status: StatusPacket) => void
type DisconnectedCallback = () => void
type ReconnectingCallback = (attempt: number) => void
type EmptyCallback = () => void

export class WebBluetoothClient implements GloveTransport {
  private device: BluetoothDevice | undefined
  private connected = false
  private shouldReconnect = true
  private reconnecting = false
  private sensorsCharacteristic: BluetoothRemoteGATTCharacteristic | undefined
  private motorsCharacteristic: BluetoothRemoteGATTCharacteristic | undefined
  private statusCharacteristic: BluetoothRemoteGATTCharacteristic | undefined
  private commandCharacteristic: BluetoothRemoteGATTCharacteristic | undefined
  private readonly sensorCallbacks = new Set<SensorCallback>()
  private readonly motorCallbacks = new Set<MotorCallback>()
  private readonly statusCallbacks = new Set<StatusCallback>()
  private readonly disconnectedCallbacks = new Set<DisconnectedCallback>()
  private readonly reconnectingCallbacks = new Set<ReconnectingCallback>()
  private readonly reconnectedCallbacks = new Set<EmptyCallback>()
  private readonly reconnectFailedCallbacks = new Set<EmptyCallback>()

  async connect(): Promise<void> {
    if (!('bluetooth' in navigator)) {
      throw new Error('Web Bluetooth no está disponible en este navegador.')
    }

    this.shouldReconnect = true
    this.removeDeviceListener()
    this.detachCharacteristics()
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [GATT_SERVICE_UUID] }],
      optionalServices: [GATT_SERVICE_UUID],
    })
    this.device.addEventListener('gattserverdisconnected', this.handleDisconnected)
    await this.connectToKnownDevice()
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false
    this.reconnecting = false
    this.removeDeviceListener()
    this.detachCharacteristics()
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect()
    }
    this.connected = false
  }

  onSensors(callback: SensorCallback): () => void {
    this.sensorCallbacks.add(callback)
    return () => this.sensorCallbacks.delete(callback)
  }

  onMotors(callback: MotorCallback): () => void {
    this.motorCallbacks.add(callback)
    return () => this.motorCallbacks.delete(callback)
  }

  onStatus(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback)
    return () => this.statusCallbacks.delete(callback)
  }

  onDisconnected(callback: DisconnectedCallback): () => void {
    this.disconnectedCallbacks.add(callback)
    return () => this.disconnectedCallbacks.delete(callback)
  }

  onReconnecting(callback: ReconnectingCallback): () => void {
    this.reconnectingCallbacks.add(callback)
    return () => this.reconnectingCallbacks.delete(callback)
  }

  onReconnected(callback: EmptyCallback): () => void {
    this.reconnectedCallbacks.add(callback)
    return () => this.reconnectedCallbacks.delete(callback)
  }

  onReconnectFailed(callback: EmptyCallback): () => void {
    this.reconnectFailedCallbacks.add(callback)
    return () => this.reconnectFailedCallbacks.delete(callback)
  }

  async sendCommand(command: Command): Promise<void> {
    if (this.commandCharacteristic === undefined) {
      throw new Error('El guante no está conectado para recibir comandos.')
    }
    const encodedCommand = encodeCommand(command)
    await this.commandCharacteristic.writeValueWithoutResponse(encodedCommand.buffer as ArrayBuffer)
  }

  private async connectToKnownDevice(): Promise<void> {
    const gatt = this.device?.gatt
    if (gatt === undefined) {
      throw new Error('El dispositivo no expone un servidor GATT.')
    }

    const server = gatt.connected ? gatt : await gatt.connect()
    const service = await server.getPrimaryService(GATT_SERVICE_UUID)
    this.sensorsCharacteristic = await service.getCharacteristic(
      GATT_CHARACTERISTICS.telemetrySensors,
    )
    this.motorsCharacteristic = await service.getCharacteristic(
      GATT_CHARACTERISTICS.telemetryMotors,
    )
    this.statusCharacteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.status)
    this.commandCharacteristic = await service.getCharacteristic(GATT_CHARACTERISTICS.command)

    await Promise.all([
      this.sensorsCharacteristic.startNotifications(),
      this.motorsCharacteristic.startNotifications(),
      this.statusCharacteristic.startNotifications(),
    ])
    this.sensorsCharacteristic.addEventListener('characteristicvaluechanged', this.handleSensors)
    this.motorsCharacteristic.addEventListener('characteristicvaluechanged', this.handleMotors)
    this.statusCharacteristic.addEventListener('characteristicvaluechanged', this.handleStatus)
    this.connected = true
    for (const callback of this.reconnectedCallbacks) {
      callback()
    }
  }

  private readonly handleSensors = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (value === undefined) {
      return
    }
    const packet = parseSensors(value)
    for (const callback of this.sensorCallbacks) {
      callback(packet)
    }
  }

  private readonly handleMotors = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (value === undefined) {
      return
    }
    const packet = parseMotors(value)
    for (const callback of this.motorCallbacks) {
      callback(packet)
    }
  }

  private readonly handleStatus = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (value === undefined) {
      return
    }
    const status = parseStatus(value)
    for (const callback of this.statusCallbacks) {
      callback(status)
    }
  }

  private readonly handleDisconnected = (): void => {
    this.connected = false
    this.detachCharacteristics()
    for (const callback of this.disconnectedCallbacks) {
      callback()
    }

    if (this.shouldReconnect && !this.reconnecting && this.device !== undefined) {
      void this.reconnectKnownDevice()
    }
  }

  private async reconnectKnownDevice(): Promise<void> {
    this.reconnecting = true
    try {
      await retryWithBackoff(
        () => this.connectToKnownDevice(),
        (attempt) => {
          for (const callback of this.reconnectingCallbacks) {
            callback(attempt)
          }
        },
      )
    } catch {
      for (const callback of this.reconnectFailedCallbacks) {
        callback()
      }
    } finally {
      this.reconnecting = false
    }
  }

  private detachCharacteristics(): void {
    this.sensorsCharacteristic?.removeEventListener(
      'characteristicvaluechanged',
      this.handleSensors,
    )
    this.motorsCharacteristic?.removeEventListener(
      'characteristicvaluechanged',
      this.handleMotors,
    )
    this.statusCharacteristic?.removeEventListener(
      'characteristicvaluechanged',
      this.handleStatus,
    )
    this.sensorsCharacteristic = undefined
    this.motorsCharacteristic = undefined
    this.statusCharacteristic = undefined
    this.commandCharacteristic = undefined
  }

  private removeDeviceListener(): void {
    this.device?.removeEventListener('gattserverdisconnected', this.handleDisconnected)
  }
}
