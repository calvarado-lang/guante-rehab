import { useEffect, useState } from 'react'
import { getRemoteRecommendation, isRemoteApiConfigured, saveRemoteRoutine } from '../api/profiles'
import { listCalibrations, listProfiles, saveRoutine } from '../db/profiles'
import type { ProfileRecord, RoutineRecord, RoutineRecommendation } from '../db/schema'
import { useProfileStore } from '../store/profileStore'

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `routine-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function localRecommendation(profileId: string, movementRanges: Array<readonly number[]>): RoutineRecommendation {
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
    lastCalibrationAt: movementRanges.length === 0 ? null : Date.now(),
    suggestedMode: 4,
    suggestedAssistLevel: 50,
    suggestedRepetitions: 5,
    suggestedRestSeconds: 30,
    requiresApproval: true,
  }
}

export function Rutina() {
  const profileId = useProfileStore((state) => state.selectedProfileId)
  const [profile, setProfile] = useState<ProfileRecord | null>(null)
  const [recommendation, setRecommendation] = useState<RoutineRecommendation | null>(null)
  const [assistOverride, setAssistOverride] = useState<number | null>(null)
  const [repetitionsOverride, setRepetitionsOverride] = useState<number | null>(null)
  const [restOverride, setRestOverride] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (profileId === null) {
        if (!cancelled) {
          setProfile(null)
          setRecommendation(null)
        }
        return
      }
      const profiles = await listProfiles()
      if (cancelled) {
        return
      }
      setProfile(profiles.find((item) => item.id === profileId) ?? null)
      try {
        if (isRemoteApiConfigured()) {
          const remoteRecommendation = await getRemoteRecommendation(profileId)
          if (!cancelled) {
            setRecommendation(remoteRecommendation)
          }
          return
        }
      } catch {
        // Usa la copia local si el backend no responde.
      }
      const calibrations = await listCalibrations(profileId)
      if (!cancelled) {
        setRecommendation(localRecommendation(profileId, calibrations.slice(0, 3).map((item) => item.movementRange)))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profileId])

  const assistLevel = assistOverride ?? recommendation?.suggestedAssistLevel ?? 50
  const repetitions = repetitionsOverride ?? recommendation?.suggestedRepetitions ?? 5
  const restSeconds = restOverride ?? recommendation?.suggestedRestSeconds ?? 30

  const handleSave = async () => {
    if (profileId === null || recommendation === null) {
      return
    }
    const routine: RoutineRecord = {
      id: newId(),
      profileId,
      name: `Adaptación ${new Date().toLocaleDateString('es-MX')}`,
      targetMovementRange: recommendation.averageMovementRange,
      mode: recommendation.suggestedMode,
      assistLevel,
      repetitions,
      restSeconds,
      steps: [{
        name: 'Movimiento adaptativo',
        mode: recommendation.suggestedMode,
        assistLevel,
        repetitions,
        restSeconds,
        targetMovementRange: recommendation.averageMovementRange,
      }],
      status: 'proposed',
      createdAt: Date.now(),
    }
    await saveRoutine(routine)
    if (isRemoteApiConfigured()) {
      try {
        const remoteRoutine = await saveRemoteRoutine(profileId, routine)
        await saveRoutine(remoteRoutine)
      } catch {
        setMessage('Propuesta guardada localmente; no fue posible sincronizarla.')
        return
      }
    }
    setMessage('Propuesta guardada. Requiere aprobación antes de ejecutarse.')
  }

  if (profileId === null || profile === null) {
    return (
      <section className="page-stack">
        <div className="page-heading"><div><p className="eyebrow">Adaptación</p><h2>Rutina</h2></div></div>
        <article className="card empty-state"><h3>Selecciona un perfil</h3><p className="muted">La rutina se calcula a partir de sus calibraciones.</p></article>
      </section>
    )
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div><p className="eyebrow">Adaptación</p><h2>Rutina de {profile.displayName}</h2></div>
        <span className="status-pill status-idle">Propuesta</span>
      </div>
      {message !== null && <p className="success-message" role="status">{message}</p>}
      {recommendation === null || recommendation.calibrationCount === 0 ? (
        <article className="card empty-state"><h3>Falta una calibración</h3><p className="muted">Completa una calibración para calcular la línea base por dedo.</p></article>
      ) : (
        <>
          <article className="card">
            <h3>Línea base promedio</h3>
            <p className="muted">Promedio de las últimas {recommendation.calibrationCount} calibraciones. Es una propuesta y debe revisarse antes de ejecutarse.</p>
            <div className="info-grid routine-range-grid">
              {recommendation.averageMovementRange.map((value, index) => <div className="info-item" key={index}><span className="info-label">Dedo {index + 1}</span><strong>{Math.round(value)}</strong></div>)}
            </div>
          </article>
          <article className="card session-controls">
            <div className="control-row control-range"><label htmlFor="routine-assist">Asistencia inicial <strong>{assistLevel}%</strong></label><input id="routine-assist" type="range" min="0" max="100" value={assistLevel} onChange={(event) => setAssistOverride(Number(event.target.value))} /></div>
            <div className="form-grid">
              <label>Repeticiones<input type="number" min="1" max="100" value={repetitions} onChange={(event) => setRepetitionsOverride(Number(event.target.value))} /></label>
              <label>Descanso (segundos)<input type="number" min="0" max="600" value={restSeconds} onChange={(event) => setRestOverride(Number(event.target.value))} /></label>
            </div>
            <button className="primary-button" type="button" onClick={() => void handleSave()}>Guardar propuesta</button>
          </article>
        </>
      )}
    </section>
  )
}
