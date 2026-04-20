import type { ReactNode } from 'react'

const INLINE_TOKEN_REGEX = /(https?:\/\/[^\s]+|\/(?:emoji-packs|msn-emoticons)\/[^\s]+)/gi

function isInlineEmojiAsset(token: string): boolean {
  const normalized = token.toLowerCase()
  return (
    /^\/emoji-packs\/.+\.(?:png|gif|webp)(?:\?|$)/.test(normalized) ||
    /^\/msn-emoticons\/.+\.(?:png|gif|webp)(?:\?|$)/.test(normalized) ||
    /^https?:\/\/github\.com\/bernzrdo\/msn-emoticons\/raw\/main\/original\/.+\.(?:png|gif|webp)(?:\?|$)/.test(
      normalized,
    ) ||
    /^https?:\/\/[^/\s]+\/(?:emoji-packs|msn-emoticons)\/.+\.(?:png|gif|webp)(?:\?|$)/.test(normalized)
  )
}

export function renderRichEmojiText(text: string, size = 16): ReactNode[] {
  const tokens = text.split(INLINE_TOKEN_REGEX)
  return tokens
    .filter((token) => token.length > 0)
    .map((token, index) => {
      if (!isInlineEmojiAsset(token)) return <span key={`text-${index}`}>{token}</span>

      return (
        <img
          key={`emoji-${index}`}
          src={token}
          alt="emoji"
          style={{
            width: size,
            height: size,
            verticalAlign: 'text-bottom',
            objectFit: 'contain',
            margin: '0 2px',
          }}
        />
      )
    })
}
