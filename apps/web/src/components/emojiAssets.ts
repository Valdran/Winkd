const MSN_EMOTICON_BASE_URL =
  'https://github.com/bernzrdo/msn-emoticons/raw/main/original'

const CLASSIC_TOKEN_PREFIX = ':classic-'
const SPIKEY_TOKEN_PREFIX = ':spikey-'

export function getEmojiAssetUrlFromToken(token: string): string | null {
  const normalized = token.trim().toLowerCase()
  if (!/^:[a-z0-9-]+:$/.test(normalized)) return null

  if (normalized.startsWith(CLASSIC_TOKEN_PREFIX) && normalized.endsWith(':')) {
    const slug = normalized.slice(CLASSIC_TOKEN_PREFIX.length, -1)
    return slug ? `${MSN_EMOTICON_BASE_URL}/${slug}.png` : null
  }

  if (normalized.startsWith(SPIKEY_TOKEN_PREFIX) && normalized.endsWith(':')) {
    const slug = normalized.slice(SPIKEY_TOKEN_PREFIX.length, -1)
    return slug ? `/emoji-packs/spikey/${slug}.png` : null
  }

  return null
}

