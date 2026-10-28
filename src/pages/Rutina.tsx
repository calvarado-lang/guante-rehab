import { useEffect, useState } from 'react'
import {
  getRemoteRecommendation,
  isRemoteApiConfigured,
  listRemoteRoutines,
  saveRemoteRoutine,
} from '../api/profiles'
import { listCalibrations, listProfiles, listRoutines, saveRoutine } from '../db/profiles'
import type { ProfileRecord, RoutineRecord, RoutineRecommendation } from '../db/schema'
import { useProfileStore } from '../store/profileStore'

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `routine-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function localRecommendation(
  profileId: string,
  movementRanges: Array<readonly number[]>,
  lastCalibrationAt: number | null,
): RoutineRecommendation {
  const averageValues = [0, 1, 2, 3, 4].map((index) => {
    const values = movementRanges.map((range) => Number(range[index] ?? 0))
    return Number((values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)).toFixed(2))
  })
  const [thumb, index, middle, ring, little] = averageValues
  const averageMovementRange: RoutineRecommendation['averageMovementRange'] = [thumb ?? 0, index ?? 0, middle ?? 0, ring ?? 0, little ?? 0]
  return {
    profileId,
    calibrationCount: movementRanges.length,
    averageMovementRange,
    lastCalibrationAt,
    suggestedMode: 4,
    suggestedAssistLevel: 50,
    suggestedRepetitions: 5,
    suggestedRestSeconds: 30,
    requiresApproval: true,
  }
}

function mergeRoutines(localRoutines: RoutineRecord[], remoteRoutines: RoutineRecord[]): RoutineRecord[] {
  const routines = new Map<string, RoutineRecord>()
  localRoutines.forEach((routine) => routines.set(routine.id, routine))
  remoteRoutines.forEach((routine) => routines.set(routine.id, routine))
  return Array.from(routines.values()).sort((a, b) => b.createdAt - a.createdAt)
}

function buildRoutine(profileId: string, recommendation: RoutineRecommendation): RoutineRecord {
  return {
    id: newId(),
    profileId,
    name: `Adaptación ${new Date().toLocaleDateString('es-MX')}`,
    targetMovementRange: recommendation.averageMovementRange,
    mode: recommendation.suggestedMode,
    assistLevel: recommendation.suggestedAssistLevel,
    repetitions: recommendation.suggestedRepetitions,
    restSeconds: recommendation.suggestedRestSeconds,
    steps: [{
      name: 'Movimiento adaptativo',
      mode: recommendation.suggestedMode,
      assistLevel: recommendation.suggestedAssistLevel,
      repetitions: recommendation.suggestedRepetitions,
      restSeconds: recommendation.suggestedRestSeconds,
      targetMovementRange: recommendation.averageMovementRange,
    }],
    status: 'proposed',
    createdAt: Date.now(),
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('es-MX')
}

export function Rutina() {
  const profileId = useProfileStore((state) => state.selectedProfileId)
  const [profile, setProfile] = useState<ProfileRecord | null>(null)
  const [routines, setRoutines] = useState<RoutineRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (profileId === null) {
        if (!cancelled) {
          setProfile(null)
          setRoutines([])
          setLoading(false)
        }
        return
      }

      setLoading(true)
      const profiles = await listProfiles()
      const currentProfile = profiles.find((item) => item.id === profileId) ?? null
      const localRoutines = await listRoutines(profileId)
      let remoteRoutines: RoutineRecord[] = []
      if (isRemoteApiConfigured()) {
        try {
          remoteRoutines = await listRemoteRoutines(profileId)
          await Promise.all(remoteRoutines.map((routine) => saveRoutine(routine)))
        } catch {
          // La copia local sigue disponible si la API no responde.
        }
      }
      let mergedRoutines = mergeRoutines(localRoutines, remoteRoutines)

      let recommendation: RoutineRecommendation
      try {
        if (isRemoteApiConfigured()) {
          recommendation = await getRemoteRecommendation(profileId)
        } else {
          throw new Error('API remota no configurada')
        }
      } catch {
        const calibrations = await listCalibrations(profileId)
        const recentCalibrations = calibrations.slice(0, 3)
        recommendation = localRecommendation(
          profileId,
          recentCalibrations.map((item) => item.movementRange),
          recentCalibrations[0]?.createdAt ?? null,
        )
      }

      const latestRoutine = mergedRoutines[0]
      const needsNewRoutine = recommendation.calibrationCount > 0
        && recommendation.lastCalibrationAt !== null
        && (latestRoutine === undefined || latestRoutine.createdAt < recommendation.lastCalibrationAt)

      if (needsNewRoutine) {
        const routine = buildRoutine(profileId, recommendation)
        await saveRoutine(routine)
        mergedRoutines = mergeRoutines([routine], mergedRoutines)
        if (isRemoteApiConfigured()) {
          try {
            const remoteRoutine = await saveRemoteRoutine(profileId, routine)
            await saveRoutine(remoteRoutine)
            mergedRoutines = mergeRoutines([remoteRoutine], mergedRoutines)
            setMessage('Rutina adaptada guardada automáticamente para la siguiente sesión.')
          } catch {
            setMessage('Rutina adaptada guardada localmente; se sincronizará cuando la API responda.')
          }
        } else {
          setMessage('Rutina adaptada guardada para la siguiente sesión.')
        }
      }

      if (!cancelled) {
        setProfile(currentProfile)
        setRoutines(mergedRoutines)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profileId])

  if (profileId === null || profile === null) {
    return (
      <section className="page-stack">
        <div className="page-heading"><div><p className="eyebrow">Adaptación</p><h2>Rutinas</h2></div></div>
        <article className="card empty-state"><h3>Selecciona un perfil</h3><p className="muted">Las rutinas se guardan y se muestran por perfil.</p></article>
      </section>
    )
  }

  const currentRoutine = routines[0]

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div><p className="eyebrow">Adaptación</p><h2>Rutinas de {profile.displayName}</h2></div>
        <span className="status-pill status-idle">Solo consulta</span>
      </div>
      {message !== null && <p className="success-message" role="status">{message}</p>}
      {loading && <article className="card empty-state"><h3>Calculando rutina adaptada…</h3></article>}
      {!loading && currentRoutine === undefined && (
        <article className="card empty-state"><h3>Falta una calibración</h3><p className="muted">Completa una calibración para generar la rutina del perfil.</p></article>
      )}
      {!loading && currentRoutine !== undefined && (
        <>
          <article className="card routine-card routine-card-current">
            <div className="chart-heading">
              <div><p className="info-label">Siguiente sesión</p><h3>{currentRoutine.name}</h3></div>
              <span className="status-pill status-conectado">Guardada</span>
            </div>
            <p className="muted">Valores calculados automáticamente con la calibración del perfil. No son editables desde esta pantalla.</p>
            <div className="info-grid routine-values-grid">
              <div className="info-item"><span className="info-label">Asistencia</span><strong>{currentRoutine.assistLevel}%</strong></div>
              <div className="info-item"><span className="info-label">Modo</span><strong>{currentRoutine.mode === 4 ? 'Adaptativo' : currentRoutine.mode}</strong></div>
              <div className="info-item"><span className="info-label">Repeticiones</span><strong>{currentRoutine.repetitions}</strong></div>
              <div className="info-item"><span className="info-label">Descanso</span><strong>{currentRoutine.restSeconds} s</strong></div>
            </div>
            <p className="info-label routine-target-label">Rango objetivo por dedo</p>
            <div className="info-grid routine-range-grid">
              {currentRoutine.targetMovementRange.map((value, index) => <div className="info-item" key={index}><span className="info-label">Dedo {index + 1}</span><strong>{Math.round(value)}</strong></div>)}
            </div>
            <p className="muted">Guardada: {formatDate(currentRoutine.createdAt)}</p>
          </article>

          {routines.length > 1 && (
            <article className="card">
              <h3>Rutinas anteriores</h3>
              <div className="routine-history-list">
                {routines.slice(1).map((routine) => (
                  <div className="routine-history-row" key={routine.id}>
                    <div><strong>{routine.name}</strong><span className="muted">{formatDate(routine.createdAt)}</span></div>
                    <span className="status-pill status-idle">Asistencia {routine.assistLevel}%</span>
                  </div>
                ))}
              </div>
            </article>
          )}
        </>
      )}
    </section>
  )
}
