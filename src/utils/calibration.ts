import type { CalibrationRecord } from '../db/schema'
import type { FlexValues, SensorPacket } from '../ble/types'
import { telemetryBuffer } from '../store/telemetryBuffer'

export interface CalibrationMeasurements {
  emgBaseline: number | null
  emgMvc: number | null
  flexOpen: FlexValues | null
  flexClosed: FlexValues | null
}

function asFlexValues(values: number[]): FlexValues {
  const [thumb, index, middle, ring, little] = values
  return [thumb ?? 0, index ?? 0, middle ?? 0, ring ?? 0, little ?? 0]
}

export function captureSensorWindow(windowSize = 12): SensorPacket[] {
  return telemetryBuffer.toArray()
    .filter((point): point is { timestamp: number; sensors: SensorPacket } => point.sensors !== undefined)
    .slice(-windowSize)
    .map((point) => point.sensors)
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

export function averageEmg(packets: SensorPacket[]): number {
  return average(packets.map((packet) => packet.emgEnvelope))
}

export function averageFlex(packets: SensorPacket[]): FlexValues {
  return asFlexValues([0, 1, 2, 3, 4].map((index) => average(packets.map((packet) => packet.flex[index]))))
}

export function buildCalibrationRecord(
  profileId: string,
  id: string,
  measurements: CalibrationMeasurements,
): CalibrationRecord {
  const flexOpen = measurements.flexOpen ?? [0, 0, 0, 0, 0]
  const flexClosed = measurements.flexClosed ?? flexOpen
  const flexionMin = asFlexValues([0, 1, 2, 3, 4].map((index) => Math.min(flexOpen[index], flexClosed[index])))
  const flexionMax = asFlexValues([0, 1, 2, 3, 4].map((index) => Math.max(flexOpen[index], flexClosed[index])))
  const movementRange = asFlexValues([0, 1, 2, 3, 4].map((index) => flexionMax[index] - flexionMin[index]))

  return {
    id,
    profileId,
    flexionMin,
    flexionMax,
    movementRange,
    emgBaseline: measurements.emgBaseline ?? 0,
    emgMvc: measurements.emgMvc ?? 0,
    sampleCount: telemetryBuffer.size,
    createdAt: Date.now(),
  }
}
