'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Profile() {
  const [user, setUser] = useState<any>(null)
  const [plan, setPlan] = useState('free')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const [canceling, setCanceling] = useState(false)
  const [message, setMessage] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const PLAN_COLORS: Record<string, string> = {
    alert: '#2a78d6', pro: '#c9a84c', elite: '#9b59b6', free: '#6b6960',
  }

  const PLAN_FEATURES: Record<string, string[]> = {
    alert: ['#flash-alerts', '#patch-analysis'],
    pro: ['#flash-alerts', '#patch-analysis', '#money-making', '#investment-radar', '#ah-sniper'],
    elite: ['#flash-alerts', '#patch-analysis', '#money-making', '#investment-radar', '#ah-sniper', 'Vault Exclusive AI opportunities'],
    free: [],
  }

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const sub = await res.json()
      if (sub) {
        setPlan(sub.plan || 'free')
        setUsername(sub.username || user.email?.split('@')[0] || '')
      }
      setLoading(false)
    }
    getUser()
  }, [])

  async function handleCancel() {
    if (!confirm('Are you sure you want to cancel your subscription? You will lose access at the end of your billing period.')) return
    setCanceling(true)
    const res = await fetch('/api/cancel-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (data.success) {
      setMessage('Subscription canceled. You will keep access until the end of your billing period.')
      setPlan('free')
    } else {
      setMessage('Error canceling subscription. Please contact support.')
    }
    setCanceling(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  async function handleDeleteAccount() {
    if (deleteInput !== 'DELETE') return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/delete-account', { method: 'POST' })
      const data = await res.json()
      if (!data.success) { setDeleteError(data.error || 'Something went wrong. Please try again or contact support.'); setDeleting(false); return }
      await supabase.auth.signOut()
      router.push('/')
    } catch {
      setDeleteError('Something went wrong. Please try again or contact support.')
      setDeleting(false)
    }
  }

  if (loading) return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9a84c', fontFamily: 'Space Mono, monospace' }}>
      Loading...
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; color: #e8e6df; font-family: 'Space Grotesk', sans-serif; min-height: 100vh; }
        nav { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; border-bottom: 1px solid rgba(201,168,76,0.18); background: rgba(10,10,10,0.95); position: sticky; top: 0; z-index: 100; }
        .logo { font-family: 'Space Mono', monospace; font-size: 1rem; font-weight: 700; color: #c9a84c; letter-spacing: 0.12em; text-decoration: none; }
        .nav-right { display: flex; align-items: center; gap: 0.75rem; }
        .logout-btn { background: transparent; border: 1px solid rgba(201,168,76,0.18); color: #6b6960; padding: 0.4rem 0.8rem; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-family: 'Space Grotesk', sans-serif; }
        .main { max-width: 600px; margin: 0 auto; padding: 2rem; }
        h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 2rem; }
        .card { background: #111110; border: 1px solid rgba(201,168,76,0.18); border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; }
        .card-title { font-family: 'Space Mono', monospace; font-size: 0.65rem; letter-spacing: 0.15em; text-transform: uppercase; color: #6b6960; margin-bottom: 1rem; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid rgba(201,168,76,0.1); font-size: 0.9rem; }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: #6b6960; }
        .info-value { color: #e8e6df; font-weight: 500; }
        .plan-badge { font-family: 'Space Mono', monospace; font-size: 0.7rem; padding: 0.25rem 0.7rem; border-radius: 3px; text-transform: uppercase; font-weight: 700; border: 1px solid; }
        .features { margin-top: 1rem; }
        .feature { font-size: 0.85rem; color: #6b6960; padding: 0.3rem 0; display: flex; gap: 0.5rem; }
        .feature::before { content: '→'; color: #c9a84c; }
        .btn-cancel { width: 100%; background: transparent; border: 1px solid rgba(227,73,72,0.4); color: #e34948; padding: 0.85rem; border-radius: 6px; font-size: 0.9rem; font-weight: 600; cursor: pointer; font-family: 'Space Grotesk', sans-serif; transition: all 0.2s; margin-top: 0.5rem; }
        .btn-cancel:hover { background: rgba(227,73,72,0.1); }
        .btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-upgrade { display: block; text-align: center; background: #c9a84c; color: #0a0a0a; padding: 0.85rem; border-radius: 6px; font-size: 0.9rem; font-weight: 700; text-decoration: none; margin-top: 0.5rem; }
        .message { padding: 0.75rem; border-radius: 6px; font-size: 0.85rem; margin-top: 1rem; text-align: center; background: rgba(27,175,122,0.1); color: #1baf7a; border: 1px solid rgba(27,175,122,0.2); }
        .back { display: inline-flex; align-items: center; gap: 0.5rem; color: #6b6960; text-decoration: none; font-size: 0.85rem; margin-bottom: 1.5rem; }
        .back:hover { color: #c9a84c; }
        .danger-card { border-color: rgba(227,73,72,0.25); }
        .danger-text { font-size: 0.85rem; color: #9b9b8f; line-height: 1.6; margin-bottom: 1rem; }
        .danger-text ul { margin: 0.5rem 0 0.5rem 1.1rem; }
        .danger-text a { color: #c9a84c; }
        .btn-danger { width: 100%; background: transparent; border: 1px solid rgba(227,73,72,0.4); color: #e34948; padding: 0.85rem; border-radius: 6px; font-size: 0.9rem; font-weight: 600; cursor: pointer; font-family: 'Space Grotesk', sans-serif; transition: all 0.2s; }
        .btn-danger:hover { background: rgba(227,73,72,0.1); }
        .confirm-box { margin-top: 1rem; padding: 1rem; background: rgba(227,73,72,0.06); border: 1px solid rgba(227,73,72,0.3); border-radius: 8px; }
        .confirm-box label { display: block; font-size: 0.75rem; color: #6b6960; margin-bottom: 0.5rem; }
        .confirm-box input { width: 100%; background: #1a1917; border: 1px solid rgba(227,73,72,0.3); border-radius: 6px; padding: 0.65rem 0.85rem; color: #e8e6df; font-size: 0.9rem; font-family: 'Space Mono', monospace; outline: none; margin-bottom: 0.75rem; }
        .confirm-actions { display: flex; gap: 0.5rem; }
        .btn-confirm-delete { flex: 1; background: #e34948; color: #fff; border: none; padding: 0.7rem; border-radius: 6px; font-size: 0.85rem; font-weight: 700; cursor: pointer; font-family: 'Space Grotesk', sans-serif; }
        .btn-confirm-delete:disabled { opacity: 0.35; cursor: not-allowed; }
        .btn-cancel-delete { flex: 1; background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #6b6960; padding: 0.7rem; border-radius: 6px; font-size: 0.85rem; cursor: pointer; font-family: 'Space Grotesk', sans-serif; }
        .delete-error { font-size: 0.8rem; color: #e34948; margin-top: 0.75rem; }
        .legal-footer { text-align: center; margin-top: 2rem; font-size: 0.75rem; color: #4a4a45; }
        .legal-footer a { color: #6b6960; text-decoration: none; margin: 0 0.5rem; }
        .legal-footer a:hover { color: #c9a84c; }
      `}</style>

      <nav>
        <Link href="/dashboard" className="logo">VAULT.</Link>
        <div className="nav-right">
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </nav>

      <div className="main">
        <Link href="/dashboard" className="back">← Back to dashboard</Link>
        <h1>My profile</h1>

        <div className="card">
          <div className="card-title">Account</div>
          <div className="info-row">
            <span className="info-label">Username</span>
            <span className="info-value">{username}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Email</span>
            <span className="info-value">{user?.email}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Member since</span>
            <span className="info-value">{new Date(user?.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Subscription</div>
          <div className="info-row">
            <span className="info-label">Current plan</span>
            <span className="plan-badge" style={{ color: PLAN_COLORS[plan], borderColor: PLAN_COLORS[plan] + '66', background: PLAN_COLORS[plan] + '15' }}>
              {plan}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Status</span>
            <span className="info-value" style={{ color: plan !== 'free' ? '#1baf7a' : '#6b6960' }}>
              {plan !== 'free' ? '● Active' : '○ No subscription'}
            </span>
          </div>
          {PLAN_FEATURES[plan]?.length > 0 && (
            <div className="features">
              {PLAN_FEATURES[plan].map((f, i) => (
                <div key={i} className="feature">{f}</div>
              ))}
            </div>
          )}
          {message && <div className="message">{message}</div>}
          {plan !== 'free' ? (
            <button className="btn-cancel" onClick={handleCancel} disabled={canceling}>
              {canceling ? 'Canceling...' : 'Cancel subscription'}
            </button>
          ) : (
            <a href="/hypixel-skyblock#pricing" className="btn-upgrade">Upgrade plan</a>
          )}
        </div>

        <div className="card danger-card">
          <div className="card-title">Danger zone</div>
          <div className="danger-text">
            Deleting your account is permanent and cannot be undone. It will:
            <ul>
              <li>Immediately cancel any active subscription (no further charges)</li>
              <li>Remove your synced SkyBlock game data, Skills cards, missions and progress</li>
              <li>Remove your linked Hypixel account</li>
              <li>Remove your subscription/billing record</li>
              <li>Delete your Vault account itself</li>
            </ul>
            See our <a href="/privacy">Privacy Policy</a> for details.
          </div>

          {!showDeleteConfirm ? (
            <button className="btn-danger" onClick={() => setShowDeleteConfirm(true)}>Delete my account</button>
          ) : (
            <div className="confirm-box">
              <label>Type <strong>DELETE</strong> to confirm — this cannot be undone</label>
              <input
                type="text"
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
              <div className="confirm-actions">
                <button
                  className="btn-cancel-delete"
                  onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); setDeleteError('') }}
                  disabled={deleting}
                >Cancel</button>
                <button
                  className="btn-confirm-delete"
                  onClick={handleDeleteAccount}
                  disabled={deleteInput !== 'DELETE' || deleting}
                >{deleting ? 'Deleting...' : 'Permanently delete'}</button>
              </div>
              {deleteError && <div className="delete-error">{deleteError}</div>}
            </div>
          )}
        </div>

        <div className="legal-footer">
          <a href="/privacy">Privacy Policy</a>·<a href="/terms">Terms of Service</a>
        </div>
      </div>
    </>
  )
}