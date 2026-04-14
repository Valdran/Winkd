import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useContactsStore } from '../stores/contactsStore'
import type { Message, UserStatus } from '@winkd/types'

// Connect without token in URL — the session token is sent as the first
// WebSocket message after the connection opens (first-message auth protocol).
const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export function useSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const session = useAuthStore((s) => s.session)
  const receiveMessage = useChatStore((s) => s.receiveMessage)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const updateContactStatus = useContactsStore((s) => s.updateContactStatus)
  const incrementUnread = useContactsStore((s) => s.incrementUnread)

  const send = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
    }
  }, [])

  useEffect(() => {
    if (!session) return

    // No token in URL — send it as the first message instead.
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    // Track whether the server has confirmed authentication.
    let authenticated = false

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token: session.token }))
    }

    ws.onmessage = (e: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(e.data) as { event?: string; type?: string; payload?: unknown }

        // First message from the server must be auth_ok.
        if (!authenticated) {
          if (envelope.type === 'auth_ok') {
            authenticated = true
          }
          // Ignore any other messages before auth is confirmed.
          return
        }

        if (envelope.event === 'message') {
          const msg = envelope.payload as Message
          receiveMessage(msg)
          if (
            msg.senderId !== session.profile.winkdId &&
            msg.conversationId !== activeConversationId
          ) {
            incrementUnread(msg.senderId)
          }
        } else if (envelope.event === 'presence') {
          const { userId, status } = envelope.payload as {
            userId: string
            status: UserStatus
          }
          updateContactStatus(userId, status)
        }
      } catch {
        // ignore malformed server messages
      }
    }

    ws.onclose = (e) => {
      wsRef.current = null
      // Code 4001 means the server rejected our session (expired / invalid).
      // The auth store should handle sign-out.
      if (e.code === 4001) {
        useAuthStore.getState().clearSession?.()
      }
    }

    ws.onerror = () => {
      wsRef.current = null
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
    // activeConversationId intentionally not in deps — we want the current
    // value at message receipt time, not to re-subscribe on every nav change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, receiveMessage, updateContactStatus, incrementUnread])

  return { send }
}
