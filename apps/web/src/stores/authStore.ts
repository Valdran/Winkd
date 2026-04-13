import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OwnProfile } from '@winkd/types'

interface Session {
  token: string
  profile: OwnProfile
}

interface AuthState {
  session: Session | null
  login: (token: string, profile: OwnProfile) => void
  logout: () => void
  updateProfile: (partial: Partial<OwnProfile>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,

      login: (token, profile) => set({ session: { token, profile } }),

      logout: () => set({ session: null }),

      updateProfile: (partial) => {
        const { session } = get()
        if (!session) return
        set({ session: { ...session, profile: { ...session.profile, ...partial } } })
      },
    }),
    { name: 'winkd-auth' },
  ),
)
