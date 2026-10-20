import { useRef, useState } from 'react'
import { MockClient } from '../ble/mockClient'
import { WebBluetoothClient } from '../ble/webBluetoothClient'
import { BatteryIndicator } from '../components/BatteryIndicator'
import { ConnectionBadge } from '../components/ConnectionBadge'
import { useDeviceStore } from '../store/deviceStore'

export function Conectar() {
  const [useMock, setUseMock] = useState(import.meta.env.VITE_USE_MOCK === 'true')
  const mockClient = useRef(new MockClient())
  const realClient = useRef(new WebBluetoothClient())
  const connectionState = useDeviceStore((state) => state.connectionState)
  const batteryPct = useDeviceStore((state) => state.batteryPct)
  const errorMessage = useDeviceStore((state) => state.errorMessage)
  const connect = useDeviceStore((state) => state.connect)
  const disconnect = useDeviceStore((state) => state.disconnect)

  const handleConnection = async () => {
    if (connectionState === 'conectado' || connectionState === 'reconectando') {
      await disconnect()
      return
    }
    await connect(useMock ? mockClient.current : realClient.current)
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dispositivo</p>
          <h2>Conectar guante</h2>
        </div>
        <ConnectionBadge state={connectionState} />
      </div>

      <article className="card hero-card">
        <div className="hero-icon" aria-hidden="true">✋</div>
        <div>
          <h3>Prepara tu sesión</h3>
          <p className="muted">
            Conecta el guante por Bluetooth o activa el simulador para explorar
            la interfaz sin hardware.
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => void handleConnection()}
          disabled={connectionState === 'conectando'}
        >
          {connectionState === 'conectando'
            ? 'Conectando…'
            : connectionState === 'conectado'
              ? 'Desconectar'
              : useMock
                ? 'Conectar simulador'
                : 'Buscar guante'}
        </button>
      </article>

      <article className="card settings-card">
        <div>
          <h3>Modo de conexión</h3>
          <p className="muted">El simulador permite avanzar sin el prototipo.</p>
        </div>
        <label className="switch-row">
          <span>Usar simulador</span>
          <input
            type="checkbox"
            checked={useMock}
            onChange={(event) => setUseMock(event.target.checked)}
          />
        </label>
      </article>

      <div className="info-grid">
        <BatteryIndicator value={batteryPct} />
        <div className="info-item">
          <span className="info-label">Firmware</span>
          <strong>{connectionState === 'conectado' ? 'Conectado' : 'No conectado'}</strong>
        </div>
      </div>

      {errorMessage !== null && (
        <p className="error-message" role="alert">{errorMessage}</p>
      )}
    </section>
  )
}
