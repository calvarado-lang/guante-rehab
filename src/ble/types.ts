import type { DeviceState, Mode } from './gattSpec'

export type FlexValues = readonly [number, number, number, number, number]
export type EncoderValues = readonly [number, number, number, number, number]

export interface SensorPacket {
  seq: number
  flex: FlexValues
  emgEnvelope: number
  fsr: number
  state: DeviceState
  batteryPct: number
}

export interface MotorPacket {
  encoderCounts: EncoderValues
}

export interface StatusPacket {
  state: DeviceState
  errorCode: number
  flags: number
}

export type Command =
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SET_ASSIST_LEVEL'; level: number }
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'ESTOP' }
  | { type: 'CAL_EMG_BASELINE' }
  | { type: 'CAL_EMG_MVC' }
  | { type: 'CAL_FLEX_OPEN' }
  | { type: 'CAL_FLEX_CLOSED' }
  | { type: 'HEARTBEAT'; counter: number }

export interface GloveTransport {
  connect(): Promise<void>
  disconnect(): Promise<void>
  onSensors(callback: (packet: SensorPacket) => void): () => void
  onMotors(callback: (packet: MotorPacket) => void): () => void
  onStatus(callback: (status: StatusPacket) => void): () => void
  onDisconnected(callback: () => void): () => void
  onReconnecting?: (callback: (attempt: number) => void) => () => void
  onReconnected?: (callback: () => void) => () => void
  onReconnectFailed?: (callback: () => void) => () => void
  sendCommand(command: Command): Promise<void>
}
