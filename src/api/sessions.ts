import type { SessionRecord } from '../db/schema'

const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
const deviceStorageKey = 'guante-rehab-device-id'

function getDeviceId(): string {
  const current = globalThis.localStorage?.getItem(deviceStorageKey)
  if (current !== undefined && current !== null && current.length > 0) {
    return current
  }

  const created = globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(16).slice(2)}`
  globalThis.localStorage?.setItem(deviceStorageKey, created)
  return created
}

function apiUrl(path: string): string {
  if (configuredApiUrl === undefined || configuredApiUrl.length === 0) {
    throw new Error('VITE_API_URL no está configurada.')
  }
  return `${configuredApiUrl}${path}`
}

function requestHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Device-Id': getDeviceId(),
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.ok) {
    return response.json()
  }
  const body = await response.text()
  throw new Error(body || `La API respondió con ${response.status}.`)
}

export function isRemoteApiConfigured(): boolean {
  return configuredApiUrl !== undefined && configuredApiUrl.length > 0
}

export async function saveRemoteSession(session: SessionRecord): Promise<SessionRecord> {
  const response = await fetch(apiUrl('/api/sessions'), {
    method: 'POST',
    headers: requestHeaders(),
    body: JSON.stringify(session),
  })
  return (await parseResponse(response)) as SessionRecord
}

export async function listRemoteSessions(): Promise<SessionRecord[]> {
  const response = await fetch(apiUrl('/api/sessions'), {
    headers: requestHeaders(),
  })
  return (await parseResponse(response)) as SessionRecord[]
}
