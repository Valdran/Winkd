import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import type { OwnProfile } from '@winkd/types'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

type Mode = 'login' | 'register'

export function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint =
        mode === 'login' ? '/api/auth/login' : '/api/auth/register'

      const body =
        mode === 'login'
          ? { username, password }
          : { username, password, display_name: displayName || username }

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        setError(
          mode === 'login'
            ? 'Invalid username or password.'
            : 'Registration failed. Try a different username.',
        )
        return
      }

      const data = (await res.json()) as {
        session_token: string
        winkd_id: string
      }

      const profile: OwnProfile = {
        winkdId: data.winkd_id as `${string}#${string}`,
        displayName: displayName || username,
        moodMessage: '',
        status: 'online',
        avatarData: null,
        sessionToken: data.session_token,
      }

      login(data.session_token, profile)
      navigate('/')
    } catch {
      setError('Could not connect to server. Is it running?')
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

          {/* Mode tabs */}
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

          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#1a2a40',
                  display: 'block',
                  marginBottom: 3,
                }}
              >
                Username
              </label>
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
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#1a2a40',
                    display: 'block',
                    marginBottom: 3,
                  }}
                >
                  Display Name
                </label>
                <input
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How contacts see you"
                  style={inputStyle}
                />
              </div>
            )}

            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#1a2a40',
                  display: 'block',
                  marginBottom: 3,
                }}
              >
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                minLength={mode === 'register' ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
              {mode === 'register' && (
                <div style={{ fontSize: 9, color: '#5a7a9a', marginTop: 3 }}>
                  Minimum 8 characters
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
          </form>
        </div>
      </div>
    </div>
  )
}
