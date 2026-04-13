import { useState } from 'react'
import { Avatar } from '@winkd/ui'
import type { Contact } from '@winkd/types'

interface ContactItemProps {
  contact: Contact
  isSelected: boolean
  onClick: () => void
  unreadCount: number
}

export function ContactItem({
  contact,
  isSelected,
  onClick,
  unreadCount,
}: ContactItemProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 10px',
        cursor: 'pointer',
        borderRadius: 4,
        margin: '1px 4px',
        background: isSelected
          ? 'rgba(26,90,204,0.38)'
          : hovered
            ? 'rgba(26,90,204,0.18)'
            : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <Avatar
        displayName={contact.displayName}
        avatarData={contact.avatarData}
        status={contact.status}
        size={32}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 12,
            color: '#e8f0ff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {contact.displayName}
        </div>
        {contact.moodMessage && (
          <div
            style={{
              fontSize: 10,
              color: 'rgba(190,215,255,0.55)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {contact.moodMessage}
          </div>
        )}
      </div>
      {unreadCount > 0 && (
        <div
          style={{
            background: '#e07020',
            color: '#fff',
            borderRadius: 10,
            padding: '1px 6px',
            fontSize: 10,
            fontWeight: 700,
            minWidth: 18,
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}
    </div>
  )
}
