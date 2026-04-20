import { useState, useRef, useEffect } from 'react'
import { Avatar } from '@winkd/ui'
import { useAuthStore } from '../stores/authStore'
import { useContactsStore } from '../stores/contactsStore'
import { useChatStore } from '../stores/chatStore'
import { MessageBubble } from './MessageBubble'
import { WinkdToolbar } from './WinkdToolbar'
import { StatusBar } from './StatusBar'
import { EmojiPicker } from './EmojiPicker'
import { renderRichEmojiText } from './RichEmojiText'

interface ChatWindowProps {
  send: (payload: object) => void
}

const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'jar', 'vbs', 'vbe', 'js', 'jse', 'wsf',
  'wsh', 'ps1', 'psm1', 'hta', 'reg', 'scf', 'lnk', 'dll', 'sys', 'iso', 'img', 'apk', 'app',
  'dmg', 'pkg', 'deb', 'rpm', 'sh',
])

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024

function fileExtension(fileName: string): string {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : ''
}

export function ChatWindow({ send }: ChatWindowProps) {
  const session = useAuthStore((s) => s.session)
  const contacts = useContactsStore((s) => s.contacts)
  const {
    activeConversationId,
    conversations,
    sendText,
    sendAttachment,
    sendWinkd,
    sendNudge,
    clearShaking,
  } =
    useChatStore()

  const [inputValue, setInputValue] = useState('')
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

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

  const handleFilePick = () => {
    setAttachmentError(null)
    fileInputRef.current?.click()
  }

  const handlePhotoPick = () => {
    setAttachmentError(null)
    photoInputRef.current?.click()
  }

  const handleAttachmentSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFile = event.target.files?.[0]
    event.target.value = ''
    if (!pickedFile) return

    const extension = fileExtension(pickedFile.name)
    if (BLOCKED_ATTACHMENT_EXTENSIONS.has(extension)) {
      setAttachmentError('This file type is blocked for safety. Executables and scripts are not allowed.')
      return
    }

    if (pickedFile.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentError('File is too large. Current attachment limit is 3 MB.')
      return
    }

    try {
      const mediaData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new Error('Unable to read file'))
        reader.readAsDataURL(pickedFile)
      })

      sendAttachment(
        conversation.id,
        session.profile.winkdId,
        {
          mediaData,
          mediaName: pickedFile.name,
          mediaMime: pickedFile.type || 'application/octet-stream',
          mediaSize: pickedFile.size,
          body: inputValue.trim() || `📎 ${pickedFile.name}`,
        },
        send,
      )
      setInputValue('')
      setAttachmentError(null)
    } catch {
      setAttachmentError('Could not read that file. Try again.')
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
              {renderRichEmojiText(contact.moodMessage, 13)}
            </div>
          )}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={() => send({ command: 'block_user', payload: { winkd_id: contact.winkdId } })}
            style={{
              height: 24,
              borderRadius: 4,
              border: '1px solid rgba(255,110,110,0.6)',
              background: 'rgba(180,65,65,0.28)',
              color: '#ffd0d0',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              padding: '0 8px',
            }}
          >
            Block User
          </button>
        </div>
      </div>

      {/* Action toolbar */}
      <WinkdToolbar
        onWinkd={() => sendWinkd(conversation.id, session.profile.winkdId, send)}
        onNudge={() => sendNudge(conversation.id, session.profile.winkdId, send)}
        onWinks={() => { /* Phase 4 */ }}
        onEmoticons={() => setShowEmojiPicker((v) => !v)}
        onFormat={() => setAttachmentError('Text formatting controls are not hooked up in this React view yet.')}
        onBackground={() => setAttachmentError('Chat background picker is available in app.html and will be wired here next.')}
        onDraw={() => setAttachmentError('Draw & send is available in app.html and will be wired here next.')}
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
          background: 'rgba(255,255,255,0.025)',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {/* Current user's own mood — updates live from authStore */}
        <div
          style={{
            padding: '4px 12px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Avatar
            displayName={session.profile.displayName}
            avatarData={session.profile.avatarData}
            status={session.profile.status}
            size={18}
          />
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(200,220,255,0.55)' }}>
            {session.profile.displayName}
          </span>
          {session.profile.moodMessage && (
            <span style={{ fontSize: 10, color: 'rgba(170,200,255,0.35)', fontStyle: 'italic' }}>
              — {renderRichEmojiText(session.profile.moodMessage, 13)}
            </span>
          )}
        </div>

        <div
          style={{
            padding: '5px 10px 7px',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleAttachmentSelect}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.csv,.txt,.rtf,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.mp3,.wav,.zip"
          style={{ display: 'none' }}
        />
        <input
          ref={photoInputRef}
          type="file"
          onChange={handleAttachmentSelect}
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
        />
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
        {inputValue.trim() && (
          <div
            style={{
              position: 'absolute',
              left: 18,
              right: 88,
              bottom: 12,
              pointerEvents: 'none',
              fontSize: 11,
              color: 'rgba(26,42,64,0.85)',
              background: 'rgba(255,255,255,0.72)',
              borderRadius: 4,
              padding: '2px 6px',
              border: '1px dashed rgba(100,150,220,0.35)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Preview: {renderRichEmojiText(inputValue, 14)}
          </div>
        )}
        <button
          type="button"
          onClick={handlePhotoPick}
          style={{
            height: 34,
            width: 34,
            borderRadius: 4,
            border: '1px solid rgba(100,150,220,0.5)',
            background: 'linear-gradient(180deg, rgba(236,245,255,0.95) 0%, rgba(208,226,250,0.88) 100%)',
            color: '#1a2a40',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            flexShrink: 0,
            lineHeight: 1,
          }}
          title="Take photo"
        >
          📷
        </button>
        <button
          type="button"
          onClick={handleFilePick}
          style={{
            height: 34,
            width: 34,
            borderRadius: 4,
            border: '1px solid rgba(100,150,220,0.5)',
            background: 'linear-gradient(180deg, rgba(236,245,255,0.95) 0%, rgba(208,226,250,0.88) 100%)',
            color: '#1a2a40',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            flexShrink: 0,
            lineHeight: 1,
          }}
          title="Attach file"
        >
          📁
        </button>
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
        <div
          style={{
            padding: '0 12px 7px',
            fontSize: 10,
            color: attachmentError ? '#ffb5b5' : 'rgba(185,210,255,0.75)',
            lineHeight: 1.35,
          }}
        >
          {attachmentError
            ? `⚠️ ${attachmentError}`
            : '⚠️ Attachments can contain malware. Only open files from people you trust. Office docs may require download + local viewer (LibreOffice / ONLYOFFICE).'}
        </div>
      </div>

      <StatusBar isEncrypted />
    </div>
  )
}
