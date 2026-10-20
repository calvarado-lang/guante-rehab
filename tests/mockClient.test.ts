import { describe, expect, it, vi } from 'vitest'
import { DEVICE_STATES, STATUS_FLAGS } from '../src/ble/gattSpec'
import { MockClient } from '../src/ble/mockClient'
import { useDeviceStore } from '../src/store/deviceStore'
import { telemetryBuffer } from '../src/store/telemetryBuffer'

describe('simulador y deviceStore', () => {
  it('emite telemetría y responde al paro de emergencia', async () => {
    vi.useFakeTimers()
    const mock = new MockClient()
    let sensorCount = 0
    let lastState = DEVICE_STATES.IDLE
    let lastFlags = 0

    mock.onSensors((packet) => {
      sensorCount += 1
      lastState = packet.state
    })
    mock.onStatus((status) => {
      lastState = status.state
      lastFlags = status.flags
    })

    try {
      const connection = mock.connect()
      await vi.advanceTimersByTimeAsync(80)
      await connection
      await vi.advanceTimersByTimeAsync(100)

      expect(sensorCount).toBeGreaterThan(0)
      await mock.sendCommand({ type: 'CAL_EMG_BASELINE' })
      await mock.sendCommand({ type: 'CAL_EMG_MVC' })
      await mock.sendCommand({ type: 'CAL_FLEX_OPEN' })
      await mock.sendCommand({ type: 'CAL_FLEX_CLOSED' })
      expect(lastFlags & STATUS_FLAGS.CALIBRATED).toBe(STATUS_FLAGS.CALIBRATED)
      await mock.sendCommand({ type: 'ESTOP' })
      expect(lastState).toBe(DEVICE_STATES.SAFE_STOP)
      await mock.disconnect()
    } finally {
      vi.useRealTimers()
    }
  })

  it('actualiza el estado de conexión y el buffer sin guardar telemetría en Zustand', async () => {
    vi.useFakeTimers()
    const mock = new MockClient()
    telemetryBuffer.clear()

    try {
      const connection = useDeviceStore.getState().connect(mock)
      await vi.advanceTimersByTimeAsync(80)
      await connection
      await vi.advanceTimersByTimeAsync(100)

      expect(useDeviceStore.getState().connectionState).toBe('conectado')
      expect(useDeviceStore.getState().batteryPct).toBe(100)
      expect(telemetryBuffer.size).toBeGreaterThan(0)

      await useDeviceStore.getState().disconnect()
      expect(useDeviceStore.getState().connectionState).toBe('desconectado')
    } finally {
      vi.useRealTimers()
    }
  })
})
