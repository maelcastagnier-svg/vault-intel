'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Invalid credentials')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; color: #e8e6df; font-family: 'Space Grotesk', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: #111110; border: 1px solid rgba(201,168,76,0.18); border-radius: 12px; padding: 2.5rem; width: 100%; max-width: 400px; margin: 2rem; }
        .logo { font-family: 'Space Mono', monospace; font-size: 1.1rem; font-weight: 700; color: #c9a84c; letter-spacing: 0.12em; text-transform: uppercase; text-align: center; margin-bottom: 0.5rem; }
        .subtitle { text-align: center; font-size: 0.85rem; color: #6b6960; margin-bottom: 2rem; }
        label { display: block; font-size: 0.8rem; color: #6b6960; margin-bottom: 0.4rem; margin-top: 1rem; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Space Mono', monospace; }
        input { width: 100%; background: #1a1917; border: 1px solid rgba(201,168,76,0.18); border-radius: 6px; padding: 0.75rem 1rem; color: #e8e6df; font-size: 0.9rem; font-family: 'Space Grotesk', sans-serif; outline: none; transition: border-color 0.2s; }
        input:focus { border-color: #c9a84c; }
        .btn-gold { width: 100%; background: #c9a84c; color: #0a0a0a; border: none; border-radius: 6px; padding: 0.85rem; font-size: 0.95rem; font-weight: 700; cursor: pointer; margin-top: 1.5rem; font-family: 'Space Grotesk', sans-serif; }
        .btn-gold:disabled { opacity: 0.6; cursor: not-allowed; }
        .error { font-size: 0.8rem; color: #e34948; margin-top: 1rem; text-align: center; padding: 0.6rem; background: rgba(227,73,72,0.1); border-radius: 4px; }
        .divider { border-top: 1px solid rgba(201,168,76,0.18); margin: 1.5rem 0; }
        .private-note { text-align: center; font-size: 0.8rem; color: #6b6960; line-height: 1.5; }
        .private-note a { color: #c9a84c; text-decoration: none; }
        .back { display: block; text-align: center; margin-top: 1.5rem; font-size: 0.8rem; color: #6b6960; text-decoration: none; }
        .back:hover { color: #c9a84c; }
        .hint { font-size: 0.75rem; color: #6b6960; margin-top: 0.3rem; }
      `}</style>
      <div className="card">
        <div className="logo">VAULT.</div>
        <div className="subtitle">Members only — sign in to access your dashboard</div>
        <form onSubmit={handleLogin}>
          <label>Email or Username</label>
          <input
            type="text"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder="you@email.com or your_username"
            required
          />
          <p className="hint">You can sign in with your email or username</p>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn-gold" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <div className="divider" />
        <div className="private-note">
          No account yet?<br />
          <a href="/hypixel-skyblock#pricing">Choose a plan to get access →</a>
        </div>
        <Link href="/" className="back">← Back to home</Link>
      </div>
    </>
  )
}