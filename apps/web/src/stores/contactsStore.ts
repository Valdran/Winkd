import { create } from 'zustand'
import type { Contact, UserStatus } from '@winkd/types'

const DEMO_CONTACTS: Contact[] = [
  {
    id: 'neon#4821',
    winkdId: 'neon#4821' as `${string}#${string}`,
    displayName: 'neonpulse',
    moodMessage: '☕ vibing rn',
    status: 'online',
    avatarData: null,
    requestStatus: 'accepted',
    unreadCount: 0,
    lastMessageAt: null,
  },
  {
    id: 'pixel#0042',
    winkdId: 'pixel#0042' as `${string}#${string}`,
    displayName: 'pixelcat',
    moodMessage: 'working on stuff',
    status: 'away',
    avatarData: null,
    requestStatus: 'accepted',
    unreadCount: 2,
    lastMessageAt: null,
  },
  {
    id: 'void#1337',
    winkdId: 'void#1337' as `${string}#${string}`,
    displayName: 'voidwalker',
    moodMessage: '😴 do not disturb',
    status: 'busy',
    avatarData: null,
    requestStatus: 'accepted',
    unreadCount: 0,
    lastMessageAt: null,
  },
  {
    id: 'echo#2222',
    winkdId: 'echo#2222' as `${string}#${string}`,
    displayName: 'echo_chamber',
    moodMessage: 'back later',
    status: 'online',
    avatarData: null,
    requestStatus: 'accepted',
    unreadCount: 0,
    lastMessageAt: null,
  },
  {
    id: 'crystal#9999',
    winkdId: 'crystal#9999' as `${string}#${string}`,
    displayName: 'crystal_clear',
    moodMessage: '',
    status: 'invisible',
    avatarData: null,
    requestStatus: 'accepted',
    unreadCount: 0,
    lastMessageAt: null,
  },
]

interface ContactsState {
  contacts: Contact[]
  setContacts: (contacts: Contact[]) => void
  updateContact: (id: string, partial: Partial<Contact>) => void
  updateContactStatus: (id: string, status: UserStatus) => void
  unreadCounts: Record<string, number>
  incrementUnread: (id: string) => void
  clearUnread: (id: string) => void
}

export const useContactsStore = create<ContactsState>((set) => ({
  contacts: DEMO_CONTACTS,

  setContacts: (contacts) => set({ contacts }),

  updateContact: (id, partial) =>
    set((s) => ({
      contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...partial } : c)),
    })),

  updateContactStatus: (id, status) =>
    set((s) => ({
      contacts: s.contacts.map((c) => (c.id === id ? { ...c, status } : c)),
    })),

  unreadCounts: { 'pixel#0042': 2 },

  incrementUnread: (id) =>
    set((s) => ({
      unreadCounts: { ...s.unreadCounts, [id]: (s.unreadCounts[id] ?? 0) + 1 },
    })),

  clearUnread: (id) =>
    set((s) => {
      const updated = { ...s.unreadCounts }
      delete updated[id]
      return { unreadCounts: updated }
    }),
}))
