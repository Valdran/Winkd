import { useState } from 'react'
import { Avatar } from '@winkd/ui'
import type { Contact, UserStatus } from '@winkd/types'
import { useAuthStore } from '../stores/authStore'
import { useContactsStore } from '../stores/contactsStore'
import { useChatStore } from '../stores/chatStore'
import { useSocket } from '../hooks/useSocket'
import { ContactItem } from './ContactItem'
import { StatusBar } from './StatusBar'

const STATUS_LABELS: Record<UserStatus, string> = {
  online: '● Online',
  away: '◐ Away',
  busy: '● Busy',
  invisible: '○ Appear Offline',
}

const STATUS_COLORS: Record<UserStatus, string> = {
  online: '#00CC00',
  away: '#FFAA00',
  busy: '#DD2020',
  invisible: '#AAAAAA',
}

const STATUS_CYCLE: UserStatus[] = ['online', 'away', 'busy', 'invisible']

type UIGroup = 'online' | 'away' | 'offline'

const UI_GROUPS: { key: UIGroup; label: string; filter: (c: Contact) => boolean }[] = [
  { key: 'online', label: 'Online', filter: (c) => c.status === 'online' },
  {
    key: 'away',
    label: 'Away / Busy',
    filter: (c) => c.status === 'away' || c.status === 'busy',
  },
  { key: 'offline', label: 'Offline', filter: (c) => c.status === 'invisible' },
]

export function Sidebar() {
  const session = useAuthStore((s) => s.session)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const contacts = useContactsStore((s) => s.contacts)
  const unreadCounts = useContactsStore((s) => s.unreadCounts)
  const clearUnread = useContactsStore((s) => s.clearUnread)
  const openConversation = useChatStore((s) => s.openConversation)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const { send } = useSocket()

  const [collapsed, setCollapsed] = useState<Record<UIGroup, boolean>>({
    online: false,
    away: false,
    offline: true,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [showProfileEdit, setShowProfileEdit] = useState(false)

  if (!session) return null
  const { profile } = session

  const cycleStatus = () => {
    const idx = STATUS_CYCLE.indexOf(profile.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]!
    updateProfile({ status: next })
    send({ command: 'set_status', payload: { status: next } })
  }

  const handleProfileSave = (displayName: string, moodMessage: string) => {
    updateProfile({ displayName, moodMessage })
    send({ command: 'set_display_name', payload: { display_name: displayName } })
    send({ command: 'set_mood', payload: { mood: moodMessage } })
  }

  const handleContactClick = (contact: Contact) => {
    openConversation(contact.id)
    clearUnread(contact.id)
  }

  const filteredContacts = searchQuery
    ? contacts.filter((c) =>
        c.displayName.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : contacts

  return (
    <div
      style={{
        width: 215,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background:
          'linear-gradient(180deg, rgba(10,40,120,0.84) 0%, rgba(8,28,85,0.9) 100%)',
        backdropFilter: 'blur(12px)',
        borderRight: '1px solid rgba(255,255,255,0.11)',
        overflow: 'hidden',
      }}
    >
      {/* Profile area */}
      <div
        style={{
          padding: '10px 10px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          background: 'rgba(255,255,255,0.035)',
          flexShrink: 0,
        }}
      >
        <Avatar
          displayName={profile.displayName}
          avatarData={profile.avatarData}
          status={profile.status}
          size={40}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            onClick={() => setShowProfileEdit(true)}
            title="Click to edit display name and mood"
            style={{
              fontWeight: 700,
              fontSize: 12,
              color: '#e8f4ff',
              marginBottom: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {profile.displayName}
          </div>
          <div
            onClick={cycleStatus}
            title="Click to change status"
            style={{
              fontSize: 10,
              color: STATUS_COLORS[profile.status],
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {STATUS_LABELS[profile.status]}
          </div>
          <div
            onClick={() => setShowProfileEdit(true)}
            title="Click to edit mood"
            style={{
              fontSize: 10,
              color: 'rgba(195,220,255,0.5)',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontStyle: profile.moodMessage ? 'normal' : 'italic',
              cursor: 'pointer',
            }}
          >
            {profile.moodMessage || 'Set a mood…'}
          </div>
        </div>
      </div>

      {/* Search */}
      <div
        style={{
          padding: '5px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          placeholder="Search contacts…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            height: 24,
            borderRadius: 4,
            border: '1px solid rgba(100,150,220,0.35)',
            background: 'rgba(255,255,255,0.07)',
            color: '#ddeeff',
            fontSize: 11,
            padding: '0 8px',
            outline: 'none',
          }}
        />
      </div>

      {/* Contact groups */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 4 }}>
        {UI_GROUPS.map(({ key, label, filter }) => {
          const group = filteredContacts.filter(filter)
          if (group.length === 0) return null
          const isCollapsed = collapsed[key]

          return (
            <div key={key}>
              <div
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [key]: !c[key] }))
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 12px 2px',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'rgba(170,205,255,0.55)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  userSelect: 'none',
                }}
              >
                <span style={{ fontSize: 7 }}>{isCollapsed ? '▶' : '▼'}</span>
                {label} ({group.length})
              </div>

              {!isCollapsed &&
                group.map((contact) => (
                  <ContactItem
                    key={contact.id}
                    contact={contact}
                    isSelected={activeConversationId === contact.id}
                    onClick={() => handleContactClick(contact)}
                    unreadCount={unreadCounts[contact.id] ?? 0}
                  />
                ))}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <StatusBar
        isEncrypted={false}
        extra={profile.winkdId}
      />


    </div>
  )
}
