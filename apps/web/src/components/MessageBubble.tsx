import type { Message } from '@winkd/types'
import { renderRichEmojiText } from './RichEmojiText'
import { getEmojiAssetUrlFromToken } from './emojiAssets'

const URL_REGEX = /(https?:\/\/[^\s]+|\/(?:emoji-packs|msn-emoticons)\/[^\s]+|:[a-z0-9-]+:)/g
const TRAILING_PUNCTUATION_REGEX = /[),.;:!?'"`]+$/

function isImageAssetUrl(rawUrl: string): boolean {
  if (getEmojiAssetUrlFromToken(rawUrl) !== null) return true
  const normalized = rawUrl.toLowerCase()
  return (
    /(\.gif|\.webp|\.png|\.jpg|\.jpeg)(\?|$)/.test(normalized) ||
    normalized.includes('/media')
  )
}

function shouldHideCompanionGifLink(rawUrl: string): boolean {
  return /https?:\/\/(?:www\.)?(?:giphy\.com|tenor\.com)\//i.test(rawUrl)
}

function isInlineEmojiAsset(rawUrl: string): boolean {
  if (getEmojiAssetUrlFromToken(rawUrl) !== null) return true
  const normalized = rawUrl.toLowerCase()
  return (
    normalized.startsWith('/emoji-packs/') ||
    normalized.startsWith('/msn-emoticons/') ||
    normalized.includes('/emoji-packs/') ||
    normalized.includes('/msn-emoticons/') ||
    normalized.includes('/msn-emoticons/raw/main/original/')
  )
}

function splitInlineEmojiToken(rawUrl: string): { asset: string | null; trailingText: string } {
  const trimmed = rawUrl.trim()
  if (isInlineEmojiAsset(trimmed) && isImageAssetUrl(trimmed)) {
    return { asset: trimmed, trailingText: '' }
  }

  const withoutPunctuation = trimmed.replace(TRAILING_PUNCTUATION_REGEX, '')
  if (!withoutPunctuation || !isInlineEmojiAsset(withoutPunctuation) || !isImageAssetUrl(withoutPunctuation)) {
    return { asset: null, trailingText: '' }
  }

  return {
    asset: withoutPunctuation,
    trailingText: trimmed.slice(withoutPunctuation.length),
  }
}

interface MessageBubbleProps {
  message: Message
  isMe: boolean
}

function formatBytes(bytes?: number): string {
  if (!bytes || Number.isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function MessageBubble({ message, isMe }: MessageBubbleProps) {
  if (message.type === 'winkd') {
    return (
      <div
        style={{
          alignSelf: 'center',
          background: 'rgba(255,220,150,1)',
          border: '1px solid rgba(220,160,40,0.6)',
          borderRadius: 8,
          padding: '6px 16px',
          fontSize: 12,
          fontWeight: 600,
          color: '#5a3a00',
          maxWidth: '85%',
          textAlign: 'center',
          margin: '6px 0',
        }}
      >
        💥{' '}
        {isMe
          ? 'You sent a Winkd!'
          : `sent you a Winkd! Your window is shaking!`}
      </div>
    )
  }

  if (message.type === 'nudge') {
    return (
      <div
        style={{
          alignSelf: 'center',
          background: 'rgba(215,255,215,0.9)',
          border: '1px solid rgba(80,200,80,0.5)',
          borderRadius: 8,
          padding: '4px 16px',
          fontSize: 11,
          color: '#1a4a1a',
          maxWidth: '85%',
          textAlign: 'center',
          margin: '3px 0',
        }}
      >
        🫸 {isMe ? 'You sent a nudge.' : 'sent you a nudge.'}
      </div>
    )
  }

  if (message.type === 'system') {
    return (
      <div
        style={{
          alignSelf: 'center',
          fontSize: 10,
          color: 'rgba(160,195,240,0.65)',
          padding: '3px 0',
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        {message.body}
      </div>
    )
  }

  if (message.type !== 'text') return null

  const bodyParts = message.body.split(URL_REGEX)
  const imageUrls = (message.body.match(URL_REGEX) ?? []).filter(isImageAssetUrl)
  const hasImageAssets = imageUrls.length > 0
  const mediaSrc = message.mediaData || message.mediaUrl
  const mediaMime = message.mediaMime || ''
  const mediaName = message.mediaName || 'attachment'
  const canInlinePreview =
    Boolean(mediaSrc) &&
    (mediaMime.startsWith('image/') ||
      mediaMime.startsWith('video/') ||
      mediaMime.startsWith('audio/') ||
      mediaMime === 'application/pdf' ||
      mediaMime.startsWith('text/'))

  return (
    <div
      style={{
        maxWidth: '72%',
        padding: '6px 10px',
        borderRadius: 8,
        ...(isMe
          ? {
              background: 'rgba(190,215,255,1)',
              border: '1px solid rgba(100,160,240,0.5)',
              borderBottomRightRadius: 2,
              alignSelf: 'flex-end',
            }
          : {
              background: 'rgba(228,238,255,1)',
              border: '1px solid rgba(160,190,240,0.6)',
              borderBottomLeftRadius: 2,
              alignSelf: 'flex-start',
            }),
        fontSize: 12,
        lineHeight: 1.5,
        color: '#1a2a40',
        wordBreak: 'break-word',
        margin: '2px 0',
      }}
    >
      {bodyParts.map((part, index) => {
        if (!part.match(URL_REGEX)) {
          return <span key={`text-${index}`}>{part}</span>
        }

        if (isImageAssetUrl(part)) {
          const { asset, trailingText } = splitInlineEmojiToken(part)
          if (asset) {
            const resolvedAsset = getEmojiAssetUrlFromToken(asset) ?? asset
            return (
              <span key={`inline-image-${index}`}>
                {renderRichEmojiText(resolvedAsset, 20)}
                {trailingText}
              </span>
            )
          }
          return (
            <img
              key={`image-${index}`}
              src={part}
              alt="Shared media"
              style={{
                display: 'block',
                marginTop: 6,
                maxWidth: '100%',
                borderRadius: 6,
                border: '1px solid rgba(80,120,180,0.25)',
              }}
            />
          )
        }

        if (hasImageAssets && shouldHideCompanionGifLink(part)) {
          return null
        }

        return (
          <a
            key={`link-${index}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#0f4ca8', textDecoration: 'underline' }}
          >
            {part}
          </a>
        )
      })}
      {mediaSrc && (
        <div
          style={{
            marginTop: message.body.trim() ? 8 : 0,
            borderTop: message.body.trim() ? '1px solid rgba(80,120,180,0.2)' : 'none',
            paddingTop: message.body.trim() ? 8 : 0,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
            📎 {mediaName} {message.mediaSize ? `(${formatBytes(message.mediaSize)})` : ''}
          </div>
          {canInlinePreview ? (
            mediaMime.startsWith('image/') ? (
              <img
                src={mediaSrc}
                alt={mediaName}
                style={{ display: 'block', maxWidth: '100%', borderRadius: 6, marginBottom: 6 }}
              />
            ) : (
              <iframe
                src={mediaSrc}
                title={mediaName}
                style={{
                  width: '100%',
                  minHeight: 210,
                  border: '1px solid rgba(80,120,180,0.25)',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.82)',
                  marginBottom: 6,
                }}
              />
            )
          ) : (
            <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 6 }}>
              Inline preview not available for this format. Download to open.
            </div>
          )}
          <a
            href={mediaSrc}
            download={mediaName}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#0f4ca8', fontWeight: 600, textDecoration: 'underline' }}
          >
            Download file
          </a>
        </div>
      )}
    </div>
  )
}
