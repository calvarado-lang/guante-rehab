import { useEffect, useState } from 'react'
import { exportSessionCsv, listSessions } from '../db/sessions'
import type { SessionRecord } from '../db/schema'
import { isRemoteApiConfigured, listRemoteSessions } from '../api/sessions'
import { useProfileStore } from '../store/profileStore'

function formatDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000)
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

function downloadCsv(session: SessionRecord): void {
  const blob = new Blob([exportSessionCsv(session)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `guante-rehab-${session.id ?? 'sesion'}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function Historial() {
  const selectedProfileId = useProfileStore((state) => state.selectedProfileId)
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    void (async () => {
      const localRecords = await listSessions(selectedProfileId)
      let records = localRecords

      if (isRemoteApiConfigured()) {
        try {
          const remoteRecords = await listRemoteSessions(selectedProfileId)
          const merged = new Map<string, SessionRecord>()
          remoteRecords.forEach((record) => merged.set(`${record.startedAt}-${record.endedAt}`, record))
          localRecords.forEach((record) => merged.set(`${record.startedAt}-${record.endedAt}`, record))
          records = Array.from(merged.values()).sort((a, b) => b.startedAt - a.startedAt)
        } catch {
          // El historial local permanece disponible si la API no responde.
        }
      }

      if (isMounted) {
        setSessions(records)
        setLoading(false)
      }
    })()
    return () => {
      isMounted = false
    }
  }, [selectedProfileId])

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{isRemoteApiConfigured() ? 'Datos locales y nube' : 'Datos locales'}</p>
          <h2>Historial</h2>
        </div>
        <span className="status-pill status-idle">{sessions.length} sesiones</span>
      </div>

      {loading && <article className="card empty-state"><h3>Cargando historial…</h3></article>}
      {!loading && sessions.length === 0 && (
        <article className="card empty-state">
          <div className="empty-icon" aria-hidden="true">▤</div>
          <h3>Aún no hay sesiones guardadas</h3>
          <p className="muted">Las sesiones completadas se guardarán localmente en este dispositivo.</p>
        </article>
      )}
      <div className="history-list">
        {sessions.map((session) => (
          <article className="card history-card" key={session.id}>
            <div>
              <p className="info-label">{new Date(session.startedAt).toLocaleString('es-MX')}</p>
              <h3>{formatDuration(session.durationMs)} · Asistencia {session.assistLevel}%</h3>
              <p className="muted">EMG máximo: {Math.round(session.stats.emgMaximum)} · Paquetes perdidos: {session.stats.lostPackets}</p>
            </div>
            <div className="history-actions">
              <button className="secondary-button" type="button" onClick={() => setSelectedSession(session)}>Detalle</button>
              <button className="secondary-button" type="button" onClick={() => downloadCsv(session)}>CSV</button>
            </div>
          </article>
        ))}
      </div>
      {selectedSession !== null && (
        <article className="card history-detail">
          <div className="chart-heading">
            <h3>Detalle de sesión</h3>
            <button className="secondary-button" type="button" onClick={() => setSelectedSession(null)}>Cerrar</button>
          </div>
          <div className="info-grid">
            <div className="info-item"><span className="info-label">EMG promedio</span><strong>{Math.round(selectedSession.stats.emgAverage)}</strong></div>
            <div className="info-item"><span className="info-label">Muestras</span><strong>{selectedSession.samples.length}</strong></div>
          </div>
          <p className="muted">Rango de movimiento: {selectedSession.stats.movementRange.map(Math.round).join(' · ')}</p>
        </article>
      )}
    </section>
  )
}
