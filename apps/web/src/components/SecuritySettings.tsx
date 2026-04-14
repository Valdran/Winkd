// ── Security Settings Panel ──
// Lets the authenticated user manage their 2FA, backup codes, devices,
// and view their security audit log. Rendered inside the app as a modal/pane.

import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

// ── Shared styles (Aero aesthetic) ────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(222,234,255,0.97) 0%, rgba(200,218,255,0.95) 100%)',
  padding: '16px 18px',
  fontFamily: "'Segoe UI', Tahoma, Geneva, sans-serif",
  fontSize: 12,
  color: '#1a2a40',
}

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#0a3a8a',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  marginBottom: 8,
  marginTop: 14,
  paddingBottom: 3,
  borderBottom: '1px solid rgba(100,150,220,0.25)',
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.7)',
  border: '1px solid rgba(100,150,220,0.3)',
  borderRadius: 6,
  padding: '10px 12px',
  marginBottom: 8,
}

const btnPrimary: React.CSSProperties = {
  display: 'inline-block',
  height: 26,
  padding: '0 12px',
  borderRadius: 4,
  border: '1px solid #0a3a8a',
  background: 'linear-gradient(180deg, #2060c0 0%, #1450a0 100%)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: "'Segoe UI', sans-serif",
}

const btnDanger: React.CSSProperties = {
  ...btnPrimary,
  border: '1px solid #8a0a0a',
  background: 'linear-gradient(180deg, #c02020 0%, #a01414 100%)',
}

const btnGhost: React.CSSProperties = {
  ...btnPrimary,
  background: 'linear-gradient(180deg, rgba(220,232,255,0.9) 0%, rgba(195,215,250,0.9) 100%)',
  border: '1px solid rgba(100,150,220,0.45)',
  color: '#1a3a6a',
}

