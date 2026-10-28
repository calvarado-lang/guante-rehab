import { useRef, useState } from 'react'
import { MockClient } from '../ble/mockClient'
import { WebBluetoothClient } from '../ble/webBluetoothClient'
import { BatteryIndicator } from '../components/BatteryIndicator'
import { ConnectionBadge } from '../components/ConnectionBadge'
import { useDeviceStore } from '../store/deviceStore'
import { WifiClient } from '../wifi'
import { isWebBluetoothAvailable } from '../utils/browserSupport'

type ConnectionMode = 'wifi' | 'bluetooth'

const savedEndpoint = globalThis.localStorage?.getItem('guante-rehab-wifi-endpoint')
  ?? (import.meta.env.VITE_GLOVE_URL as string | undefined)
  ?? 'http://192.168.4.1'

export function Conectar() {
  const [useMock, setUseMock] = useState(import.meta.env.VITE_USE_MOCK === 'true')
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(() => {
    const saved = globalThis.localStorage?.getItem('guante-rehab-connection-mode')
    return saved === 'bluetooth' ? 'bluetooth' : 'wifi'
  })
  const [endpoint, setEndpoint] = useState(savedEndpoint)
  const mockClient = useRef(new MockClient())
  const wifiClient = useRef(new WifiClient(savedEndpoint))
  const bluetoothClient = useRef(new WebBluetoothClient())
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
    if (useMock) {
      await connect(mockClient.current)
      return
    }
    globalThis.localStorage?.setItem('guante-rehab-connection-mode', connectionMode)
    if (connectionMode === 'wifi') {
      globalThis.localStorage?.setItem('guante-rehab-wifi-endpoint', endpoint.trim())
      wifiClient.current.setBaseUrl(endpoint)
      await connect(wifiClient.current)
      return
    }
    await connect(bluetoothClient.current)
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
        <div>
          <h3>Prepara tu sesión</h3>
          <p className="muted">
            Conecta el guante por Wi-Fi o Bluetooth. La misma PWA puede abrirse
            en un celular, una tableta o una computadora.
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
                : connectionMode === 'wifi' ? 'Conectar por Wi-Fi' : 'Buscar por Bluetooth'}
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

      {!useMock && (
        <article className="card connection-card">
          <div>
            <h3>Tipo de conexión</h3>
            <p className="muted">Elige cómo comunicará la PWA con el guante.</p>
          </div>
          <div className="connection-options" role="radiogroup" aria-label="Tipo de conexión">
            <label className="radio-row">
              <input
                type="radio"
                name="connection-mode"
                value="wifi"
                checked={connectionMode === 'wifi'}
                onChange={() => setConnectionMode('wifi')}
              />
              <span>Wi-Fi</span>
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="connection-mode"
                value="bluetooth"
                checked={connectionMode === 'bluetooth'}
                onChange={() => setConnectionMode('bluetooth')}
              />
              <span>Bluetooth</span>
            </label>
          </div>
          {connectionMode === 'wifi' ? (
            <label className="control-row" htmlFor="glove-endpoint">
              <span>IP o nombre del guante</span>
              <input
                id="glove-endpoint"
                type="text"
                inputMode="url"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="http://192.168.1.50"
                autoComplete="off"
              />
            </label>
          ) : (
            <p className="muted">
              Se abrirá el selector de dispositivos del navegador. {isWebBluetoothAvailable()
                ? 'Este navegador parece compatible.'
                : 'Este navegador no ofrece Web Bluetooth; prueba Chrome o Edge.'}
            </p>
          )}
          {connectionMode === 'wifi' && (
            <p className="muted">
              La PWA y el guante deben estar en la misma red Wi-Fi. Puedes
              escribir una IP como <code>192.168.1.50</code>.
            </p>
          )}
        </article>
      )}

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
