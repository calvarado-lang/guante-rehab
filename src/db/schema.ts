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
  startedAt: number
  endedAt: number
  durationMs: number
  mode: Mode
  assistLevel: number
  stats: SessionStats
  samples: SessionSample[]
}

class RehabDatabase extends Dexie {
  sessions!: Table<SessionRecord, number>

  constructor() {
    super('guante-rehab')
    this.version(1).stores({
      sessions: '++id, startedAt, mode, assistLevel',
    })
  }
}

export const db = new RehabDatabase()
