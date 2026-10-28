import Dexie, { type Table } from 'dexie'
import type { Mode } from '../ble/gattSpec'
import type { FlexValues } from '../ble/types'

export interface SessionStats {
  emgAverage: number
  emgMaximum: number
  movementRange: FlexValues
  lostPackets: number
}

export interface SessionSample {
  timestamp: number
  flex: FlexValues
  emgEnvelope: number
  fsr: number
}

export interface SessionRecord {
  id?: number
  profileId?: string
  calibrationId?: string
  routineId?: string
  exerciseName?: string
  startedAt: number
  endedAt: number
  durationMs: number
  mode: Mode
  assistLevel: number
  stats: SessionStats
  samples: SessionSample[]
}

export interface ProfileRecord {
  id: string
  displayName: string
  patientCode: string
  createdAt: number
  updatedAt: number
}

export interface CalibrationRecord {
  id: string
  profileId: string
  flexionMin: FlexValues
  flexionMax: FlexValues
  movementRange: FlexValues
  emgBaseline: number
  emgMvc: number
  sampleCount: number
  notes?: string | null
  createdAt: number
}

export interface RoutineStep {
  name: string
  mode: Mode
  assistLevel: number
  repetitions: number
  restSeconds: number
  targetMovementRange: FlexValues
}

export type RoutineStatus = 'proposed' | 'approved' | 'archived'

export interface RoutineRecord {
  id: string
  profileId: string
  name: string
  targetMovementRange: FlexValues
  mode: Mode
  assistLevel: number
  repetitions: number
  restSeconds: number
  steps: RoutineStep[]
  status: RoutineStatus
  createdAt: number
}

export interface RoutineRecommendation {
  profileId: string
  calibrationCount: number
  averageMovementRange: FlexValues
  lastCalibrationAt: number | null
  suggestedMode: Mode
  suggestedAssistLevel: number
  suggestedRepetitions: number
  suggestedRestSeconds: number
  requiresApproval: boolean
}

class RehabDatabase extends Dexie {
  sessions!: Table<SessionRecord, number>
  profiles!: Table<ProfileRecord, string>
  calibrations!: Table<CalibrationRecord, string>
  routines!: Table<RoutineRecord, string>

  constructor() {
    super('guante-rehab')
    this.version(1).stores({
      sessions: '++id, startedAt, mode, assistLevel',
    })
    this.version(2).stores({
      sessions: '++id, startedAt, mode, assistLevel, profileId',
      profiles: 'id, displayName, patientCode, createdAt',
      calibrations: 'id, profileId, createdAt',
      routines: 'id, profileId, createdAt, status',
    })
  }
}

export const db = new RehabDatabase()
