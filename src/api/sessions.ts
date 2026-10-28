import type { SessionRecord } from '../db/schema'
import { apiUrl, isRemoteApiConfigured, parseResponse, requestHeaders } from './client'

export { isRemoteApiConfigured }

export async function saveRemoteSession(session: SessionRecord): Promise<SessionRecord> {
  const response = await fetch(apiUrl('/api/sessions'), {
    method: 'POST',
    headers: requestHeaders(),
    body: JSON.stringify(session),
  })
  return (await parseResponse(response)) as SessionRecord
}

export async function listRemoteSessions(profileId?: string | null): Promise<SessionRecord[]> {
  const query = profileId === undefined || profileId === null
    ? ''
    : `?profile_id=${encodeURIComponent(profileId)}`
  const response = await fetch(apiUrl(`/api/sessions${query}`), {
    headers: requestHeaders(),
  })
  return (await parseResponse(response)) as SessionRecord[]
}
