import type { ReactNode } from 'react'
import { getEmojiAssetUrlFromToken } from './emojiAssets'

const INLINE_TOKEN_REGEX = /(https?:\/\/[^\s]+|\/(?:emoji-packs|msn-emoticons)\/[^\s]+|:[a-z0-9-]+:)/gi
const TRAILING_PUNCTUATION_REGEX = /[),.;:!?'"`]+$/

function isInlineEmojiAsset(token: string): boolean {
  if (getEmojiAssetUrlFromToken(token) !== null) return true
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
      const resolvedAsset = getEmojiAssetUrlFromToken(asset) ?? asset

      return (
        <span key={`emoji-${index}`}>
          <img
            src={resolvedAsset}
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
