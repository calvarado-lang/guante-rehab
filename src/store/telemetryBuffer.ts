import type { MotorPacket, SensorPacket } from '../ble/types'

export interface TelemetryPoint {
  timestamp: number
  sensors?: SensorPacket
  motors?: MotorPacket
}

export class TelemetryBuffer {
  private readonly values: Array<TelemetryPoint | undefined>
  private writeIndex = 0
  private count = 0

  constructor(private readonly capacity = 2048) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('La capacidad del buffer debe ser un entero positivo.')
    }
    this.values = new Array<TelemetryPoint | undefined>(capacity)
  }

  add(point: TelemetryPoint): void {
    this.values[this.writeIndex] = point
    this.writeIndex = (this.writeIndex + 1) % this.capacity
    this.count = Math.min(this.count + 1, this.capacity)
  }

  latest(): TelemetryPoint | undefined {
    if (this.count === 0) {
      return undefined
    }
    const latestIndex = (this.writeIndex - 1 + this.capacity) % this.capacity
    return this.values[latestIndex]
  }

  toArray(): TelemetryPoint[] {
    const result: TelemetryPoint[] = []
    const firstIndex = (this.writeIndex - this.count + this.capacity) % this.capacity
    for (let index = 0; index < this.count; index += 1) {
      const point = this.values[(firstIndex + index) % this.capacity]
      if (point !== undefined) {
        result.push(point)
      }
    }
    return result
  }

  clear(): void {
    this.values.fill(undefined)
    this.writeIndex = 0
    this.count = 0
  }

  get size(): number {
    return this.count
  }
}

export const telemetryBuffer = new TelemetryBuffer()
