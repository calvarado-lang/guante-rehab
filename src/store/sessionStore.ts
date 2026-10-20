import { create } from 'zustand'
import type { Mode } from '../ble/gattSpec'

export type SessionStatus = 'inactiva' | 'activa' | 'emergencia'

interface SessionStore {
  status: SessionStatus
  mode: Mode
  assistLevel: number
  startedAt: number | null
  heartbeatCounter: number
  errorMessage: string | null
  start: () => void
  stop: () => void
  emergencyStop: () => void
  setMode: (mode: Mode) => void
  setAssistLevel: (level: number) => void
  incrementHeartbeat: () => number
  setError: (message: string | null) => void
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  status: 'inactiva',
  mode: 0,
  assistLevel: 50,
  startedAt: null,
  heartbeatCounter: 0,
  errorMessage: null,

  start: () => set({
    status: 'activa',
    startedAt: Date.now(),
    heartbeatCounter: 0,
    errorMessage: null,
  }),
  stop: () => set({ status: 'inactiva', startedAt: null }),
  emergencyStop: () => set({
    status: 'emergencia',
    startedAt: null,
    errorMessage: 'Paro de emergencia activado. Verifica el guante antes de continuar.',
  }),
  setMode: (mode) => set({ mode }),
  setAssistLevel: (level) => set({ assistLevel: Math.max(0, Math.min(100, level)) }),
  incrementHeartbeat: () => {
    const counter = (get().heartbeatCounter + 1) & 0xff
    set({ heartbeatCounter: counter })
    return counter
  },
  setError: (message) => set({ errorMessage: message }),
}))
