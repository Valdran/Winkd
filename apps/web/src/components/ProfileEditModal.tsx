import { useState, useRef, useEffect } from 'react'
import { EmojiPicker } from './EmojiPicker'

interface ProfileEditModalProps {
  displayName: string
  moodMessage: string
  onSave: (displayName: string, moodMessage: string) => void
  onClose: () => void
}

export function ProfileEditModal({
  displayName,
  moodMessage,
  onSave,
  onClose,
}: ProfileEditModalProps) {
  // Split existing mood into a leading emoji + text body.
  // We detect a leading emoji by checking if the first character is in the emoji range.
  const splitMood = (full: string): { emoji: string; text: string } => {
    const match = full.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)\s*/u)
    if (match) {
      return { emoji: match[1]!, text: full.slice(match[0].length) }
    }
    return { emoji: '', text: full }
  }

  const initial = splitMood(moodMessage)

  const [name, setName] = useState(displayName)
  const [moodEmoji, setMoodEmoji] = useState(initial.emoji)
  const [moodText, setMoodText] = useState(initial.text)
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close picker when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    if (showPicker) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const handleSave = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    const fullMood = moodEmoji
      ? `${moodEmoji} ${moodText.trim()}`
      : moodText.trim()
    onSave(trimmedName, fullMood)
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    height: 26,
    borderRadius: 3,
    border: '1px solid rgba(100,150,220,0.5)',
    background: 'rgba(255,255,255,0.92)',
    padding: '0 8px',
    fontSize: 12,
    color: '#1a2a40',
    outline: 'none',
    fontFamily: 'Segoe UI, Tahoma, Geneva, sans-serif',
    boxShadow: 'inset 0 1px 3px rgba(0,0,60,0.08)',
  }

  return (
    /* Backdrop */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseDown={onClose}
    >
      {/* Modal panel */}
      <div
        style={{
          width: 300,
          borderRadius: '8px 8px 4px 4px',
          overflow: 'visible',
          boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.2)',
          fontFamily: 'Segoe UI, Tahoma, Geneva, sans-serif',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Titlebar */}
        <div
          style={{
            height: 28,
            background: 'linear-gradient(180deg, #3a7ad4 0%, #1a5acc 42%, #0f3d9a 100%)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 10,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute', inset: '0 0 50% 0',
              background: 'rgba(255,255,255,0.14)', pointerEvents: 'none',
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', zIndex: 1 }}>
            Edit Profile
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: 'auto', marginRight: 6, zIndex: 1,
              width: 16, height: 16, borderRadius: 3,
              border: '1px solid rgba(180,40,40,0.6)',
              background: 'linear-gradient(180deg, #e06060 0%, #c03030 100%)',
              color: '#fff', fontSize: 9, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '14px 16px 16px',
            background: 'linear-gradient(180deg, rgba(222,234,255,0.97) 0%, rgba(200,218,255,0.95) 100%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* Display name */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#1a2a40', display: 'block', marginBottom: 3 }}>
              Display Name
            </label>
            <input
              type="text"
              value={name}
              maxLength={64}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Mood message */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#1a2a40', display: 'block', marginBottom: 3 }}>
              Mood Message
            </label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', position: 'relative' }}>
              {/* Emoji prefix button */}
              <div ref={pickerRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  title="Pick an emoji"
                  onClick={() => setShowPicker((v) => !v)}
                  style={{
                    width: 28, height: 26,
                    borderRadius: 3,
                    border: '1px solid rgba(100,150,220,0.5)',
                    background: showPicker
                      ? 'rgba(26,90,204,0.15)'
                      : 'rgba(255,255,255,0.85)',
                    cursor: 'pointer',
                    fontSize: moodEmoji ? 15 : 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: moodEmoji ? undefined : 'rgba(100,140,190,0.7)',
                  }}
                >
                  {moodEmoji || '😊'}
                </button>

                {/* Floating emoji picker */}
                {showPicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 30, left: 0,
                      zIndex: 10,
                    }}
                  >
                    <EmojiPicker
                      onSelect={(emoji) => {
                        setMoodEmoji(emoji)
                        setShowPicker(false)
                      }}
                      onClose={() => setShowPicker(false)}
                    />
                  </div>
                )}
              </div>

              {/* Mood text */}
              <input
                type="text"
                value={moodText}
                maxLength={98}
                placeholder="What's on your mind…"
                onChange={(e) => setMoodText(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}
              />

              {/* Clear emoji button */}
              {moodEmoji && (
                <button
                  type="button"
                  title="Remove emoji"
                  onClick={() => setMoodEmoji('')}
                  style={{
                    flexShrink: 0, width: 18, height: 18, borderRadius: 3,
                    border: '1px solid rgba(100,150,220,0.35)',
                    background: 'rgba(200,215,240,0.6)',
                    cursor: 'pointer', fontSize: 9,
                    color: '#1a3a6a', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Preview */}
            <div style={{ marginTop: 5, fontSize: 10, color: 'rgba(30,60,120,0.55)', fontStyle: 'italic' }}>
              Preview: {moodEmoji ? `${moodEmoji} ${moodText.trim() || '…'}` : moodText.trim() || '(no mood)'}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 2 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: 26, padding: '0 12px', borderRadius: 3,
                border: '1px solid rgba(100,150,220,0.4)',
                background: 'rgba(200,215,240,0.6)',
                fontSize: 11, color: '#1a3a6a', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim()}
              style={{
                height: 26, padding: '0 14px', borderRadius: 3,
                border: '1px solid #0a3a8a',
                background: name.trim()
                  ? 'linear-gradient(180deg, #2060c0 0%, #1450a0 100%)'
                  : 'rgba(100,140,200,0.3)',
                fontSize: 11, fontWeight: 700,
                color: name.trim() ? '#fff' : 'rgba(140,175,225,0.5)',
                cursor: name.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
