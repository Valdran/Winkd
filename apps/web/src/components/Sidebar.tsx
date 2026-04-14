import { useState } from 'react'
import { Avatar } from '@winkd/ui'
import type { Contact, UserStatus } from '@winkd/types'
import { useAuthStore } from '../stores/authStore'
import { useContactsStore } from '../stores/contactsStore'
import { useChatStore } from '../stores/chatStore'
import { useSocket } from '../hooks/useSocket'
import { ContactItem } from './ContactItem'
import { StatusBar } from './StatusBar'
import { SecuritySettings } from './SecuritySettings'

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
  const pendingInvitations = useContactsStore((s) => s.pendingInvitations)
  const blockedUsers = useContactsStore((s) => s.blockedUsers)
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
  const [showSecurity, setShowSecurity] = useState(false)
  const [showInvitations, setShowInvitations] = useState(false)
  const [showBlockedUsers, setShowBlockedUsers] = useState(false)

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

  const invitationLabel =
    pendingInvitations.length === 1
      ? '1 buddy invitation'
      : `${pendingInvitations.length} buddy invitations`

  const handleApprove = (requestId: string) => {
    send({ command: 'accept_contact', payload: { request_id: requestId } })
  }

  const handleReject = (requestId: string) => {
    send({ command: 'reject_contact', payload: { request_id: requestId } })
  }

  const handleBlock = (requestId: string) => {
    send({ command: 'block_contact', payload: { request_id: requestId } })
  }

  const openBlockedUsers = () => {
    send({ command: 'list_blocked', payload: {} })
    setShowBlockedUsers(true)
  }

  const handleUnblock = (userId: string) => {
    send({ command: 'unblock_contact', payload: { user_id: userId } })
  }

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
        position: 'relative',
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
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '5px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <button
          onClick={() => setShowSecurity(true)}
          title="Security Settings"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 10,
            color: 'rgba(180,210,255,0.7)',
            padding: '2px 4px',
            borderRadius: 3,
          }}
        >
          🛡 Security
        </button>
        <button
          onClick={openBlockedUsers}
          title="Blocked users"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 10,
            color: 'rgba(180,210,255,0.7)',
            padding: '2px 4px',
            borderRadius: 3,
          }}
        >
          ⛔ Blocked
        </button>
      </div>
      {pendingInvitations.length > 0 && (
        <div style={{ padding: '5px 8px 0', flexShrink: 0 }}>
          <button
            onClick={() => setShowInvitations(true)}
            style={{
              width: '100%',
              height: 28,
              borderRadius: 6,
              border: '1px solid rgba(255,220,150,0.65)',
              background:
                'linear-gradient(180deg, rgba(255,240,185,0.35) 0%, rgba(255,210,120,0.28) 100%)',
              color: '#ffe8aa',
              fontWeight: 700,
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {invitationLabel}
          </button>
        </div>
      )}
      <div style={{ padding: '5px 8px', flexShrink: 0 }}>
        <button
          style={{
            width: '100%',
            height: 28,
            borderRadius: 8,
            border: '1px solid rgba(110,160,230,0.6)',
            background:
              'linear-gradient(180deg, rgba(65,125,220,0.45) 0%, rgba(35,85,170,0.5) 100%)',
            color: '#e9f4ff',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'default',
          }}
          title="Add contact flow coming soon"
        >
          + Add Contact
        </button>
      </div>
      <StatusBar
        isEncrypted={false}
        extra={profile.winkdId}
      />

      {/* Security settings overlay */}
      {showSecurity && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 100,
          overflowY: 'auto',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        }}>
          <SecuritySettings onClose={() => setShowSecurity(false)} />
        </div>
      )}

      {showInvitations && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 110,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
          padding: 10,
        }}>
          <div style={{
            width: '100%',
            maxWidth: 360,
            maxHeight: '80%',
            background: 'linear-gradient(180deg, rgba(25,65,145,0.96) 0%, rgba(12,35,92,0.98) 100%)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 10,
            boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.15)', fontSize: 12, fontWeight: 700, color: '#eef6ff' }}>
              Buddy Invitations
            </div>
            <div style={{ padding: 10, overflowY: 'auto', maxHeight: 380 }}>
              {pendingInvitations.map((invitation) => (
                <div key={invitation.requestId} style={{
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  padding: 8,
                  marginBottom: 8,
                  background: 'rgba(255,255,255,0.04)',
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Avatar
                      displayName={invitation.fromDisplayName}
                      avatarData={invitation.fromAvatarData}
                      status="offline"
                      size={32}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: '#f0f7ff', fontWeight: 700, fontSize: 11 }}>
                        {invitation.fromDisplayName}
                      </div>
                      <div style={{ color: 'rgba(205,225,255,0.8)', fontSize: 10 }}>
                        {invitation.fromWinkdId}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={() => handleApprove(invitation.requestId)} style={{ flex: 1, height: 24, borderRadius: 5, border: '1px solid rgba(120,220,140,0.65)', background: 'rgba(80,180,110,0.32)', color: '#dfffe6', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                    <button onClick={() => handleReject(invitation.requestId)} style={{ flex: 1, height: 24, borderRadius: 5, border: '1px solid rgba(255,210,120,0.65)', background: 'rgba(220,165,70,0.3)', color: '#fff1cf', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Reject</button>
                    <button onClick={() => handleBlock(invitation.requestId)} style={{ flex: 1, height: 24, borderRadius: 5, border: '1px solid rgba(255,130,130,0.65)', background: 'rgba(190,75,75,0.34)', color: '#ffdede', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Block</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              <button
                onClick={() => setShowInvitations(false)}
                style={{
                  width: '100%',
                  height: 28,
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#dcecff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showBlockedUsers && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 110,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
          padding: 10,
        }}>
          <div style={{
            width: '100%',
            maxWidth: 340,
            maxHeight: '80%',
            background: 'linear-gradient(180deg, rgba(25,65,145,0.96) 0%, rgba(12,35,92,0.98) 100%)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 10,
            boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.15)', fontSize: 12, fontWeight: 700, color: '#eef6ff' }}>
              Blocked Users
            </div>
            <div style={{ padding: 10, overflowY: 'auto', maxHeight: 320 }}>
              {blockedUsers.length === 0 && (
                <div style={{ color: 'rgba(220,235,255,0.7)', fontSize: 11 }}>
                  You have not blocked anyone.
                </div>
              )}
              {blockedUsers.map((blocked) => (
                <div key={blocked.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: 8, background: 'rgba(255,255,255,0.04)' }}>
                  <Avatar
                    displayName={blocked.displayName}
                    avatarData={blocked.avatarData}
                    status="offline"
                    size={28}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: '#f0f7ff', fontWeight: 700, fontSize: 11 }}>
                      {blocked.displayName}
                    </div>
                    <div style={{ color: 'rgba(205,225,255,0.8)', fontSize: 10 }}>
                      {blocked.winkdId}
                    </div>
                  </div>
                  <button onClick={() => handleUnblock(blocked.userId)} style={{ height: 24, borderRadius: 5, border: '1px solid rgba(170,200,255,0.65)', background: 'rgba(95,130,190,0.34)', color: '#ebf5ff', fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: '0 8px' }}>
                    Unblock
                  </button>
                </div>
              ))}
            </div>
            <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              <button
                onClick={() => setShowBlockedUsers(false)}
                style={{
                  width: '100%',
                  height: 28,
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#dcecff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
