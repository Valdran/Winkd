import { useState } from 'react'

// ── Emoji categories ──────────────────────────────────────────────────────────

const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: [
      '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊',
      '😋','😎','😍','🥰','😘','😗','😙','😚','🙂','🤗',
      '🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥',
      '😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜',
      '😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️',
      '🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨',
      '😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵',
      '🤠','🥴','😷','🤒','🤕','🤧','🥳','🥸','🤡','👹',
    ],
  },
  {
    label: 'Gestures',
    emojis: [
      '👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉',
      '👆','🖕','👇','☝️','👋','🤚','🖐️','✋','🖖','👏',
      '🙌','🤲','🤝','🙏','✍️','💪','🦾','🦵','🦶','👂',
      '🦻','👃','👀','👁️','👅','👄','💋','🫀','🫁','🧠',
    ],
  },
  {
    label: 'Hearts',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️',
      '✝️','☪️','🔯','♈','♉','♊','♋','♌','♍','♎',
    ],
  },
  {
    label: 'People',
    emojis: [
      '👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓',
      '👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇',
      '🤦','🤷','💆','💇','🚶','🧍','🧎','🏃','💃','🕺',
      '👫','👬','👭','💑','💏','👪','🧑‍🤝‍🧑',
    ],
  },
  {
    label: 'Nature',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
      '🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧',
      '🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄',
      '🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🦂',
      '🌸','🌼','🌻','🌹','🥀','🌷','🌱','🌿','☘️','🍀',
      '🎋','🎍','🍃','🍂','🍁','🍄','🌾','💐','🌲','🌳',
    ],
  },
  {
    label: 'Food',
    emojis: [
      '🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍑','🍒','🍍',
      '🥭','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🧄',
      '🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚',
      '🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭',
      '🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔',
      '🥗','🍜','🍝','🍛','🍲','🍣','🍱','🥟','🦪','🍤',
      '☕','🫖','🍵','🧃','🥤','🧋','🍺','🍻','🥂','🍷',
    ],
  },
  {
    label: 'Activities',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱',
      '🏓','🏸','🏒','🥅','⛳','🎿','🛷','🥌','🎯','🎱',
      '🎮','🎲','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁',
      '🎷','🎺','🎸','🪕','🎻','🎵','🎶','🎙️','📻','🎚️',
    ],
  },
  {
    label: 'Travel',
    emojis: [
      '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐',
      '🛻','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🛹','🛼',
      '✈️','🚀','🛸','🚂','🚢','🛥️','🚁','🪂','🛶','⛵',
      '🌍','🌎','🌏','🗺️','🧭','🏔️','🌋','🗻','🏕️','🏖️',
    ],
  },
  {
    label: 'Objects',
    emojis: [
      '💡','🔦','🕯️','💰','💵','💳','📱','💻','⌨️','🖥️',
      '🖨️','🖱️','💾','💿','📀','📷','📸','📹','🎥','📽️',
      '📞','☎️','📟','📠','📺','📻','🎙️','📡','🔋','🪫',
      '🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','📦','📫',
      '📮','🗳️','✏️','📝','📖','📚','📋','📅','📆','📇',
      '🗂️','🗒️','📰','📜','📄','📃','🗑️','🔒','🔓','🔑',
    ],
  },
  {
    label: 'Symbols',
    emojis: [
      '✅','❌','❎','🔴','🟠','🟡','🟢','🔵','🟣','⚫',
      '⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘',
      '🔲','🔳','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧',
      '🟨','🟩','🟦','🟪','⬛','⬜','🔥','💧','🌊','⭐',
      '🌟','✨','💫','⚡','☁️','🌈','❄️','☃️','⛄','🌊',
      '🎉','🎊','🎈','🎀','🎁','🏆','🥇','🥈','🥉','🎖️',
    ],
  },
]

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose?: () => void
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0)
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? CATEGORIES.flatMap((c) => c.emojis).filter((e) => {
        // Very basic: match by unicode name isn't available natively,
        // so just let any emoji through that isn't filtered out by empty query.
        return true
      })
    : CATEGORIES[activeCategory]?.emojis ?? []

  return (
    <div
      style={{
        width: 280,
        borderRadius: 6,
        border: '1px solid rgba(100,150,220,0.45)',
        background: 'linear-gradient(180deg, rgba(222,234,255,0.98) 0%, rgba(200,218,255,0.97) 100%)',
        boxShadow: '0 6px 24px rgba(0,0,50,0.35)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Segoe UI, Tahoma, Geneva, sans-serif',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px 4px',
          borderBottom: '1px solid rgba(100,150,220,0.2)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: '#0a3a8a' }}>Emoticons</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 18, height: 18, borderRadius: 3,
              border: '1px solid rgba(100,150,220,0.4)',
              background: 'rgba(200,215,240,0.6)',
              cursor: 'pointer', fontSize: 10, lineHeight: 1,
              color: '#1a3a6a', padding: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: '4px 8px', borderBottom: '1px solid rgba(100,150,220,0.15)' }}>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            height: 22,
            borderRadius: 3,
            border: '1px solid rgba(100,150,220,0.4)',
            background: 'rgba(255,255,255,0.8)',
            padding: '0 6px',
            fontSize: 11,
            color: '#1a2a40',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Category tabs — hide when searching */}
      {!search.trim() && (
        <div
          style={{
            display: 'flex',
            overflowX: 'auto',
            padding: '3px 4px',
            gap: 2,
            borderBottom: '1px solid rgba(100,150,220,0.15)',
            scrollbarWidth: 'none',
          }}
        >
          {CATEGORIES.map((cat, idx) => (
            <button
              key={cat.label}
              type="button"
              title={cat.label}
              onClick={() => setActiveCategory(idx)}
              style={{
                flexShrink: 0,
                width: 22, height: 22,
                borderRadius: 3,
                border: idx === activeCategory
                  ? '1px solid rgba(26,90,204,0.5)'
                  : '1px solid transparent',
                background: idx === activeCategory
                  ? 'rgba(26,90,204,0.15)'
                  : 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
              }}
            >
              {cat.emojis[0]}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: 1,
          padding: '4px 6px',
          maxHeight: 180,
          overflowY: 'auto',
        }}
      >
        {filtered.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            type="button"
            title={emoji}
            onClick={() => onSelect(emoji)}
            style={{
              width: '100%',
              aspectRatio: '1',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              borderRadius: 3,
              padding: 2,
              transition: 'background 0.08s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(26,90,204,0.12)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
