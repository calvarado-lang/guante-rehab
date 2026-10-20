import { OPCODES, PACKET_LENGTHS } from './gattSpec'
import type { Command, MotorPacket, SensorPacket, StatusPacket } from './types'

function asDataView(data: DataView | Uint8Array): DataView {
  if (data instanceof DataView) {
    return data
  }

  return new DataView(data.buffer, data.byteOffset, data.byteLength)
}

function assertLength(data: DataView, expected: number, name: string): void {
  if (data.byteLength !== expected) {
    throw new RangeError(
      `${name} debe tener ${expected} bytes; se recibieron ${data.byteLength}.`,
    )
  }
}

export function parseSensors(data: DataView | Uint8Array): SensorPacket {
  const view = asDataView(data)
  assertLength(view, PACKET_LENGTHS.sensors, 'telemetry_sensors')

  return {
    seq: view.getUint16(0, true),
    flex: [
      view.getUint16(2, true),
      view.getUint16(4, true),
      view.getUint16(6, true),
      view.getUint16(8, true),
      view.getUint16(10, true),
    ],
    emgEnvelope: view.getUint16(12, true),
    fsr: view.getUint16(14, true),
    state: view.getUint8(16) as SensorPacket['state'],
    batteryPct: view.getUint8(17),
  }
}

export function parseMotors(data: DataView | Uint8Array): MotorPacket {
  const view = asDataView(data)
  assertLength(view, PACKET_LENGTHS.motors, 'telemetry_motors')

  return {
    encoderCounts: [
      view.getInt32(0, true),
      view.getInt32(4, true),
      view.getInt32(8, true),
      view.getInt32(12, true),
      view.getInt32(16, true),
    ],
  }
}

export function parseStatus(data: DataView | Uint8Array): StatusPacket {
  const view = asDataView(data)
  assertLength(view, PACKET_LENGTHS.status, 'status')

  return {
    state: view.getUint8(0) as StatusPacket['state'],
    errorCode: view.getUint8(1),
    flags: view.getUint16(2, true),
  }
}

export function encodeCommand(command: Command): Uint8Array {
  switch (command.type) {
    case 'SET_MODE': {
      const packet = new Uint8Array(2)
      packet[0] = OPCODES.SET_MODE
      packet[1] = command.mode
      return packet
    }
    case 'SET_ASSIST_LEVEL': {
      if (!Number.isInteger(command.level) || command.level < 0 || command.level > 100) {
        throw new RangeError('El nivel de asistencia debe ser un entero entre 0 y 100.')
      }
      return Uint8Array.from([OPCODES.SET_ASSIST_LEVEL, command.level])
    }
    case 'START':
      return Uint8Array.from([OPCODES.START])
    case 'STOP':
      return Uint8Array.from([OPCODES.STOP])
    case 'ESTOP':
      return Uint8Array.from([OPCODES.ESTOP])
    case 'CAL_EMG_BASELINE':
      return Uint8Array.from([OPCODES.CAL_EMG_BASELINE])
    case 'CAL_EMG_MVC':
      return Uint8Array.from([OPCODES.CAL_EMG_MVC])
    case 'CAL_FLEX_OPEN':
      return Uint8Array.from([OPCODES.CAL_FLEX_OPEN])
    case 'CAL_FLEX_CLOSED':
      return Uint8Array.from([OPCODES.CAL_FLEX_CLOSED])
    case 'HEARTBEAT':
      return Uint8Array.from([OPCODES.HEARTBEAT, command.counter & 0xff])
  }
}
