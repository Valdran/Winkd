import type { CSSProperties, ReactNode } from 'react'

interface AeroWindowProps {
  title: string
  icon?: string
  children: ReactNode
  style?: CSSProperties
}

const CONTROL_BUTTONS = [
  { label: '−', bg: '#4a8ad4' },
  { label: '□', bg: '#4a8ad4' },
  { label: '✕', bg: '#c84040' },
] as const

export function AeroWindow({ title, icon, children, style }: AeroWindowProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px 8px 4px 4px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.2)',
        ...style,
      }}
    >
      {/* Titlebar */}
      <div
        style={{
          height: 30,
          background: 'linear-gradient(180deg, #3a7ad4 0%, #1a5acc 40%, #0f3d9a 100%)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 8,
          gap: 6,
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        {/* Glass sheen — top-half white overlay */}
        <div
          style={{
            position: 'absolute',
            inset: '0 0 50% 0',
            background: 'rgba(255,255,255,0.14)',
            pointerEvents: 'none',
          }}
        />

        {icon && (
          <img
            src={icon}
            alt=""
            style={{ width: 16, height: 16, borderRadius: 2, zIndex: 1 }}
          />
        )}
        <span
          style={{
            fontFamily: "'Segoe UI', Tahoma, sans-serif",
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,50,0.5)',
            zIndex: 1,
            flex: 1,
          }}
        >
          {title}
        </span>

        {/* Window controls */}
        <div style={{ display: 'flex', gap: 2, zIndex: 1, paddingRight: 4 }}>
          {CONTROL_BUTTONS.map(({ label, bg }) => (
            <button
              key={label}
              type="button"
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                border: '1px solid rgba(255,255,255,0.3)',
                background: `linear-gradient(180deg, ${bg}cc 0%, ${bg} 100%)`,
                color: '#fff',
                fontSize: 9,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'default',
                lineHeight: 1,
                padding: 0,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Menu bar */}
      <div
        style={{
          height: 22,
          background:
            'linear-gradient(180deg, rgba(220,235,255,0.96) 0%, rgba(200,220,255,0.9) 100%)',
          borderBottom: '1px solid rgba(100,150,220,0.3)',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 8,
          gap: 16,
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        {['File', 'Contacts', 'Tools', 'Help'].map((item) => (
          <span
            key={item}
            style={{
              fontSize: 11,
              color: '#1a2a40',
              cursor: 'default',
              padding: '1px 4px',
            }}
          >
            {item}
          </span>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {children}
      </div>
    </div>
  )
}
