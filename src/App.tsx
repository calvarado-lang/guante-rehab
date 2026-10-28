import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { isWebBluetoothAvailable } from './utils/browserSupport'
import { useEffect, useState } from 'react'
import { Calibracion } from './pages/Calibracion'
import { Conectar } from './pages/Conectar'
import { Historial } from './pages/Historial'
import { Sesion } from './pages/Sesion'

const navigation = [
  { to: '/', label: 'Conectar', end: true },
  { to: '/calibracion', label: 'Calibración', end: false },
  { to: '/sesion', label: 'Sesión', end: false },
  { to: '/historial', label: 'Historial', end: false },
]

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const storedTheme = globalThis.localStorage?.getItem('guante-rehab-theme')
    return storedTheme === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    globalThis.localStorage?.setItem('guante-rehab-theme', theme)
  }, [theme])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Rehabilitación adaptativa</p>
          <h1>Guante Rehab</h1>
        </div>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
            aria-label={`Cambiar a modo ${theme === 'light' ? 'oscuro' : 'claro'}`}
            aria-pressed={theme === 'dark'}
          >
            {theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
          </button>
      </header>

      {!isWebBluetoothAvailable() && (
        <div className="compatibility-notice" role="status">
          Web Bluetooth no está disponible en este navegador. La conexión por
          Wi-Fi sigue disponible; para Bluetooth usa Chrome o Edge compatible.
        </div>
      )}

      <main className="page-container">
        <Routes>
          <Route path="/" element={<Conectar />} />
          <Route path="/calibracion" element={<Calibracion />} />
          <Route path="/sesion" element={<Sesion />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="bottom-nav" aria-label="Navegación principal">
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              isActive ? 'nav-link nav-link-active' : 'nav-link'
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default App
