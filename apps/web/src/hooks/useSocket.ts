import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useContactsStore } from '../stores/contactsStore'
import type { Message, UserStatus } from '@winkd/types'

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

    const ws = new WebSocket(`${WS_URL}?token=${session.token}`)
    wsRef.current = ws

    ws.onmessage = (e: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(e.data) as {
          event: string
          payload: unknown
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