const inputStyle: React.CSSProperties = {
  height: 26,
  borderRadius: 3,
  border: '1px solid rgba(100,150,220,0.5)',
  background: '#fff',
  padding: '0 8px',
  fontSize: 11,
  color: '#1a2a40',
  outline: 'none',
  boxShadow: 'inset 0 1px 3px rgba(0,0,60,0.1)',
  fontFamily: "'Segoe UI', sans-serif",
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Device {
  id: string
  device_id: number
  device_name: string
  registered_at: string
  last_seen: string
}

interface AuditEntry {
  id: string
  action: string
  ip_address: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

export function SecuritySettings({ onClose }: Props) {
  const session = useAuthStore((s) => s.session)
  const token = session?.token ?? ''
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  // ── 2FA state
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [recoveryRemaining, setRecoveryRemaining] = useState<number | null>(null)
  const [totpSetupUri, setTotpSetupUri] = useState('')
  const [totpSetupSecret, setTotpSetupSecret] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [regenCode, setRegenCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [setupStep, setSetupStep] = useState<'idle' | 'qr' | 'done'>('idle')

  // ── Device state
  const [devices, setDevices] = useState<Device[]>([])

  // ── Audit state
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [auditLoaded, setAuditLoaded] = useState(false)

  // ── General
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  // Load 2FA status and devices on mount
  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/api/auth/recovery-codes`, { headers })
      .then(r => r.json() as Promise<{ totp_enabled: boolean; recovery_codes_remaining: number }>)
      .then(d => {
        setTotpEnabled(d.totp_enabled)
        setRecoveryRemaining(d.recovery_codes_remaining)
      })
      .catch(() => {})

    fetch(`${API_URL}/api/devices`, { headers })
      .then(r => r.json() as Promise<{ devices: Device[] }>)
      .then(d => setDevices(d.devices ?? []))
      .catch(() => {})
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (m: string, isErr = false) => {
    isErr ? setErr(m) : setMsg(m)
    setErr(isErr ? m : '')
    setMsg(isErr ? '' : m)
    setTimeout(() => { setMsg(''); setErr('') }, 5000)
  }

  // ── 2FA setup ──────────────────────────────────────────────────────────

  const startSetup = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/totp/setup`, { method: 'POST', headers })
      if (!res.ok) { flash('Setup failed.', true); return }
      const d = await res.json() as { secret: string; uri: string }
      setTotpSetupSecret(d.secret)
      setTotpSetupUri(d.uri)
      setSetupStep('qr')
      setConfirmCode('')
    } finally { setLoading(false) }
  }

  const confirmSetup = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/totp/confirm`, {
        method: 'POST', headers,
        body: JSON.stringify({ code: confirmCode }),
      })
      if (!res.ok) { flash('Invalid code. Check your authenticator app.', true); return }
      const d = await res.json() as { backup_codes: string[] }
      setBackupCodes(d.backup_codes)
      setTotpEnabled(true)
      setSetupStep('done')
      flash('2FA enabled! Save your backup codes.')
    } finally { setLoading(false) }
  }

  const disableTotp = async () => {
    if (!disableCode.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/totp/disable`, {
        method: 'POST', headers,
        body: JSON.stringify({ code: disableCode }),
      })
      if (!res.ok) { flash('Invalid code.', true); return }
      setTotpEnabled(false)
      setDisableCode('')
      flash('2FA has been disabled.')
    } finally { setLoading(false) }
  }

  // ── Backup codes ───────────────────────────────────────────────────────

  const regenerateCodes = async () => {
    if (!regenCode.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/recovery-codes/generate`, {
        method: 'POST', headers,
        body: JSON.stringify({ code: regenCode }),
      })
      if (!res.ok) { flash('Invalid code.', true); return }
      const d = await res.json() as { backup_codes: string[] }
      setBackupCodes(d.backup_codes)
      setRecoveryRemaining(d.backup_codes.length)
      setRegenCode('')
      flash('New backup codes generated. Save them now — they won\'t be shown again.')
    } finally { setLoading(false) }
  }

  // ── Devices ────────────────────────────────────────────────────────────

  const revokeDevice = async (deviceId: number) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/devices/${deviceId}`, { method: 'DELETE', headers })
      if (!res.ok) { flash('Could not revoke device.', true); return }
      setDevices(prev => prev.filter(d => d.device_id !== deviceId))
      flash('Device revoked.')
    } finally { setLoading(false) }
  }

  // ── Audit log ──────────────────────────────────────────────────────────

  const loadAuditLog = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/security/audit-log`, { headers })
      if (!res.ok) { flash('Could not load audit log.', true); return }
      const d = await res.json() as { events: AuditEntry[] }
      setAuditLog(d.events ?? [])
      setAuditLoaded(true)
    } finally { setLoading(false) }
  }

  const fmtDate = (s: string) =>
    new Date(s).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })

  const actionLabel: Record<string, string> = {
    login: '✅ Login',
    login_failed: '❌ Login failed',
    register: '🆕 Account created',
    logout: '👋 Logged out',
    totp_enabled: '🔐 2FA enabled',
    totp_disabled: '🔓 2FA disabled',
    totp_challenge_issued: '🔑 2FA challenge issued',
    totp_challenge_passed: '✅ 2FA passed',
    totp_challenge_failed: '❌ 2FA failed',
    recovery_code_used: '🔑 Backup code used',
    recovery_codes_regenerated: '🔄 Backup codes regenerated',
    device_registered: '💻 Device registered',
    device_revoked: '🗑️ Device revoked',
    password_changed: '🔒 Password changed',
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0a3a8a' }}>🛡 Security Settings</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#5a7a9a' }}>×</button>
      </div>

      {msg && <div style={{ padding: '5px 8px', borderRadius: 3, background: 'rgba(30,120,30,0.1)', border: '1px solid rgba(30,120,30,0.25)', color: '#1a5a1a', fontSize: 11, marginBottom: 8 }}>{msg}</div>}
      {err && <div style={{ padding: '5px 8px', borderRadius: 3, background: 'rgba(180,40,40,0.07)', border: '1px solid rgba(180,40,40,0.2)', color: '#b03030', fontSize: 11, marginBottom: 8 }}>{err}</div>}

      {/* ── Two-Factor Authentication ──────────────────────────────── */}
      <div style={sectionTitle}>Two-Factor Authentication (TOTP)</div>

      {!totpEnabled && setupStep === 'idle' && (
        <div style={cardStyle}>
          <div style={{ marginBottom: 6, color: '#3a5a8a' }}>
            2FA is <strong>disabled</strong>. Enable it to require a time-based code at every login.
          </div>
          <button style={btnPrimary} onClick={startSetup} disabled={loading}>Enable 2FA</button>
        </div>
      )}

      {setupStep === 'qr' && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Scan this QR code with your authenticator app</div>
          {/* Client renders QR from the URI — no server-side image needed */}
          <div style={{ fontFamily: 'monospace', fontSize: 9, wordBreak: 'break-all', background: '#f0f4ff', padding: 8, borderRadius: 4, marginBottom: 8, border: '1px solid rgba(100,150,220,0.2)' }}>
            {totpSetupUri}
          </div>
          <div style={{ fontSize: 10, color: '#5a7a9a', marginBottom: 8 }}>
            Or enter secret manually: <strong style={{ letterSpacing: '0.1em' }}>{totpSetupSecret}</strong>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              style={{ ...inputStyle, width: 100, textAlign: 'center', letterSpacing: '0.15em' }}
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              value={confirmCode}
              onChange={e => setConfirmCode(e.target.value.replace(/\D/g, ''))}
            />
            <button style={btnPrimary} onClick={confirmSetup} disabled={loading || confirmCode.length !== 6}>
              Confirm
            </button>
            <button style={btnGhost} onClick={() => setSetupStep('idle')} disabled={loading}>Cancel</button>
          </div>
        </div>
      )}

      {setupStep === 'done' && backupCodes.length > 0 && (
        <div style={{ ...cardStyle, background: 'rgba(255,250,220,0.9)', borderColor: 'rgba(200,160,40,0.4)' }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#6a4a00' }}>⚠️ Save your backup codes</div>
          <div style={{ fontSize: 10, color: '#6a4a00', marginBottom: 8 }}>
            These codes can be used instead of your authenticator app. Each is single-use.
            Save them somewhere safe — they will not be shown again.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginBottom: 8 }}>
            {backupCodes.map((c) => (
              <div key={c} style={{ fontFamily: 'monospace', fontSize: 10, background: '#fff', padding: '2px 6px', borderRadius: 3, border: '1px solid rgba(200,160,40,0.3)' }}>{c}</div>
            ))}
          </div>
          <button style={btnGhost} onClick={() => { setSetupStep('idle'); setBackupCodes([]) }}>Done</button>
        </div>
      )}

      {totpEnabled && setupStep === 'idle' && (
        <div style={cardStyle}>
          <div style={{ marginBottom: 8, color: '#1a5a1a', fontWeight: 600 }}>
            🔐 2FA is <strong>enabled</strong>
            {recoveryRemaining !== null && (
              <span style={{ fontWeight: 400, color: recoveryRemaining <= 2 ? '#c05000' : '#3a5a3a', marginLeft: 8, fontSize: 10 }}>
                ({recoveryRemaining} backup code{recoveryRemaining !== 1 ? 's' : ''} remaining)
              </span>
            )}
          </div>

          {/* Disable 2FA */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#5a7a9a', marginBottom: 4 }}>Disable 2FA (requires current TOTP code):</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ ...inputStyle, width: 90, textAlign: 'center', letterSpacing: '0.15em' }}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                value={disableCode}
                onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
              />
              <button style={btnDanger} onClick={disableTotp} disabled={loading || disableCode.length !== 6}>Disable</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Backup / Recovery Codes ──────────────────────────────── */}
      {totpEnabled && (
        <>
          <div style={sectionTitle}>Backup Codes</div>
          <div style={cardStyle}>
            <div style={{ fontSize: 10, color: '#5a7a9a', marginBottom: 6 }}>
              Regenerate all backup codes (requires current TOTP code). Old codes are invalidated immediately.
            </div>
            {backupCodes.length > 0 ? (
              <div style={{ ...cardStyle, background: 'rgba(255,250,220,0.9)', borderColor: 'rgba(200,160,40,0.4)', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 10, color: '#6a4a00', marginBottom: 4 }}>⚠️ New backup codes — save these now:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                  {backupCodes.map(c => (
                    <div key={c} style={{ fontFamily: 'monospace', fontSize: 10, background: '#fff', padding: '2px 6px', borderRadius: 3, border: '1px solid rgba(200,160,40,0.3)' }}>{c}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <input
                  style={{ ...inputStyle, width: 90, textAlign: 'center', letterSpacing: '0.15em' }}
                  placeholder="123456"
                  maxLength={6}
                  inputMode="numeric"
                  value={regenCode}
                  onChange={e => setRegenCode(e.target.value.replace(/\D/g, ''))}
                />
                <button style={btnPrimary} onClick={regenerateCodes} disabled={loading || regenCode.length !== 6}>
                  Regenerate
                </button>
              </div>
            )}
            {backupCodes.length > 0 && (
              <button style={btnGhost} onClick={() => setBackupCodes([])}>Done</button>
            )}
          </div>
        </>
      )}

      {/* ── Connected Devices ─────────────────────────────────────── */}
      <div style={sectionTitle}>Connected Devices</div>
      {devices.length === 0 ? (
        <div style={{ fontSize: 10, color: '#7a9ab0', marginBottom: 8 }}>No registered devices.</div>
      ) : (
        devices.map(d => (
          <div key={d.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 11 }}>💻 {d.device_name}</div>
              <div style={{ fontSize: 9, color: '#7a9ab0', marginTop: 1 }}>
                Registered {fmtDate(d.registered_at)} · Last seen {fmtDate(d.last_seen)}
              </div>
            </div>
            <button style={btnDanger} onClick={() => revokeDevice(d.device_id)} disabled={loading}>
              Revoke
            </button>
          </div>
        ))
      )}

      {/* ── Security Audit Log ────────────────────────────────────── */}
      <div style={sectionTitle}>Security Audit Log</div>
      {!auditLoaded ? (
        <button style={btnGhost} onClick={loadAuditLog} disabled={loading}>
          {loading ? 'Loading…' : 'Load Audit Log'}
        </button>
      ) : auditLog.length === 0 ? (
        <div style={{ fontSize: 10, color: '#7a9ab0' }}>No events recorded yet.</div>
      ) : (
        <div style={{ maxHeight: 220, overflowY: 'auto', borderRadius: 4, border: '1px solid rgba(100,150,220,0.2)' }}>
          {auditLog.map(entry => (
            <div key={entry.id} style={{ padding: '5px 8px', borderBottom: '1px solid rgba(100,150,220,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11 }}>{actionLabel[entry.action] ?? entry.action}</div>
                {entry.ip_address && (
                  <div style={{ fontSize: 9, color: '#7a9ab0' }}>IP: {entry.ip_address}</div>
                )}
              </div>
              <div style={{ fontSize: 9, color: '#7a9ab0', whiteSpace: 'nowrap', marginLeft: 8 }}>
                {fmtDate(entry.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
