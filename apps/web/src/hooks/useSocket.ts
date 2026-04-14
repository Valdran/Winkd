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
  const upsertPendingInvitation = useContactsStore((s) => s.upsertPendingInvitation)
  const removePendingInvitation = useContactsStore((s) => s.removePendingInvitation)
  const clearPendingFromUser = useContactsStore((s) => s.clearPendingFromUser)
  const setBlockedUsers = useContactsStore((s) => s.setBlockedUsers)
  const upsertBlockedUser = useContactsStore((s) => s.upsertBlockedUser)
  const removeBlockedUser = useContactsStore((s) => s.removeBlockedUser)
  const addAcceptedContact = useContactsStore((s) => s.addAcceptedContact)

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
        } else if (envelope.event === 'contact_request') {
          const payload = envelope.payload as {
            request_id: string
            from_winkd_id: string
            from_display_name: string
            from_avatar_data?: string | null
          }
          upsertPendingInvitation({
            requestId: payload.request_id,
            fromWinkdId: payload.from_winkd_id,
            fromDisplayName: payload.from_display_name,
            fromAvatarData: payload.from_avatar_data ?? null,
          })
        } else if (envelope.event === 'contact_accepted') {
          const payload = envelope.payload as {
            winkd_id: string
            display_name: string
            avatar_data?: string | null
            mood_message?: string
          }
          clearPendingFromUser(payload.winkd_id)
          addAcceptedContact({
            id: payload.winkd_id,
            winkdId: payload.winkd_id as `${string}#${string}`,
            displayName: payload.display_name,
            moodMessage: payload.mood_message ?? '',
            status: 'online',
            avatarData: payload.avatar_data ?? null,
            requestStatus: 'accepted',
            unreadCount: 0,
            lastMessageAt: null,
          })
        } else if (envelope.event === 'contact_request_rejected') {
          const payload = envelope.payload as { request_id: string }
          removePendingInvitation(payload.request_id)
        } else if (envelope.event === 'blocked_list') {
          const payload = envelope.payload as {
            users: Array<{
              user_id: string
              winkd_id: string
              display_name: string
              avatar_data?: string | null
              blocked_at: string
            }>
          }
          setBlockedUsers(
            payload.users.map((u) => ({
              userId: u.user_id,
              winkdId: u.winkd_id,
              displayName: u.display_name,
              avatarData: u.avatar_data ?? null,
              blockedAt: u.blocked_at,
            })),
          )
        } else if (envelope.event === 'contact_blocked') {
          const payload = envelope.payload as {
            request_id?: string
            user_id: string
            winkd_id: string
            display_name: string
            avatar_data?: string | null
            blocked_at: string
          }
          if (payload.request_id) {
            removePendingInvitation(payload.request_id)
          }
          upsertBlockedUser({
            userId: payload.user_id,
            winkdId: payload.winkd_id,
            displayName: payload.display_name,
            avatarData: payload.avatar_data ?? null,
            blockedAt: payload.blocked_at,
          })
        } else if (envelope.event === 'contact_unblocked') {
          const payload = envelope.payload as { user_id: string }
          removeBlockedUser(payload.user_id)
        } else if (envelope.event === 'contact_request_sent') {
          // server confirmed the outgoing request was recorded; UI updated optimistically
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
        useAuthStore.getState().logout()
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
  }, [
    session,
    receiveMessage,
    updateContactStatus,
    incrementUnread,
    upsertPendingInvitation,
    removePendingInvitation,
    clearPendingFromUser,
    setBlockedUsers,
    upsertBlockedUser,
    removeBlockedUser,
    addAcceptedContact,
  ])

  return { send }
}
