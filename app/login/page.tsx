'use client'
import { useState } from 'react'
import { createClient } from '../../lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setError('Check your email to confirm your account.')
      setLoading(false)
    }
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
        .btn-ghost { width: 100%; background: transparent; color: #e8e6df; border: 1px solid rgba(201,168,76,0.18); border-radius: 6px; padding: 0.85rem; font-size: 0.9rem; cursor: pointer; margin-top: 0.75rem; font-family: 'Space Grotesk', sans-serif; }
        .error { font-size: 0.8rem; color: #e34948; margin-top: 1rem; text-align: center; padding: 0.6rem; background: rgba(227,73,72,0.1); border-radius: 4px; }
        .success { font-size: 0.8rem; color: #1baf7a; margin-top: 1rem; text-align: center; padding: 0.6rem; background: rgba(27,175,122,0.1); border-radius: 4px; }
        .back { display: block; text-align: center; margin-top: 1.5rem; font-size: 0.8rem; color: #6b6960; text-decoration: none; }
        .back:hover { color: #c9a84c; }
      `}</style>
      <div className="card">
        <div className="logo">VAULT.</div>
        <div className="subtitle">Access your intelligence dashboard</div>
        <form onSubmit={handleLogin}>
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" required />
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} />
          {error && <div className={error.includes('Check') ? 'success' : 'error'}>{error}</div>}
          <button type="submit" className="btn-gold" disabled={loading}>{loading ? 'Loading...' : 'Sign in'}</button>
          <button type="button" className="btn-ghost" onClick={handleSignup} disabled={loading}>{loading ? 'Loading...' : 'Create account'}</button>
        </form>
        <Link href="/" className="back">← Back to home</Link>
      </div>
    </>
  )
}