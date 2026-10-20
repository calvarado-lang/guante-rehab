import { STATUS_FLAGS, type DeviceState, type Mode } from '../ble/gattSpec'
import { EmergencyStop } from '../components/EmergencyStop'
import { LiveChart } from '../components/LiveChart'
import { ConnectionBadge } from '../components/ConnectionBadge'
import { getActiveTransport, useDeviceStore } from '../store/deviceStore'
import { useSessionStore } from '../store/sessionStore'
import { useEffect, useState } from 'react'
import { saveSession } from '../db/sessions'
import { telemetryBuffer } from '../store/telemetryBuffer'

const modes: Array<{ value: Mode; label: string }> = [
  { value: 0, label: 'Reposo' },
  { value: 1, label: 'Calibración' },
  { value: 2, label: 'Pasivo' },
  { value: 3, label: 'Asistido' },
  { value: 4, label: 'Adaptativo' },
]

const stateLabels: Record<DeviceState, string> = {
  0: 'Reposo',
  1: 'Calibrando',
  2: 'Pasivo',
  3: 'Asistido',
  4: 'Adaptativo',
  5: 'Paro seguro',
}

export function Sesion() {
  const connectionState = useDeviceStore((state) => state.connectionState)
  const statusFlags = useDeviceStore((state) => state.statusFlags)
  const deviceState = useDeviceStore((state) => state.deviceState)
  const deviceError = useDeviceStore((state) => state.errorMessage)
  const lostPackets = useDeviceStore((state) => state.lostPackets)
  const sessionStatus = useSessionStore((state) => state.status)
  const mode = useSessionStore((state) => state.mode)
  const assistLevel = useSessionStore((state) => state.assistLevel)
  const sessionError = useSessionStore((state) => state.errorMessage)
  const setMode = useSessionStore((state) => state.setMode)
  const setAssistLevel = useSessionStore((state) => state.setAssistLevel)
  const start = useSessionStore((state) => state.start)
  const stop = useSessionStore((state) => state.stop)
  const incrementHeartbeat = useSessionStore((state) => state.incrementHeartbeat)
  const setError = useSessionStore((state) => state.setError)
  const [showEncoders, setShowEncoders] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus !== 'activa' || connectionState !== 'conectado') {
      return undefined
    }
    const heartbeat = globalThis.setInterval(() => {
      const transport = getActiveTransport()
      if (transport !== undefined) {
        void transport.sendCommand({
          type: 'HEARTBEAT',
          counter: incrementHeartbeat(),
        })
      }
    }, 500)
    return () => globalThis.clearInterval(heartbeat)
  }, [connectionState, incrementHeartbeat, sessionStatus])

  const handleStart = async () => {
    if (connectionState !== 'conectado') {
      setError('Conecta el guante antes de iniciar una sesión.')
      return
    }
    if ((statusFlags & STATUS_FLAGS.CALIBRATED) === 0) {
      setError('Completa la calibración antes de iniciar una sesión.')
      return
    }
    try {
      await getActiveTransport()?.sendCommand({ type: 'SET_MODE', mode })
      await getActiveTransport()?.sendCommand({ type: 'SET_ASSIST_LEVEL', level: assistLevel })
      await getActiveTransport()?.sendCommand({ type: 'START' })
      start()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No fue posible iniciar la sesión.')
    }
  }

  const handleStop = async () => {
    const currentSession = useSessionStore.getState()
    await getActiveTransport()?.sendCommand({ type: 'STOP' })
    stop()

    if (currentSession.startedAt !== null) {
      const endedAt = Date.now()
      const sensorPoints = telemetryBuffer.toArray()
        .filter((point) => point.sensors !== undefined)
        .map((point) => ({ timestamp: point.timestamp, sensors: point.sensors! }))
      const samples = sensorPoints
        .filter((_, index) => index % 5 === 0)
        .map(({ timestamp, sensors }) => ({
          timestamp,
          flex: sensors.flex,
          emgEnvelope: sensors.emgEnvelope,
          fsr: sensors.fsr,
        }))
      const emgValues = sensorPoints.map(({ sensors }) => sensors.emgEnvelope)
      const flexMinimums = [Infinity, Infinity, Infinity, Infinity, Infinity]
      const flexMaximums = [-Infinity, -Infinity, -Infinity, -Infinity, -Infinity]
      for (const { sensors } of sensorPoints) {
        sensors.flex.forEach((value, index) => {
          flexMinimums[index] = Math.min(flexMinimums[index], value)
          flexMaximums[index] = Math.max(flexMaximums[index], value)
        })
      }
      await saveSession({
        startedAt: currentSession.startedAt,
        endedAt,
        durationMs: Math.max(0, endedAt - currentSession.startedAt),
        mode: currentSession.mode,
        assistLevel: currentSession.assistLevel,
        stats: {
          emgAverage: emgValues.length === 0 ? 0 : emgValues.reduce((sum, value) => sum + value, 0) / emgValues.length,
          emgMaximum: emgValues.length === 0 ? 0 : Math.max(...emgValues),
          movementRange: [0, 1, 2, 3, 4].map((index) => {
            const minimum = flexMinimums[index]
            const maximum = flexMaximums[index]
            return Number.isFinite(minimum) && Number.isFinite(maximum) ? maximum - minimum : 0
          }) as [number, number, number, number, number],
          lostPackets,
        },
        samples,
      })
      setSavedMessage('Sesión guardada localmente.')
    }
  }

  const handleModeChange = async (nextMode: Mode) => {
    setMode(nextMode)
    if (sessionStatus === 'activa') {
      await getActiveTransport()?.sendCommand({ type: 'SET_MODE', mode: nextMode })
    }
  }

  const handleAssistChange = async (nextLevel: number) => {
    setAssistLevel(nextLevel)
    if (sessionStatus === 'activa') {
      await getActiveTransport()?.sendCommand({ type: 'SET_ASSIST_LEVEL', level: nextLevel })
    }
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Monitoreo</p>
          <h2>Sesión en vivo</h2>
        </div>
        <ConnectionBadge state={connectionState} />
      </div>

      {deviceError !== null && (
        <p className="error-message" role="alert">{deviceError}</p>
      )}
      {sessionError !== null && (
        <p className="error-message" role="alert">{sessionError}</p>
      )}
      {savedMessage !== null && <p className="success-message" role="status">{savedMessage}</p>}

      <EmergencyStop />

      <article className="card session-controls">
        <div className="control-row">
          <label htmlFor="mode">Modo de asistencia</label>
          <select
            id="mode"
            value={mode}
            onChange={(event) => void handleModeChange(Number(event.target.value) as Mode)}
            disabled={sessionStatus === 'emergencia'}
          >
            {modes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="control-row control-range">
          <label htmlFor="assist-level">Nivel de asistencia <strong>{assistLevel}%</strong></label>
          <input
            id="assist-level"
            type="range"
            min="0"
            max="100"
            value={assistLevel}
            onChange={(event) => void handleAssistChange(Number(event.target.value))}
            disabled={sessionStatus === 'emergencia'}
          />
        </div>
        <div className="session-actions">
          {sessionStatus === 'activa' ? (
            <button className="secondary-button" type="button" onClick={() => void handleStop()}>
              Detener sesión
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={() => void handleStart()} disabled={sessionStatus === 'emergencia'}>
              Iniciar sesión
            </button>
          )}
          <span className="session-state-label">
            {sessionStatus === 'activa' ? 'Sesión activa' : sessionStatus === 'emergencia' ? 'Paro activo' : 'Sin sesión'}
          </span>
        </div>
      </article>

      <div className="chart-grid">
        {[0, 1, 2, 3, 4].map((finger) => (
          <LiveChart key={finger} title={`Flexión ${finger + 1}`} metric={`flex-${finger}` as `flex-${0 | 1 | 2 | 3 | 4}`} height={180} />
        ))}
        <LiveChart title="EMG" metric="emg" />
        <LiveChart title="FSR" metric="fsr" />
      </div>

      <button className="secondary-button chart-toggle" type="button" onClick={() => setShowEncoders((value) => !value)}>
        {showEncoders ? 'Ocultar encoders' : 'Mostrar encoders'}
      </button>
      {showEncoders && <LiveChart title="Encoders · motor 1" metric="motors" />}

      <div className="metric-grid">
        {['EMG', 'FSR', 'Estado'].map((metric) => (
          <article className="card metric-card" key={metric}>
            <span className="info-label">{metric}</span>
            <strong>{metric === 'Estado' ? stateLabels[deviceState] : '—'}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}
