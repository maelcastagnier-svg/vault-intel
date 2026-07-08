'use client'
import { useState, useEffect, Suspense } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

function SetupForm() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    async function getSession() {
      const sessionId = searchParams.get('session_id')
      if (sessionId) {
        try {
          const res = await fetch('/api/get-session?session_id=' + sessionId)
          const data = await res.json()
          if (data.email) setEmail(data.email)
        } catch {}
      }
      setFetching(false)
    }
    getSession()
  }, [searchParams])

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (!username.trim()) { setError('Username is required'); return }
    if (username.length < 3 || username.length > 20) { setError('Username must be 3-20 characters'); return }
    setLoading(true)

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } }
    })

    if (signUpError) { setError(signUpError.message); setLoading(false); return }

    await fetch('/api/update-username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username })
    })

    router.push('/confirm-email')
  }

  if (fetching) return (
    <div style={{ textAlign: 'center', color: '#6b6960', padding: '2rem', fontFamily: 'Space Mono, monospace', fontSize: '0.85rem' }}>
      Loading your account...
    </div>
  )

  return (
    <form onSubmit={handleSetup}>
      <label>Email</label>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" required />
      <label>Username</label>
      <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="your_username" required minLength={3} maxLength={20} />
      <p className="hint">3–20 characters, visible in your profile</p>
      <label>Password</label>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} />
      <label>Confirm password</label>
      <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required />
      <div className="requirements">
        <ul>
          <li>Minimum 8 characters</li>
          <li>One uppercase letter recommended</li>
          <li>One number recommended</li>
        </ul>
      </div>
      {error && <div className="error">{error}</div>}
      <button type="submit" className="btn-gold" disabled={loading}>
        {loading ? 'Creating account...' : 'Create my Vault account'}
      </button>
    </form>
  )
}

export default function SetupAccount() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; color: #e8e6df; font-family: 'Space Grotesk', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: #111110; border: 1px solid rgba(201,168,76,0.18); border-radius: 12px; padding: 2.5rem; width: 100%; max-width: 420px; margin: 2rem; }
        .logo { font-family: 'Space Mono', monospace; font-size: 1.1rem; font-weight: 700; color: #c9a84c; letter-spacing: 0.12em; text-transform: uppercase; text-align: center; margin-bottom: 0.5rem; }
        .subtitle { text-align: center; font-size: 0.85rem; color: #6b6960; margin-bottom: 0.5rem; }
        .welcome { text-align: center; font-size: 0.9rem; color: #1baf7a; margin-bottom: 2rem; padding: 0.6rem; background: rgba(27,175,122,0.1); border-radius: 6px; }
        label { display: block; font-size: 0.75rem; color: #6b6960; margin-bottom: 0.4rem; margin-top: 1rem; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Space Mono', monospace; }
        input { width: 100%; background: #1a1917; border: 1px solid rgba(201,168,76,0.18); border-radius: 6px; padding: 0.75rem 1rem; color: #e8e6df; font-size: 0.9rem; font-family: 'Space Grotesk', sans-serif; outline: none; transition: border-color 0.2s; }
        input:focus { border-color: #c9a84c; }
        .hint { font-size: 0.75rem; color: #6b6960; margin-top: 0.35rem; }
        .btn-gold { width: 100%; background: #c9a84c; color: #0a0a0a; border: none; border-radius: 6px; padding: 0.85rem; font-size: 0.95rem; font-weight: 700; cursor: pointer; margin-top: 1.5rem; font-family: 'Space Grotesk', sans-serif; }
        .btn-gold:disabled { opacity: 0.6; cursor: not-allowed; }
        .error { font-size: 0.8rem; color: #e34948; margin-top: 1rem; text-align: center; padding: 0.6rem; background: rgba(227,73,72,0.1); border-radius: 4px; }
        .requirements { margin-top: 1rem; padding: 0.75rem; background: rgba(201,168,76,0.05); border: 1px solid rgba(201,168,76,0.15); border-radius: 6px; }
        .requirements ul { list-style: none; }
        .requirements li { font-size: 0.75rem; color: #6b6960; padding: 0.15rem 0; }
        .requirements li::before { content: '→ '; color: #c9a84c; }
      `}</style>
      <div className="card">
        <div className="logo">VAULT.</div>
        <div className="subtitle">Welcome to the club</div>
        <div className="welcome">✓ Payment confirmed — create your account</div>
        <Suspense fallback={<div style={{color:'#6b6960',textAlign:'center',padding:'2rem'}}>Loading...</div>}>
          <SetupForm />
        </Suspense>
      </div>
    </>
  )
}