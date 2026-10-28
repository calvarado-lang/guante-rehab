import type {
  CalibrationRecord,
  ProfileRecord,
  RoutineRecord,
  RoutineRecommendation,
} from '../db/schema'
import { apiUrl, isRemoteApiConfigured, parseResponse, requestHeaders } from './client'

export interface NewProfile {
  id: string
  displayName: string
  patientCode: string
}

export async function listRemoteProfiles(): Promise<ProfileRecord[]> {
  const response = await fetch(apiUrl('/api/profiles'), { headers: requestHeaders() })
  return (await parseResponse(response)) as ProfileRecord[]
}

export async function saveRemoteProfile(profile: NewProfile): Promise<ProfileRecord> {
  const response = await fetch(apiUrl('/api/profiles'), {
    method: 'POST',
    headers: requestHeaders(),
    body: JSON.stringify(profile),
  })
  return (await parseResponse(response)) as ProfileRecord
}

export async function saveRemoteCalibration(
  profileId: string,
  calibration: Omit<CalibrationRecord, 'profileId' | 'createdAt'>,
): Promise<CalibrationRecord> {
  const response = await fetch(apiUrl(`/api/profiles/${profileId}/calibrations`), {
    method: 'POST',
    headers: requestHeaders(),
    body: JSON.stringify(calibration),
  })
  return (await parseResponse(response)) as CalibrationRecord
}

export async function getRemoteRecommendation(profileId: string): Promise<RoutineRecommendation> {
  const response = await fetch(apiUrl(`/api/profiles/${profileId}/routine-recommendation`), {
    headers: requestHeaders(),
  })
  return (await parseResponse(response)) as RoutineRecommendation
}

export async function saveRemoteRoutine(
  profileId: string,
  routine: Omit<RoutineRecord, 'profileId' | 'createdAt'>,
): Promise<RoutineRecord> {
  const response = await fetch(apiUrl(`/api/profiles/${profileId}/routines`), {
    method: 'POST',
    headers: requestHeaders(),
    body: JSON.stringify(routine),
  })
  return (await parseResponse(response)) as RoutineRecord
}

export { isRemoteApiConfigured }
