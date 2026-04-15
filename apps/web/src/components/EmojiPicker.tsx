import { useMemo, useState } from 'react'

const MSN_EMOTICON_BASE_URL =
  'https://github.com/bernzrdo/msn-emoticons/raw/main/original'

type EmojiItem =
  | { type: 'unicode'; value: string }
  | { type: 'classic'; name: string; filename: string }

interface Category {
  label: string
  emojis: EmojiItem[]
}

const classic = (name: string, filename: string): EmojiItem => ({
  type: 'classic',
  name,
  filename,
})

const unicode = (...values: string[]): EmojiItem[] =>
  values.map((value) => ({ type: 'unicode', value }))

const CATEGORIES: Category[] = [
  {
    label: 'Classic',
    emojis: [
      classic('Smile', 'smile'),
      classic('Open-mouthed smile', 'open-mouthed-smile'),
      classic('Winking smile', 'winking-smile'),
      classic('Surprised smile', 'surprised-smile'),
      classic('Smile with tongue out', 'smile-with-tongue-out'),
      classic('Hot smile', 'hot-smile'),
      classic('Angry smile', 'angry-smile'),
      classic('Embarrassed smile', 'embarrassed-smile'),
      classic('Confused smile', 'confused-smile'),
      classic('Sad smile', 'sad-smile'),
      classic('Crying face', 'crying-face'),
      classic('Disappointed smile', 'disappointed-smile'),
      classic('Devil', 'devil'),
      classic('Angel', 'angel'),
      classic('Red heart', 'red-heart'),
      classic('Broken heart', 'broken-heart'),
      classic('Messenger', 'messenger'),
      classic('Cat face', 'cat-face'),
      classic('Dog face', 'dog-face'),
      classic('Sleeping half-moon', 'sleeping-half-moon'),
      classic('Star', 'star'),
      classic('Filmstrip', 'filmstrip'),
      classic('Note', 'note'),
      classic('E-mail', 'e-mail'),
      classic('Red rose', 'red-rose'),
      classic('Wilted rose', 'wilted-rose'),
      classic('Clock', 'clock'),
      classic('Red lips', 'red-lips'),
      classic('Gift with a bow', 'gift-with-a-bow'),
      classic('Birthday cake', 'birthday-cake'),
      classic('Camera', 'camera'),
      classic('Light bulb', 'light-bulb'),
      classic('Coffee cup', 'coffee-cup'),
      classic('Telephone receiver', 'telephone-receiver'),
      classic('Left hug', 'left-hug'),
      classic('Right hug', 'right-hug'),
      classic('Beer mug', 'beer-mug'),
      classic('Martini glass', 'martini-glass'),
      classic('Boy', 'boy'),
      classic('Girl', 'girl'),
      classic('Thumbs up', 'thumbs-up'),
      classic('Thumbs down', 'thumbs-down'),
      classic('Vampire bat', 'vampire-bat'),
      classic('Goat', 'goat'),
      classic('Sun', 'sun'),
      classic('Rainbow', 'rainbow'),
      classic("Don't tell anyone smile", 'dont-tell-anyone-smile'),
      classic('Baring teeth smile', 'baring-teeth-smile'),
      classic('Nerd smile', 'nerd-smile'),
      classic('Sarcastic smile', 'sarcastic-smile'),
      classic('Secret telling smile', 'secret-telling-smile'),
      classic('Sick smile', 'sick-smile'),
      classic('Snail', 'snail'),
      classic('Turtle', 'turtle'),
      classic('Plate', 'plate'),
      classic('Bowl', 'bowl'),
      classic('Pizza', 'pizza'),
      classic('Soccer ball', 'soccer-ball'),
      classic('Auto', 'auto'),
      classic('Airplane', 'airplane'),
      classic('Umbrella', 'umbrella'),
      classic('Island with a palm tree', 'island-with-a-palm-tree'),
      classic('Computer', 'computer'),
      classic('Mobile phone', 'mobile-phone'),
      classic('Be right back', 'be-right-back'),
      classic('Storm cloud', 'storm-cloud'),
      classic('High five', 'high-five'),
      classic('Money', 'money'),
      classic('Black sheep', 'black-sheep'),
      classic("I don't know smile", 'i-dont-know-smile'),
      classic('Thinking smile', 'thinking-smile'),
      classic('Lightning', 'lightning'),
      classic('Party smile', 'party-smile'),
      classic('Eye-rolling smile', 'eye-rolling-smile'),
      classic('Sleepy smile', 'sleepy-smile'),
      classic('Bunny', 'bunny'),
    ],
  },
  {
    label: 'Smileys',
    emojis: unicode(
      '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊',
      '😋','😎','😍','🥰','😘','😗','😙','😚','🙂','🤗',
      '🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥',
      '😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜',
      '😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️',
      '🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨',
      '😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵',
      '🤠','🥴','😷','🤒','🤕','🤧','🥳','🥸','🤡','👹',
    ),
  },
  {
    label: 'Gestures',
    emojis: unicode(
      '👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉',
      '👆','🖕','👇','☝️','👋','🤚','🖐️','✋','🖖','👏',
      '🙌','🤲','🤝','🙏','✍️','💪','🦾','🦵','🦶','👂',
      '🦻','👃','👀','👁️','👅','👄','💋','🫀','🫁','🧠',
    ),
  },
  {
    label: 'Hearts',
    emojis: unicode(
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️',
      '✝️','☪️','🔯','♈','♉','♊','♋','♌','♍','♎',
    ),
  },
  {
    label: 'People',
    emojis: unicode(
      '👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓',
      '👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇',
      '🤦','🤷','💆','💇','🚶','🧍','🧎','🏃','💃','🕺',
      '👫','👬','👭','💑','💏','👪','🧑‍🤝‍🧑',
    ),
  },
  {
    label: 'Nature',
    emojis: unicode(
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
      '🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧',
      '🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄',
      '🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🦂',
      '🌸','🌼','🌻','🌹','🥀','🌷','🌱','🌿','☘️','🍀',
      '🎋','🎍','🍃','🍂','🍁','🍄','🌾','💐','🌲','🌳',
    ),
  },
  {
    label: 'Food',
    emojis: unicode(
      '🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍑','🍒','🍍',
      '🥭','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🧄',
      '🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚',
      '🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭',
      '🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔',
      '🥗','🍜','🍝','🍛','🍲','🍣','🍱','🥟','🦪','🍤',
      '☕','🫖','🍵','🧃','🥤','🧋','🍺','🍻','🥂','🍷',
    ),
  },
  {
    label: 'Activities',
    emojis: unicode(
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱',
      '🏓','🏸','🏒','🥅','⛳','🎿','🛷','🥌','🎯','🎱',
      '🎮','🎲','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁',
      '🎷','🎺','🎸','🪕','🎻','🎵','🎶','🎙️','📻','🎚️',
    ),
  },
  {
    label: 'Travel',
    emojis: unicode(
      '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐',
      '🛻','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🛹','🛼',
      '✈️','🚀','🛸','🚂','🚢','🛥️','🚁','🪂','🛶','⛵',
      '🌍','🌎','🌏','🗺️','🧭','🏔️','🌋','🗻','🏕️','🏖️',
    ),
  },
  {
    label: 'Objects',
    emojis: unicode(
      '💡','🔦','🕯️','💰','💵','💳','📱','💻','⌨️','🖥️',
      '🖨️','🖱️','💾','💿','📀','📷','📸','📹','🎥','📽️',
      '📞','☎️','📟','📠','📺','📻','🎙️','📡','🔋','🪫',
      '🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','📦','📫',
      '📮','🗳️','✏️','📝','📖','📚','📋','📅','📆','📇',
      '🗂️','🗒️','📰','📜','📄','📃','🗑️','🔒','🔓','🔑',
    ),
  },
  {
    label: 'Symbols',
    emojis: unicode(
      '✅','❌','❎','🔴','🟠','🟡','🟢','🔵','🟣','⚫',
      '⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘',
      '🔲','🔳','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧',
      '🟨','🟩','🟦','🟪','⬛','⬜','🔥','💧','🌊','⭐',
      '🌟','✨','💫','⚡','☁️','🌈','❄️','☃️','⛄','🌊',
      '🎉','🎊','🎈','🎀','🎁','🏆','🥇','🥈','🥉','🎖️',
    ),
  },
]

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose?: () => void
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const source = q
      ? CATEGORIES.flatMap((c) => c.emojis).filter((item) =>
          item.type === 'classic' ? item.name.toLowerCase().includes(q) : true,
        )
      : CATEGORIES[activeCategory]?.emojis ?? []
    return source
  }, [activeCategory, search])

  const getPreview = (item: EmojiItem) =>
    item.type === 'classic'
      ? `${MSN_EMOTICON_BASE_URL}/${item.filename}.png`
      : item.value

  const getInsertValue = (item: EmojiItem) =>
    item.type === 'classic' ? `${MSN_EMOTICON_BASE_URL}/${item.filename}.png ` : item.value

  return (
    <div
      style={{
        width: 280,
        borderRadius: 6,
        border: '1px solid rgba(100,150,220,0.45)',
        background:
          'linear-gradient(180deg, rgba(222,234,255,0.98) 0%, rgba(200,218,255,0.97) 100%)',
        boxShadow: '0 6px 24px rgba(0,0,50,0.35)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Segoe UI, Tahoma, Geneva, sans-serif',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
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
              width: 18,
              height: 18,
              borderRadius: 3,
              border: '1px solid rgba(100,150,220,0.4)',
              background: 'rgba(200,215,240,0.6)',
              cursor: 'pointer',
              fontSize: 10,
              lineHeight: 1,
              color: '#1a3a6a',
              padding: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

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
                width: 22,
                height: 22,
                borderRadius: 3,
                border:
                  idx === activeCategory
                    ? '1px solid rgba(26,90,204,0.5)'
                    : '1px solid transparent',
                background: idx === activeCategory ? 'rgba(26,90,204,0.15)' : 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
              }}
            >
              {cat.emojis[0]?.type === 'classic' ? (
                <img
                  src={getPreview(cat.emojis[0])}
                  alt={cat.label}
                  style={{ width: 16, height: 16, objectFit: 'contain' }}
                />
              ) : (
                (cat.emojis[0] as { type: 'unicode'; value: string }).value
              )}
            </button>
          ))}
        </div>
      )}

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
        {filtered.map((item, i) => (
          <button
            key={item.type === 'classic' ? item.filename : `${item.value}-${i}`}
            type="button"
            title={item.type === 'classic' ? item.name : item.value}
            onClick={() => onSelect(getInsertValue(item))}
            style={{
              width: '100%',
              aspectRatio: '1',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: 3,
              padding: 2,
              transition: 'background 0.08s',
              display: 'grid',
              placeItems: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(26,90,204,0.12)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            {item.type === 'classic' ? (
              <img
                src={getPreview(item)}
                alt={item.name}
                style={{ width: 18, height: 18, objectFit: 'contain' }}
                loading="lazy"
              />
            ) : (
              <span style={{ fontSize: 18, lineHeight: 1 }}>{item.value}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
