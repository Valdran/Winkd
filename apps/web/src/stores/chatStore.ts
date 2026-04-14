import { create } from 'zustand'
import type { Message, TextMessage, WinkdMessage, NudgeMessage } from '@winkd/types'

interface Conversation {
  id: string
  contactId: string
  messages: Message[]
  isShaking: boolean
}

interface ChatState {
  conversations: Record<string, Conversation>
  activeConversationId: string | null
  openConversation: (contactId: string) => void
  closeConversation: () => void
  sendText: (
    conversationId: string,
    senderId: string,
    body: string,
    send: (p: object) => void,
  ) => void
  sendWinkd: (
    conversationId: string,
    senderId: string,
    send: (p: object) => void,
  ) => void
  sendNudge: (
    conversationId: string,
    senderId: string,
    send: (p: object) => void,
  ) => void
  receiveMessage: (message: Message) => void
  clearShaking: (conversationId: string) => void
}

const mkId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: {},
  activeConversationId: null,

  openConversation: (contactId) => {
    set((s) => {
      const existing = Object.values(s.conversations).find(
        (c) => c.contactId === contactId,
      )
      if (existing) return { activeConversationId: existing.id }
      const id = contactId
      return {
        conversations: {
          ...s.conversations,
          [id]: { id, contactId, messages: [], isShaking: false },
        },
        activeConversationId: id,
      }
    })
  },

  closeConversation: () => set({ activeConversationId: null }),

  sendText: (conversationId, senderId, body, send) => {
    const msg: TextMessage = {
      id: mkId(),
      conversationId,
      senderId,
      type: 'text',
      body,
      sentAt: nowIso(),
      delivered: false,
      read: false,
    }
    set((s) => ({
      conversations: {
        ...s.conversations,
        [conversationId]: {
          ...s.conversations[conversationId]!,
          messages: [...(s.conversations[conversationId]?.messages ?? []), msg],
        },
      },
    }))
    send({ command: 'send_message', payload: msg })
  },

  sendWinkd: (conversationId, senderId, send) => {
    const msg: WinkdMessage = {
      id: mkId(),
      conversationId,
      senderId,
      type: 'winkd',
      sentAt: nowIso(),
      delivered: false,
      read: false,
    }
    set((s) => ({
      conversations: {
        ...s.conversations,
        [conversationId]: {
          ...s.conversations[conversationId]!,
          messages: [...(s.conversations[conversationId]?.messages ?? []), msg],
        },
      },
    }))
    send({ command: 'send_message', payload: msg })
  },

  sendNudge: (conversationId, senderId, send) => {
    const msg: NudgeMessage = {
      id: mkId(),
      conversationId,
      senderId,
      type: 'nudge',
      sentAt: nowIso(),
      delivered: false,
      read: false,
    }
    set((s) => ({
      conversations: {
        ...s.conversations,
        [conversationId]: {
          ...s.conversations[conversationId]!,
          messages: [...(s.conversations[conversationId]?.messages ?? []), msg],
        },
      },
    }))
    send({ command: 'send_message', payload: msg })
  },

  receiveMessage: (message) => {
    const conv = get().conversations[message.conversationId]
    const existingMessages = conv?.messages ?? []
    const existingIndex = existingMessages.findIndex((m) => m.id === message.id)
    const nextMessages =
      existingIndex >= 0
        ? existingMessages.map((m, i) => (i === existingIndex ? { ...m, ...message } : m))
        : [...existingMessages, message]

    set((s) => ({
      conversations: {
        ...s.conversations,
        [message.conversationId]: {
          id: message.conversationId,
          contactId: conv?.contactId ?? message.senderId,
          messages: nextMessages,
          isShaking: message.type === 'winkd',
        },
      },
    }))
  },

  clearShaking: (conversationId) => {
    set((s) => ({
      conversations: {
        ...s.conversations,
        [conversationId]: {
          ...s.conversations[conversationId]!,
          isShaking: false,
        },
      },
    }))
  },
}))
