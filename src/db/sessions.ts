import { db, type SessionRecord } from './schema'

export async function saveSession(session: SessionRecord): Promise<number> {
  return db.sessions.add(session)
}

export async function listSessions(profileId?: string | null): Promise<SessionRecord[]> {
  const sessions = await db.sessions.orderBy('startedAt').reverse().toArray()
  return profileId === undefined || profileId === null
    ? sessions
    : sessions.filter((session) => session.profileId === profileId)
}

export async function getSession(id: number): Promise<SessionRecord | undefined> {
  return db.sessions.get(id)
}

export function exportSessionCsv(session: SessionRecord): string {
  const header = 'timestamp,flex_pulgar,flex_indice,flex_medio,flex_anular,flex_menique,emg,fsr'
  const rows = session.samples.map((sample) => [
    new Date(sample.timestamp).toISOString(),
    ...sample.flex,
    sample.emgEnvelope,
    sample.fsr,
  ].join(','))
  return [header, ...rows].join('\n')
}
