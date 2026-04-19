import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OwnProfile } from '@winkd/types'

interface Session {
  token: string
  profile: OwnProfile
  supporter: SupporterState
}

export interface SupporterState {
  tier: 'free' | 'plus'
  purchasedExtras: string[]
  buddyCap: number | null
  buddyUsed: number
  groupChatUnlocked: boolean
  supporterExpiresAt: string | null
}

interface AuthState {
  session: Session | null
  login: (token: string, profile: OwnProfile) => void
  logout: () => void
  updateProfile: (partial: Partial<OwnProfile>) => void
  setSupporterState: (partial: Partial<SupporterState>) => void
}

const defaultSupporterState: SupporterState = {
  tier: 'free',
  purchasedExtras: [],
  buddyCap: null,
  buddyUsed: 0,
  groupChatUnlocked: false,
  supporterExpiresAt: null,
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,

      login: (token, profile) =>
        set({ session: { token, profile, supporter: { ...defaultSupporterState } } }),

      logout: () => set({ session: null }),

      updateProfile: (partial) => {
        const { session } = get()
        if (!session) return
        set({ session: { ...session, profile: { ...session.profile, ...partial } } })
      },

      setSupporterState: (partial) => {
        const { session } = get()
        if (!session) return
        set({
          session: {
            ...session,
            supporter: { ...session.supporter, ...partial },
          },
        })
      },
    }),
    { name: 'winkd-auth' },
  ),
)
