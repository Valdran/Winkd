import { useState, useRef, useEffect } from 'react'
import { Avatar } from '@winkd/ui'
import { useAuthStore } from '../stores/authStore'
import { useContactsStore } from '../stores/contactsStore'
import { useChatStore } from '../stores/chatStore'
import { MessageBubble } from './MessageBubble'
import { WinkdToolbar } from './WinkdToolbar'
import { StatusBar } from './StatusBar'
import { EmojiPicker } from './EmojiPicker'

interface ChatWindowProps {
  send: (payload: object) => void
}

export function ChatWindow({ send }: ChatWindowProps) {
  const session = useAuthStore((s) => s.session)
  const contacts = useContactsStore((s) => s.contacts)
  const { activeConversationId, conversations, sendText, sendWinkd, sendNudge, clearShaking } =
    useChatStore()

  const [inputValue, setInputValue] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const conversation = activeConversationId ? conversations[activeConversationId] : null
  const contact = conversation
    ? contacts.find((c) => c.id === conversation.contactId)
    : null

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation?.messages.length])

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false)
      }
    }
    if (showEmojiPicker) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showEmojiPicker])

  // Clear shake flag after animation completes
  useEffect(() => {
    if (!conversation?.isShaking) return
    const id = conversation.id
    const timer = setTimeout(() => clearShaking(id), 700)
    return () => clearTimeout(timer)
  }, [conversation?.isShaking, conversation?.id, clearShaking])

  if (!conversation || !contact || !session) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(170,205,255,0.3)',
          gap: 12,
          background:
            'linear-gradient(180deg, rgba(15,40,110,0.55) 0%, rgba(6,22,65,0.65) 100%)',
        }}
      >
        <img
          src="https://i.imgur.com/cg6eejI.png"
          alt="Winkd"
          style={{ width: 44, height: 44, opacity: 0.25 }}
        />
        <span style={{ fontSize: 13 }}>Select a contact to start chatting</span>
      </div>
    )
  }

  const handleSend = () => {
    const body = inputValue.trim()
    if (!body) return
    sendText(conversation.id, session.profile.winkdId, body, send)
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className={conversation.isShaking ? 'winkd-shake' : undefined}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background:
          'linear-gradient(180deg, rgba(18,48,120,0.58) 0%, rgba(6,22,65,0.68) 100%)',
      }}
    >
      {/* Contact header */}
      <div
        style={{
          padding: '7px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.09)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(255,255,255,0.035)',
          flexShrink: 0,
        }}
      >
        <Avatar
          displayName={contact.displayName}
          avatarData={contact.avatarData}
          status={contact.status}
          size={40}
        />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#e8f4ff' }}>
            {contact.displayName}
          </div>
          {contact.moodMessage && (
            <div style={{ fontSize: 10, color: 'rgba(190,215,255,0.5)' }}>
              {contact.moodMessage}
            </div>
          )}
        </div>
      </div>

      {/* Action toolbar */}
      <WinkdToolbar
        onWinkd={() => sendWinkd(conversation.id, session.profile.winkdId, send)}
        onNudge={() => sendNudge(conversation.id, session.profile.winkdId, send)}
        onWinks={() => { /* Phase 4 */ }}
        onEmoticons={() => setShowEmojiPicker((v) => !v)}
      />

      {/* Message history */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {conversation.messages.length === 0 && (
          <div
            style={{
              margin: 'auto',
              fontSize: 11,
              color: 'rgba(170,205,255,0.3)',
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            Say hi to {contact.displayName}! 👋
          </div>
        )}
        {conversation.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMe={msg.senderId === session.profile.winkdId}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.09)',
          padding: '7px 10px',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          background: 'rgba(255,255,255,0.025)',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {/* Emoji picker popup */}
        {showEmojiPicker && (
          <div
            ref={emojiPickerRef}
            style={{ position: 'absolute', bottom: '100%', left: 10, zIndex: 50, marginBottom: 4 }}
          >
            <EmojiPicker
              onSelect={(emoji) => {
                setInputValue((v) => v + emoji)
                inputRef.current?.focus()
              }}
              onClose={() => setShowEmojiPicker(false)}
            />
          </div>
        )}

        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${contact.displayName}…`}
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            borderRadius: 4,
            border: '1px solid rgba(100,150,220,0.5)',
            background: 'rgba(255,255,255,0.92)',
            padding: '5px 8px',
            fontSize: 12,
            lineHeight: 1.4,
            outline: 'none',
            color: '#1a2a40',
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim()}
          style={{
            height: 34,
            padding: '0 14px',
            borderRadius: 4,
            border: '1px solid #0a3a8a',
            background: inputValue.trim()
              ? 'linear-gradient(180deg, #2060c0 0%, #1450a0 100%)'
              : 'rgba(80,120,180,0.3)',
            color: inputValue.trim() ? '#fff' : 'rgba(140,175,225,0.45)',
            fontWeight: 700,
            fontSize: 12,
            cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>

      <StatusBar isEncrypted />
    </div>
  )
}
