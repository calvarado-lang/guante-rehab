import { create } from 'zustand'

const selectedProfileStorageKey = 'guante-rehab-selected-profile'

interface ProfileStore {
  selectedProfileId: string | null
  selectProfile: (profileId: string | null) => void
}

export const useProfileStore = create<ProfileStore>((set) => ({
  selectedProfileId: globalThis.localStorage?.getItem(selectedProfileStorageKey) ?? null,
  selectProfile: (profileId) => {
    if (profileId === null) {
      globalThis.localStorage?.removeItem(selectedProfileStorageKey)
    } else {
      globalThis.localStorage?.setItem(selectedProfileStorageKey, profileId)
    }
    set({ selectedProfileId: profileId })
  },
}))
