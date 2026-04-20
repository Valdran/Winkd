import type { ReactNode } from 'react'

const INLINE_TOKEN_REGEX = /(https?:\/\/[^\s]+|\/(?:emoji-packs|msn-emoticons)\/[^\s]+)/gi
const TRAILING_PUNCTUATION_REGEX = /[),.;:!?'"`]+$/

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

function splitInlineEmojiToken(rawToken: string): { asset: string | null; trailingText: string } {
  const trimmed = rawToken.trim()
  if (isInlineEmojiAsset(trimmed)) {
    return { asset: trimmed, trailingText: '' }
  }

  const withoutPunctuation = trimmed.replace(TRAILING_PUNCTUATION_REGEX, '')
  if (!withoutPunctuation || !isInlineEmojiAsset(withoutPunctuation)) {
    return { asset: null, trailingText: '' }
  }

  return {
    asset: withoutPunctuation,
    trailingText: trimmed.slice(withoutPunctuation.length),
  }
}

export function renderRichEmojiText(text: string, size = 16): ReactNode[] {
  const tokens = text.split(INLINE_TOKEN_REGEX)
  return tokens
    .filter((token) => token.length > 0)
    .map((token, index) => {
      const { asset, trailingText } = splitInlineEmojiToken(token)
      if (!asset) return <span key={`text-${index}`}>{token}</span>

      return (
        <span key={`emoji-${index}`}>
          <img
            src={asset}
            alt="emoji"
            style={{
              width: size,
              height: size,
              verticalAlign: 'text-bottom',
              objectFit: 'contain',
              margin: '0 2px',
            }}
          />
          {trailingText}
        </span>
      )
    })
}
