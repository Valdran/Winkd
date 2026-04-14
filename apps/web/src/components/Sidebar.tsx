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
  const removePendingInvitation = useContactsStore((s) => s.removePendingInvitation)
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
  const [showBlockedUsers, setShowBlockedUsers] = useState(false)
  const [showPendingModal, setShowPendingModal] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [addContactInput, setAddContactInput] = useState('')
  const [addContactError, setAddContactError] = useState('')
  const [addContactSent, setAddContactSent] = useState(false)

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

  const acceptedContacts = contacts.filter((c) => c.requestStatus === 'accepted')
  const pendingOutbound = contacts.filter((c) => c.requestStatus === 'pending_outbound')

  const filteredAccepted = searchQuery
    ? acceptedContacts.filter((c) =>
        c.displayName.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : acceptedContacts

  const filteredPendingOut = searchQuery
    ? pendingOutbound.filter((c) =>
        c.displayName.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : pendingOutbound

  const handleApprove = (requestId: string) => {
    removePendingInvitation(requestId)
    send({ command: 'accept_contact', payload: { request_id: requestId } })
  }

  const handleReject = (requestId: string) => {
    removePendingInvitation(requestId)
    send({ command: 'reject_contact', payload: { request_id: requestId } })
  }

  const handleBlock = (requestId: string) => {
    removePendingInvitation(requestId)
    send({ command: 'block_contact', payload: { request_id: requestId } })
  }

  const openBlockedUsers = () => {
    send({ command: 'list_blocked', payload: {} })
    setShowBlockedUsers(true)
  }

  const handleUnblock = (userId: string) => {
    send({ command: 'unblock_contact', payload: { user_id: userId } })
  }

  const closeAddContact = () => {
    setShowAddContact(false)
    setAddContactInput('')
    setAddContactError('')
    setAddContactSent(false)
  }

  const handleAddContact = () => {
    const trimmed = addContactInput.trim()
    if (!/^[^#]+#\d{4}$/.test(trimmed)) {
      setAddContactError('Must be in format username#1234')
      return
    }
    send({ command: 'add_contact', payload: { winkd_id: trimmed } })
    setAddContactSent(true)
    setAddContactError('')
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
          const group = filteredAccepted.filter(filter)
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

        {/* Outbound pending requests */}
        {filteredPendingOut.length > 0 && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 12px 2px',
                fontSize: 10,
                fontWeight: 700,
                color: 'rgba(255,210,120,0.65)',
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                userSelect: 'none',
              }}
            >
              Pending ({filteredPendingOut.length})
            </div>
            {filteredPendingOut.map((contact) => (
              <div
                key={contact.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 10px',
                  margin: '1px 4px',
                  borderRadius: 4,
                  opacity: 0.75,
                }}
              >
                <Avatar
                  displayName={contact.displayName}
                  avatarData={contact.avatarData}
                  status="invisible"
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
                  <div
                    style={{
                      fontSize: 10,
                      color: 'rgba(255,200,110,0.75)',
                      fontStyle: 'italic',
                    }}
                  >
                    Pending acceptance
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
      {/* Inbound contact requests entry point */}
      {pendingInvitations.length > 0 && (
        <div style={{ padding: '5px 8px 0', flexShrink: 0, borderTop: '1px solid rgba(255,220,150,0.2)' }}>
          <button
            onClick={() => setShowPendingModal(true)}
            style={{
              width: '100%',
              height: 24,
              borderRadius: 6,
              border: '1px solid rgba(255,210,120,0.55)',
              background: 'rgba(255,180,80,0.2)',
              color: '#ffe8c0',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {pendingInvitations.length} Pending Invitation{pendingInvitations.length > 1 ? 's' : ''}
          </button>
        </div>
      )}
      <div style={{ padding: '5px 8px', flexShrink: 0 }}>
        <button
          onClick={() => setShowAddContact(true)}
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
            cursor: 'pointer',
          }}
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

      {showAddContact && (
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
            maxWidth: 320,
            background: 'linear-gradient(180deg, rgba(25,65,145,0.96) 0%, rgba(12,35,92,0.98) 100%)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 10,
            boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.15)', fontSize: 12, fontWeight: 700, color: '#eef6ff' }}>
              Add a Buddy
            </div>
            <div style={{ padding: 12 }}>
              {addContactSent ? (
                <div style={{ color: '#90ee90', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
                  Buddy request sent!
                </div>
              ) : (
                <>
                  <div style={{ color: 'rgba(200,225,255,0.8)', fontSize: 11, marginBottom: 8 }}>
                    Enter your buddy's Winkd ID:
                  </div>
                  <input
                    type="text"
                    autoFocus
                    placeholder="username#1234"
                    value={addContactInput}
                    onChange={(e) => { setAddContactInput(e.target.value); setAddContactError('') }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddContact() }}
                    style={{
                      width: '100%',
                      height: 28,
                      borderRadius: 5,
                      border: `1px solid ${addContactError ? 'rgba(255,100,100,0.7)' : 'rgba(100,150,220,0.5)'}`,
                      background: 'rgba(255,255,255,0.09)',
                      color: '#ddeeff',
                      fontSize: 11,
                      padding: '0 8px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {addContactError && (
                    <div style={{ color: '#ff9090', fontSize: 10, marginTop: 4 }}>
                      {addContactError}
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{ padding: '0 12px 12px', display: 'flex', gap: 8 }}>
              {!addContactSent && (
                <button
                  onClick={handleAddContact}
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: 6,
                    border: '1px solid rgba(80,130,220,0.7)',
                    background: 'linear-gradient(180deg, #2060c0 0%, #1450a0 100%)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Send Request
                </button>
              )}
              <button
                onClick={closeAddContact}
                style={{
                  flex: addContactSent ? 1 : undefined,
                  height: 28,
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#dcecff',
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: addContactSent ? undefined : '0 14px',
                }}
              >
                {addContactSent ? 'Close' : 'Cancel'}
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
                    status="invisible"
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

      {showPendingModal && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 120,
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
              Pending Invitations ({pendingInvitations.length})
            </div>
            <div style={{ padding: 10, overflowY: 'auto', maxHeight: 320 }}>
              {pendingInvitations.map((invitation) => (
                <div key={invitation.requestId} style={{
                  background: 'rgba(255,240,185,0.07)',
                  border: '1px solid rgba(255,220,150,0.2)',
                  borderRadius: 8,
                  padding: 8,
                  marginBottom: 8,
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <Avatar
                      displayName={invitation.fromDisplayName}
                      avatarData={invitation.fromAvatarData}
                      status="invisible"
                      size={30}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: '#f0f7ff', fontWeight: 700, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {invitation.fromDisplayName}
                      </div>
                      <div style={{ color: 'rgba(205,225,255,0.8)', fontSize: 10 }}>
                        {invitation.fromWinkdId}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => handleApprove(invitation.requestId)} style={{ flex: 1, height: 24, borderRadius: 5, border: '1px solid rgba(120,220,140,0.65)', background: 'rgba(80,180,110,0.28)', color: '#cfffda', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Accept</button>
                    <button onClick={() => handleReject(invitation.requestId)} style={{ flex: 1, height: 24, borderRadius: 5, border: '1px solid rgba(255,210,120,0.55)', background: 'rgba(200,150,60,0.22)', color: '#ffe8c0', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Deny</button>
                    <button onClick={() => handleBlock(invitation.requestId)} style={{ flex: 1, height: 24, borderRadius: 5, border: '1px solid rgba(255,110,110,0.6)', background: 'rgba(180,65,65,0.28)', color: '#ffd0d0', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Block</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              <button
                onClick={() => setShowPendingModal(false)}
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
