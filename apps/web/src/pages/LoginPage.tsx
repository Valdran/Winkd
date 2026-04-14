import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import type { OwnProfile } from '@winkd/types'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

const MOODS_2000S = [
  "☕ brb, getting a frappuccino",
  "🎵 avril lavigne on repeat rn",
  "💿 sk8er boi is stuck in my head",
  "🌟 complicated feelings rn",
  "🍭 sugar we're going down",
  "💔 my chemical romance era",
  "🎮 addicted to sims 2",
  "✨ like omg it's so fetch",
  "🌙 sparkling like edward cullen",
  "🎸 boulevard of broken dreams",
  "💫 chasing pavements",
  "🍕 pizza hut friday night!!",
  "💾 downloading songs on emule",
  "📼 rewatching lord of the rings again",
  "🧟 team edward or team jacob?",
  "🌹 twilight saga is my life",
  "👾 my tamagotchi is judging me",
  "📀 burning cds for the car",
  "🎀 wearing my von dutch hat",
  "💻 zoning out on myspace",
  "🌺 nelly furtado vibes",
  "⚡ wake me up when september ends",
  "🦄 crazy in love (beyoncé forever)",
  "🎙️ kelly clarkson was robbed",
  "🌊 surfing the web lol",
  "🏴‍☠️ the pirate bay was peak",
  "📱 brt, sending a text",
  "🧲 one step at a time",
  "🌀 the veronicas understood me",
  "🐱 still thinking about my tamagotchi",
]

function pickRandomMood() {
  return MOODS_2000S[Math.floor(Math.random() * MOODS_2000S.length)]
}

type Mode = 'login' | 'register' | 'totp'

const PROVIDER_LABELS: Record<string, string> = {
  discord: 'Discord',
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  facebook: 'Facebook',
  twitter: 'X / Twitter',
  twitch: 'Twitch',
  reddit: 'Reddit',
  spotify: 'Spotify',
  linkedin: 'LinkedIn',
  apple: 'Apple',
  steam: 'Steam',
}

