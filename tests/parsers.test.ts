import { describe, expect, it } from 'vitest'
import { encodeCommand, parseMotors, parseSensors, parseStatus } from '../src/ble/parsers'

describe('parsers del protocolo BLE', () => {
  it('interpreta sensores en little-endian', () => {
    const bytes = Uint8Array.from([
      0x34, 0x12,
      0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
      0x0b, 0x0c,
      0x0d, 0x0e,
      0x03, 0x5a,
    ])

    expect(parseSensors(bytes)).toEqual({
      seq: 0x1234,
      flex: [0x0201, 0x0403, 0x0605, 0x0807, 0x0a09],
      emgEnvelope: 0x0c0b,
      fsr: 0x0e0d,
      state: 3,
      batteryPct: 0x5a,
    })
  })

  it('interpreta encoders con signo y little-endian', () => {
    const bytes = new Uint8Array(20)
    const view = new DataView(bytes.buffer)
    ;[-1, 0, 1, 0x12345678, -2147483648].forEach((value, index) => {
      view.setInt32(index * 4, value, true)
    })

    expect(parseMotors(bytes).encoderCounts).toEqual([-1, 0, 1, 0x12345678, -2147483648])
  })

  it('interpreta estado, error y flags', () => {
    expect(parseStatus(Uint8Array.from([4, 2, 0x05, 0x00]))).toEqual({
      state: 4,
      errorCode: 2,
      flags: 5,
    })
  })

  it('rechaza longitudes incorrectas', () => {
    expect(() => parseSensors(new Uint8Array(17))).toThrow(/18 bytes/)
    expect(() => parseMotors(new Uint8Array(19))).toThrow(/20 bytes/)
    expect(() => parseStatus(new Uint8Array(3))).toThrow(/4 bytes/)
  })

  it('codifica comandos y limita la asistencia', () => {
    expect([...encodeCommand({ type: 'SET_MODE', mode: 4 })]).toEqual([0x01, 0x04])
    expect([...encodeCommand({ type: 'ESTOP' })]).toEqual([0x05])
    expect([...encodeCommand({ type: 'HEARTBEAT', counter: 0x1ff })]).toEqual([0x0a, 0xff])
    expect(() => encodeCommand({ type: 'SET_ASSIST_LEVEL', level: 101 })).toThrow(/0 y 100/)
  })
})
