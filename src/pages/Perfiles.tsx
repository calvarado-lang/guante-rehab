import { useEffect, useState } from 'react'
import { isRemoteApiConfigured, listRemoteProfiles, saveRemoteProfile } from '../api/profiles'
import { listProfiles, saveProfile } from '../db/profiles'
import type { ProfileRecord } from '../db/schema'
import { useProfileStore } from '../store/profileStore'

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function mergeProfiles(localProfiles: ProfileRecord[], remoteProfiles: ProfileRecord[]): ProfileRecord[] {
  const profiles = new Map<string, ProfileRecord>()
  localProfiles.forEach((profile) => profiles.set(profile.id, profile))
  remoteProfiles.forEach((profile) => profiles.set(profile.id, profile))
  return Array.from(profiles.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export function Perfiles() {
  const selectedProfileId = useProfileStore((state) => state.selectedProfileId)
  const selectProfile = useProfileStore((state) => state.selectProfile)
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [displayName, setDisplayName] = useState('')
  const [patientCode, setPatientCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const localProfiles = await listProfiles()
      let remoteProfiles: ProfileRecord[] = []
      if (isRemoteApiConfigured()) {
        try {
          remoteProfiles = await listRemoteProfiles()
          await Promise.all(remoteProfiles.map((profile) => saveProfile(profile)))
        } catch {
          // La lista local sigue disponible si la API no responde.
        }
      }
      const merged = mergeProfiles(localProfiles, remoteProfiles)
      if (cancelled) {
        return
      }
      setProfiles(merged)
      if (selectedProfileId === null && merged.length > 0) {
        selectProfile(merged[0].id)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [selectedProfileId, selectProfile])

  const handleCreate = async () => {
    const cleanName = displayName.trim()
    const cleanCode = patientCode.trim()
    if (!cleanName || !cleanCode) {
      setErrorMessage('Escribe el nombre y el código del perfil.')
      return
    }

    const now = Date.now()
    const profile: ProfileRecord = {
      id: newId(),
      displayName: cleanName,
      patientCode: cleanCode,
      createdAt: now,
      updatedAt: now,
    }
    await saveProfile(profile)
    if (isRemoteApiConfigured()) {
      try {
        const remoteProfile = await saveRemoteProfile({
          id: profile.id,
          displayName: profile.displayName,
          patientCode: profile.patientCode,
        })
        await saveProfile(remoteProfile)
      } catch {
        setErrorMessage('Perfil guardado localmente; no fue posible sincronizarlo con la nube.')
      }
    }
    setProfiles((current) => mergeProfiles(current, [profile]))
    selectProfile(profile.id)
    setDisplayName('')
    setPatientCode('')
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Personas</p>
          <h2>Perfiles</h2>
        </div>
        <span className="status-pill status-idle">{profiles.length} perfiles</span>
      </div>

      {errorMessage !== null && <p className="error-message" role="alert">{errorMessage}</p>}

      <article className="card profile-form">
        <h3>Nuevo perfil</h3>
        <div className="form-grid">
          <label>
            Nombre visible
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Juan Pérez" />
          </label>
          <label>
            Código interno
            <input value={patientCode} onChange={(event) => setPatientCode(event.target.value)} placeholder="PAC-0001" />
          </label>
        </div>
        <button className="primary-button" type="button" onClick={() => void handleCreate()}>Crear perfil</button>
      </article>

      {loading && <article className="card empty-state"><h3>Cargando perfiles…</h3></article>}
      {!loading && profiles.length === 0 && (
        <article className="card empty-state">
          <h3>Aún no hay perfiles</h3>
          <p className="muted">Crea un perfil antes de calibrar o iniciar un ejercicio.</p>
        </article>
      )}
      <div className="profile-list">
        {profiles.map((profile) => (
          <article className={`card profile-card ${profile.id === selectedProfileId ? 'profile-card-active' : ''}`} key={profile.id}>
            <div>
              <p className="info-label">{profile.patientCode}</p>
              <h3>{profile.displayName}</h3>
            </div>
            <button
              className={profile.id === selectedProfileId ? 'secondary-button' : 'primary-button'}
              type="button"
              onClick={() => selectProfile(profile.id)}
            >
              {profile.id === selectedProfileId ? 'Perfil activo' : 'Seleccionar'}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
