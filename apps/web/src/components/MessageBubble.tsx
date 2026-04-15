import type { Message } from '@winkd/types'

const URL_REGEX = /(https?:\/\/[^\s]+)/g

function isImageAssetUrl(rawUrl: string): boolean {
  const normalized = rawUrl.toLowerCase()
  return /(\.gif|\.webp|\.png|\.jpg|\.jpeg)(\?|$)/.test(normalized) || normalized.includes('/media')
}

function shouldHideCompanionGifLink(rawUrl: string): boolean {
  return /https?:\/\/(?:www\.)?(?:giphy\.com|tenor\.com)\//i.test(rawUrl)
}

interface MessageBubbleProps {
  message: Message
  isMe: boolean
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
    </div>
  )
}
