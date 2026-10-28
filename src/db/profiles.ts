import { db, type CalibrationRecord, type ProfileRecord, type RoutineRecord } from './schema'

export async function listProfiles(): Promise<ProfileRecord[]> {
  return db.profiles.orderBy('displayName').toArray()
}

export async function saveProfile(profile: ProfileRecord): Promise<void> {
  await db.profiles.put(profile)
}

export async function listCalibrations(profileId: string): Promise<CalibrationRecord[]> {
  const calibrations = await db.calibrations.where('profileId').equals(profileId).toArray()
  return calibrations.sort((a, b) => b.createdAt - a.createdAt)
}

export async function saveCalibration(calibration: CalibrationRecord): Promise<void> {
  await db.calibrations.put(calibration)
}

export async function getLatestCalibration(profileId: string): Promise<CalibrationRecord | undefined> {
  const calibrations = await listCalibrations(profileId)
  return calibrations[calibrations.length - 1]
}

export async function saveRoutine(routine: RoutineRecord): Promise<void> {
  await db.routines.put(routine)
}

export async function listRoutines(profileId: string): Promise<RoutineRecord[]> {
  const routines = await db.routines.where('profileId').equals(profileId).toArray()
  return routines.sort((a, b) => b.createdAt - a.createdAt)
}
