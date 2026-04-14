import { create } from 'zustand'
import type { Contact, UserStatus } from '@winkd/types'

export interface PendingInvitation {
  requestId: string
  fromWinkdId: string
  fromDisplayName: string
  fromAvatarData: string | null
}

export interface BlockedUser {
  userId: string
  winkdId: string
  displayName: string
  avatarData: string | null
  blockedAt: string
}

const DEMO_CONTACTS: Contact[] = []

interface ContactsState {
  contacts: Contact[]
  setContacts: (contacts: Contact[]) => void
  removeContact: (id: string) => void
  updateContact: (id: string, partial: Partial<Contact>) => void
  updateContactStatus: (id: string, status: UserStatus) => void
  addAcceptedContact: (contact: Contact) => void
  unreadCounts: Record<string, number>
  incrementUnread: (id: string) => void
  clearUnread: (id: string) => void
  pendingInvitations: PendingInvitation[]
  upsertPendingInvitation: (invitation: PendingInvitation) => void
  removePendingInvitation: (requestId: string) => void
  clearPendingFromUser: (winkdId: string) => void
  blockedUsers: BlockedUser[]
  setBlockedUsers: (blocked: BlockedUser[]) => void
  upsertBlockedUser: (blocked: BlockedUser) => void
  removeBlockedUser: (userId: string) => void
}

export const useContactsStore = create<ContactsState>((set) => ({
  contacts: DEMO_CONTACTS,

  setContacts: (contacts) => set({ contacts }),
  removeContact: (id) =>
    set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) })),

  updateContact: (id, partial) =>
    set((s) => ({
      contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...partial } : c)),
    })),

  updateContactStatus: (id, status) =>
    set((s) => ({
      contacts: s.contacts.map((c) => (c.id === id ? { ...c, status } : c)),
    })),

  addAcceptedContact: (contact) =>
    set((s) => {
      if (s.contacts.some((c) => c.id === contact.id)) {
        // Update existing contact (e.g. pending_outbound → accepted)
        return {
          contacts: s.contacts.map((c) =>
            c.id === contact.id ? { ...c, ...contact } : c,
          ),
        }
      }
      return { contacts: [...s.contacts, contact] }
    }),

  unreadCounts: {},

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

  pendingInvitations: [],

  upsertPendingInvitation: (invitation) =>
    set((s) => {
      const next = s.pendingInvitations.filter((i) => i.requestId !== invitation.requestId)
      next.push(invitation)
      return { pendingInvitations: next }
    }),

  removePendingInvitation: (requestId) =>
    set((s) => ({
      pendingInvitations: s.pendingInvitations.filter((i) => i.requestId !== requestId),
    })),

  clearPendingFromUser: (winkdId) =>
    set((s) => ({
      pendingInvitations: s.pendingInvitations.filter((i) => i.fromWinkdId !== winkdId),
    })),

  blockedUsers: [],

  setBlockedUsers: (blockedUsers) => set({ blockedUsers }),

  upsertBlockedUser: (blocked) =>
    set((s) => {
      const next = s.blockedUsers.filter((u) => u.userId !== blocked.userId)
      next.push(blocked)
      return { blockedUsers: next }
    }),

  removeBlockedUser: (userId) =>
    set((s) => ({
      blockedUsers: s.blockedUsers.filter((u) => u.userId !== userId),
    })),
}))
