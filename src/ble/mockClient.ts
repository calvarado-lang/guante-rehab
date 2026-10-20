import {
  DEVICE_STATES,
  STATUS_FLAGS,
  TELEMETRY_INTERVAL_MS,
} from './gattSpec'
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

export class MockClient implements GloveTransport {
  private connected = false
  private timer: number | undefined
  private sequence = 0
  private tick = 0
  private batteryPct = 100
  private mode: SensorPacket['state'] = DEVICE_STATES.IDLE
  private assistLevel = 50
  private flags = 0
  private readonly completedCalibrationSteps = new Set<Command['type']>()
  private readonly sensorCallbacks = new Set<SensorCallback>()
  private readonly motorCallbacks = new Set<MotorCallback>()
  private readonly statusCallbacks = new Set<StatusCallback>()
  private readonly disconnectedCallbacks = new Set<DisconnectedCallback>()
  private readonly encoderCounts: [number, number, number, number, number] = [0, 0, 0, 0, 0]

  async connect(): Promise<void> {
    if (this.connected) {
      return
    }

    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 80))
    this.connected = true
    this.emitStatus()
    this.timer = globalThis.setInterval(() => this.emitTelemetry(), TELEMETRY_INTERVAL_MS)
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return
    }

    this.connected = false
    this.stopTimer()
    for (const callback of this.disconnectedCallbacks) {
      callback()
    }
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

  async sendCommand(command: Command): Promise<void> {
    if (!this.connected) {
      throw new Error('El simulador no está conectado.')
    }

    switch (command.type) {
      case 'SET_MODE':
        this.mode = command.mode
        break
      case 'SET_ASSIST_LEVEL':
        this.assistLevel = Math.max(0, Math.min(100, command.level))
        break
      case 'START':
        if (this.flags & STATUS_FLAGS.CALIBRATED) {
          this.mode = this.mode === DEVICE_STATES.IDLE ? DEVICE_STATES.PASSIVE : this.mode
          this.flags |= STATUS_FLAGS.MOTORS_ENABLED
        }
        break
      case 'STOP':
        this.mode = DEVICE_STATES.IDLE
        this.flags &= ~STATUS_FLAGS.MOTORS_ENABLED
        break
      case 'ESTOP':
        this.mode = DEVICE_STATES.SAFE_STOP
        this.flags &= ~STATUS_FLAGS.MOTORS_ENABLED
        break
      case 'CAL_EMG_BASELINE':
      case 'CAL_EMG_MVC':
      case 'CAL_FLEX_OPEN':
      case 'CAL_FLEX_CLOSED':
        this.mode = DEVICE_STATES.CALIBRATING
        this.completedCalibrationSteps.add(command.type)
        if (command.type === 'CAL_EMG_MVC') {
          this.flags |= STATUS_FLAGS.EMG_OK
        }
        if (this.completedCalibrationSteps.has('CAL_EMG_BASELINE')
          && this.completedCalibrationSteps.has('CAL_EMG_MVC')
          && this.completedCalibrationSteps.has('CAL_FLEX_OPEN')
          && this.completedCalibrationSteps.has('CAL_FLEX_CLOSED')) {
          this.flags |= STATUS_FLAGS.CALIBRATED
          this.mode = DEVICE_STATES.IDLE
        }
        break
      case 'HEARTBEAT':
        break
    }

    this.emitStatus()
  }

  private emitTelemetry(): void {
    if (!this.connected) {
      return
    }

    this.tick += 1
    this.sequence = (this.sequence + 1) & 0xffff
    this.batteryPct = Math.max(0, 100 - Math.floor(this.tick / 3000))
    if (this.batteryPct < 20) {
      this.flags |= STATUS_FLAGS.LOW_BATTERY
    }

    const wave = (index: number) =>
      Math.round(2048 + Math.sin(this.tick / 28 + index * 0.7) * 850)
    const burst = this.tick % 240 < 55 ? 1100 : 180
    const emgEnvelope = Math.min(4095, Math.max(0, burst + Math.round(Math.random() * 100)))
    const fsr = Math.min(4095, Math.max(0, 250 + Math.round(Math.max(0, Math.sin(this.tick / 20)) * 1800)))

    const sensorPacket: SensorPacket = {
      seq: this.sequence,
      flex: [wave(0), wave(1), wave(2), wave(3), wave(4)],
      emgEnvelope,
      fsr,
      state: this.mode,
      batteryPct: this.batteryPct,
    }

    for (const callback of this.sensorCallbacks) {
      callback(sensorPacket)
    }

    if (this.tick % 2 === 0) {
      const motorDelta = this.mode === DEVICE_STATES.IDLE || this.mode === DEVICE_STATES.SAFE_STOP
        ? 0
        : Math.max(1, Math.round(this.assistLevel / 10))
      for (let index = 0; index < this.encoderCounts.length; index += 1) {
        this.encoderCounts[index] += motorDelta
      }
      const motorPacket: MotorPacket = { encoderCounts: [...this.encoderCounts] }
      for (const callback of this.motorCallbacks) {
        callback(motorPacket)
      }
    }
  }

  private emitStatus(): void {
    const status: StatusPacket = {
      state: this.mode,
      errorCode: 0,
      flags: this.flags,
    }
    for (const callback of this.statusCallbacks) {
      callback(status)
    }
  }

  private stopTimer(): void {
    if (this.timer !== undefined) {
      globalThis.clearInterval(this.timer)
      this.timer = undefined
    }
  }
}
