interface StatusBarProps {
  isEncrypted?: boolean
  extra?: string
}

export function StatusBar({ isEncrypted = true, extra }: StatusBarProps) {
  return (
    <div
      style={{
        height: 20,
        background:
          'linear-gradient(180deg, rgba(200,220,255,0.07) 0%, rgba(10,40,100,0.35) 100%)',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        paddingInline: 10,
        gap: 14,
        flexShrink: 0,
      }}
    >
      {isEncrypted && (
        <span
          style={{
            fontSize: 10,
            color: 'rgba(140,215,140,0.88)',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          🔒 End-to-end encrypted
        </span>
      )}
      {extra && (
        <span style={{ fontSize: 10, color: 'rgba(180,210,255,0.45)', marginLeft: 'auto' }}>
          {extra}
        </span>
      )}
    </div>
  )
}
