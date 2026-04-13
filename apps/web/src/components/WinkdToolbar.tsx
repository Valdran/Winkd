import { useState } from 'react'

interface ToolbarBtnProps {
  label: string
  onClick: () => void
  variant?: 'winkd' | 'nudge' | 'default'
  disabled?: boolean
}

function ToolbarBtn({ label, onClick, variant = 'default', disabled }: ToolbarBtnProps) {
  const [hovered, setHovered] = useState(false)

  const baseBg = {
    winkd: 'linear-gradient(180deg, #fff8d0 0%, #ffe880 100%)',
    nudge: 'linear-gradient(180deg, #d8ffd8 0%, #a0f0a0 100%)',
    default: 'linear-gradient(180deg, rgba(220,235,255,0.88) 0%, rgba(180,210,255,0.75) 100%)',
  }[variant]

  const hoverBg = {
    winkd: 'linear-gradient(180deg, #fffae0 0%, #ffec90 100%)',
    nudge: 'linear-gradient(180deg, #e8ffe8 0%, #b8f8b8 100%)',
    default: 'linear-gradient(180deg, rgba(230,242,255,0.95) 0%, rgba(195,220,255,0.85) 100%)',
  }[variant]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 24,
        padding: '0 10px',
        borderRadius: 3,
        border: '1px solid rgba(100,150,220,0.4)',
        background: disabled ? 'rgba(180,200,230,0.25)' : hovered ? hoverBg : baseBg,
        fontSize: 11,
        color: disabled ? 'rgba(120,150,190,0.45)' : '#1a2a40',
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        boxShadow: hovered && !disabled ? '0 1px 3px rgba(0,0,50,0.15)' : 'none',
        transition: 'background 0.1s, box-shadow 0.1s',
      }}
    >
      {label}
    </button>
  )
}

interface WinkdToolbarProps {
  onWinkd: () => void
  onNudge: () => void
  onWinks: () => void
  onEmoticons: () => void
  disabled?: boolean
}

export function WinkdToolbar({
  onWinkd,
  onNudge,
  onWinks,
  onEmoticons,
  disabled,
}: WinkdToolbarProps) {
  return (
    <div
      style={{
        height: 34,
        padding: '0 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background:
          'linear-gradient(180deg, rgba(210,228,255,0.12) 0%, rgba(160,200,255,0.06) 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.09)',
        flexShrink: 0,
      }}
    >
      <ToolbarBtn
        label="💥 Winkd!"
        onClick={onWinkd}
        variant="winkd"
        disabled={disabled}
      />
      <ToolbarBtn
        label="🫸 Nudge"
        onClick={onNudge}
        variant="nudge"
        disabled={disabled}
      />
      <div
        style={{
          width: 1,
          height: 18,
          background: 'rgba(255,255,255,0.14)',
          margin: '0 3px',
        }}
      />
      <ToolbarBtn label="✨ Winks" onClick={onWinks} disabled={disabled} />
      <ToolbarBtn label="😄 Emoticons" onClick={onEmoticons} disabled={disabled} />
    </div>
  )
}
