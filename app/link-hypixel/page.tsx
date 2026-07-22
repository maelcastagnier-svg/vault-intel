'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function LinkHypixel() {
  const [username, setUsername] = useState('')
  const [linked, setLinked] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('hypixel_account_links')
        .select('hypixel_username')
        .single()
      if (data?.hypixel_username) setLinked(data.hypixel_username)
      setChecking(false)
    }
    check()
  }, [])

  async function handleLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const res = await fetch('/api/link-hypixel-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Something went wrong')
      setLoading(false)
      return
    }

    setLinked(data.hypixel_username)
    setSuccess(`Linked to ${data.hypixel_username}`)
    setUsername('')
    setLoading(false)
  }

  if (checking) return <p style={{ padding: '2rem', fontFamily: 'monospace' }}>Loading...</p>

  return (
    <div style={{ maxWidth: 420, margin: '3rem auto', padding: '1.5rem', fontFamily: 'monospace' }}>
      <h2>Link your Hypixel account</h2>
      {linked && (
        <p style={{ color: '#1baf7a' }}>Currently linked: <strong>{linked}</strong></p>
      )}
      <form onSubmit={handleLink}>
        <label>{linked ? 'Re-link a different username' : 'Hypixel / Minecraft username'}</label>
        <br />
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="your_ign"
          required
          style={{ padding: '0.5rem', margin: '0.5rem 0', width: '100%' }}
        />
        <br />
        <button type="submit" disabled={loading}>
          {loading ? 'Linking...' : 'Link account'}
        </button>
      </form>
      {error && <p style={{ color: '#e34948' }}>{error}</p>}
      {success && <p style={{ color: '#1baf7a' }}>{success}</p>}
    </div>
  )
}