export function LoginPage() {
  const login = useAuthStore((s) => s.login)

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthProviders, setOauthProviders] = useState<string[]>([])
  // 2FA state
  const [challengeToken, setChallengeToken] = useState('')
  const [totpCode, setTotpCode] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/api/auth/oauth/providers`)
      .then((r) => r.json())
      .then((d) => setOauthProviders(Array.isArray(d.providers) ? d.providers : []))
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint =
        mode === 'login' ? '/api/auth/login' : '/api/auth/register'

      const body: Record<string, string> =
        mode === 'login'
          ? { username, password }
          : { username, password, display_name: username }

      if (mode === 'register' && email.trim()) {
        body.email = email.trim()
      }

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        if (data.error?.includes('taken') || data.error?.includes('registered')) {
          setError(data.error)
        } else {
          setError(
            mode === 'login'
              ? 'Invalid username or password.'
              : 'Registration failed. Try a different username.',
          )
        }
        return
      }

      const data = (await res.json()) as {
        session_token?: string
        totp_required?: boolean
        challenge_token?: string
        winkd_id?: string
        display_name?: string
        mood_message?: string
      }

      // 2FA required — switch to TOTP entry step
      if (data.totp_required && data.challenge_token) {
        setChallengeToken(data.challenge_token)
        setMode('totp')
        setTotpCode('')
        return
      }

      completeLogin(data as { session_token: string; winkd_id: string; display_name: string; mood_message: string })
    } catch {
      setError('Could not connect to server. Is it running?')
    } finally {
      setLoading(false)
    }
  }

  const completeLogin = (data: { session_token: string; winkd_id: string; display_name: string; mood_message: string }) => {
    let avatarData: string | null = null
    let status: OwnProfile['status'] = 'online'
    try {
      const raw = localStorage.getItem('winkd-auth')
      if (raw) {
        const existing = JSON.parse(raw) as { state?: { session?: { profile?: OwnProfile } } }
        const p = existing?.state?.session?.profile
        if (p && p.winkdId === data.winkd_id) {
          avatarData = p.avatarData ?? null
          status = p.status ?? 'online'
        }
      }
    } catch { /* ignore */ }

    const mood = data.mood_message || pickRandomMood()
    const profile: OwnProfile = {
      winkdId: data.winkd_id as `${string}#${string}`,
      displayName: data.display_name,
      moodMessage: mood,
      status,
      avatarData,
      sessionToken: data.session_token,
    }
    login(data.session_token, profile)
  }

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/totp/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_token: challengeToken, code: totpCode }),
      })
      if (!res.ok) {
        setError('Invalid code. Try again or use a backup code.')
        setTotpCode('')
        return
      }
      const data = await res.json() as { session_token: string; winkd_id: string; display_name: string; mood_message: string }
      completeLogin(data)
    } catch {
      setError('Could not connect to server.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 28,
    borderRadius: 3,
    border: '1px solid rgba(100,150,220,0.5)',
    background: '#fff',
    padding: '0 8px',
    fontSize: 12,
    color: '#1a2a40',
    outline: 'none',
    boxShadow: 'inset 0 1px 3px rgba(0,0,60,0.1)',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#1a2a40',
    display: 'block',
    marginBottom: 3,
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, #1a4a8a 0%, #0a1530 100%)',
      }}
    >
      <div
        style={{
          width: 316,
          borderRadius: '8px 8px 4px 4px',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
          border: '1px solid rgba(255,255,255,0.2)',
        }}
      >
        {/* Titlebar */}
        <div
          style={{
            height: 30,
            background:
              'linear-gradient(180deg, #3a7ad4 0%, #1a5acc 42%, #0f3d9a 100%)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 8,
            gap: 6,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '0 0 50% 0',
              background: 'rgba(255,255,255,0.14)',
              pointerEvents: 'none',
            }}
          />
          <img
            src="https://i.imgur.com/cg6eejI.png"
            alt=""
            style={{ width: 16, height: 16, zIndex: 1 }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,50,0.5)',
              zIndex: 1,
            }}
          >
            Winkd Messenger
          </span>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '22px 24px 24px',
            background:
              'linear-gradient(180deg, rgba(222,234,255,0.97) 0%, rgba(200,218,255,0.95) 100%)',
          }}
        >
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <img
              src="https://i.imgur.com/cg6eejI.png"
              alt="Winkd"
              style={{ width: 46, height: 46 }}
            />
            <div
              style={{ fontSize: 17, fontWeight: 700, color: '#0a3a8a', marginTop: 6 }}
            >
              Winkd Messenger
            </div>
            <div style={{ fontSize: 10, color: '#5a7a9a', marginTop: 2 }}>
              Messaging with actual personality
            </div>
          </div>

          {/* Mode tabs — hidden during TOTP step */}
          {mode !== 'totp' && (
            <div
              style={{
                display: 'flex',
                marginBottom: 16,
                borderBottom: '1px solid rgba(100,150,220,0.3)',
              }}
            >
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m)
                    setError('')
                  }}
                  style={{
                    flex: 1,
                    height: 28,
                    border: 'none',
                    background: mode === m ? 'rgba(26,90,204,0.1)' : 'transparent',
                    borderBottom:
                      mode === m ? '2px solid #1a5acc' : '2px solid transparent',
                    fontWeight: mode === m ? 600 : 400,
                    color: mode === m ? '#0a3a8a' : '#5a7a9a',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>
          )}

          {/* ── TOTP challenge step ── */}
          {mode === 'totp' && (
            <form
              onSubmit={handleTotpSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div style={{ textAlign: 'center', marginBottom: 4 }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>🔐</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0a3a8a' }}>
                  Two-Factor Authentication
                </div>
                <div style={{ fontSize: 10, color: '#5a7a9a', marginTop: 3 }}>
                  Enter the 6-digit code from your authenticator app,<br />
                  or paste one of your backup codes.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Code</label>
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={36}
                  placeholder="000000 or backup-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ''))}
                  style={{ ...inputStyle, letterSpacing: '0.12em', textAlign: 'center' }}
                />
              </div>

              {error && (
                <div
                  style={{
                    fontSize: 11,
                    color: '#b03030',
                    background: 'rgba(180,40,40,0.07)',
                    padding: '5px 8px',
                    borderRadius: 3,
                    border: '1px solid rgba(180,40,40,0.2)',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  height: 30,
                  marginTop: 2,
                  borderRadius: 4,
                  border: '1px solid #0a3a8a',
                  background: loading
                    ? 'rgba(100,140,200,0.4)'
                    : 'linear-gradient(180deg, #2060c0 0%, #1450a0 100%)',
                  color: loading ? 'rgba(200,220,255,0.6)' : '#fff',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'Verifying…' : 'Verify'}
              </button>

              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setChallengeToken('') }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 10,
                  color: '#5a7a9a',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                ← Back to Sign In
              </button>
            </form>
          )}

          {/* ── Password login / register form ── */}
          {mode !== 'totp' && <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div>
              <label style={labelStyle}>Username</label>
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
              />
            </div>

            {mode === 'register' && (
              <div>
                <label style={labelStyle}>
                  Email{' '}
                  <span style={{ fontWeight: 400, color: '#7a9ab0' }}>(optional)</span>
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                />
              </div>
            )}

            <div>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                minLength={mode === 'register' ? 10 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
              {mode === 'register' && (
                <div style={{ fontSize: 9, color: '#5a7a9a', marginTop: 3 }}>
                  Minimum 10 characters
                </div>
              )}
            </div>

            {error && (
              <div
                style={{
                  fontSize: 11,
                  color: '#b03030',
                  background: 'rgba(180,40,40,0.07)',
                  padding: '5px 8px',
                  borderRadius: 3,
                  border: '1px solid rgba(180,40,40,0.2)',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                height: 30,
                marginTop: 2,
                borderRadius: 4,
                border: '1px solid #0a3a8a',
                background: loading
                  ? 'rgba(100,140,200,0.4)'
                  : 'linear-gradient(180deg, #2060c0 0%, #1450a0 100%)',
                color: loading ? 'rgba(200,220,255,0.6)' : '#fff',
                fontWeight: 700,
                fontSize: 12,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign In'
                  : 'Create Account'}
            </button>
          </form>}

          {/* OAuth buttons — shown only if providers are configured */}
          {mode !== 'totp' && oauthProviders.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{ flex: 1, height: 1, background: 'rgba(100,150,220,0.25)' }}
                />
                <span style={{ fontSize: 10, color: '#7a9ab0' }}>or continue with</span>
                <div
                  style={{ flex: 1, height: 1, background: 'rgba(100,150,220,0.25)' }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  justifyContent: 'center',
                }}
              >
                {oauthProviders.map((slug) => (
                  <a
                    key={slug}
                    href={`${API_URL}/api/auth/oauth/${slug}/start`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      height: 26,
                      padding: '0 10px',
                      borderRadius: 4,
                      border: '1px solid rgba(100,150,220,0.45)',
                      background:
                        'linear-gradient(180deg, rgba(220,232,255,0.9) 0%, rgba(195,215,250,0.9) 100%)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#1a3a6a',
                      textDecoration: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {PROVIDER_LABELS[slug] ?? slug}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Full login page link */}
          {mode !== 'totp' && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <a
                href="/login.html"
                style={{ fontSize: 10, color: '#5a7a9a', textDecoration: 'underline' }}
              >
                More sign-in options →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
