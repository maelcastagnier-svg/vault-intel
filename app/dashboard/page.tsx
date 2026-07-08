'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [plan, setPlan] = useState('free')
  const [username, setUsername] = useState('')
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [marketData, setMarketData] = useState<Record<string, string>>({})
  const [dataLoading, setDataLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email })
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

  useEffect(() => {
    async function loadMarketData() {
      const res = await fetch('/api/market-data')
      const data = await res.json()
      setMarketData(data)
      setDataLoading(false)
    }
    loadMarketData()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const TABS = [
    { label: '⚡ Flash Alerts', key: 'flash_alerts', plans: ['alert', 'pro', 'elite'] },
    { label: '💰 Money Making', key: 'money_making', plans: ['pro', 'elite'] },
    { label: '🔧 Patch Analysis', key: 'patch_analysis', plans: ['alert', 'pro', 'elite'] },
    { label: '📈 Radar', key: 'radar', plans: ['pro', 'elite'] },
    { label: '🎯 AH Sniper', key: 'ah_sniper', plans: ['pro', 'elite'] },
  ]

  const PLAN_COLORS: Record<string, string> = {
    alert: '#2a78d6', pro: '#c9a84c', elite: '#9b59b6', free: '#6b6960',
  }

  const hasAccess = (plans: string[]) => plans.includes(plan)

  if (loading) return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9a84c', fontFamily: 'Space Mono, monospace', fontSize: '0.9rem' }}>
      Loading Vault...
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; color: #e8e6df; font-family: 'Space Grotesk', sans-serif; min-height: 100vh; }
        nav { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; border-bottom: 1px solid rgba(201,168,76,0.18); background: rgba(10,10,10,0.95); position: sticky; top: 0; z-index: 100; }
        .logo { font-family: 'Space Mono', monospace; font-size: 1rem; font-weight: 700; color: #c9a84c; letter-spacing: 0.12em; }
        .nav-right { display: flex; align-items: center; gap: 0.75rem; }
        .username { font-size: 0.85rem; color: #e8e6df; font-weight: 500; }
        .plan-badge { font-family: 'Space Mono', monospace; font-size: 0.65rem; padding: 0.2rem 0.6rem; border-radius: 3px; text-transform: uppercase; font-weight: 700; border: 1px solid; }
        .nav-link { font-size: 0.8rem; color: #6b6960; text-decoration: none; transition: color 0.2s; }
        .nav-link:hover { color: #c9a84c; }
        .logout-btn { background: transparent; border: 1px solid rgba(201,168,76,0.18); color: #6b6960; padding: 0.4rem 0.8rem; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-family: 'Space Grotesk', sans-serif; }
        .main { max-width: 1000px; margin: 0 auto; padding: 2rem; }
        .tabs { display: flex; gap: 4px; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .tab { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.85rem; border: 1px solid rgba(201,168,76,0.18); background: #111110; color: #6b6960; cursor: pointer; transition: all 0.2s; font-family: 'Space Grotesk', sans-serif; }
        .tab.active { border-color: #c9a84c; background: rgba(201,168,76,0.1); color: #c9a84c; font-weight: 500; }
        .tab.locked { opacity: 0.4; cursor: not-allowed; }
        .locked-msg { background: #111110; border: 1px solid rgba(201,168,76,0.18); border-radius: 12px; padding: 3rem; text-align: center; }
        .locked-msg h3 { color: #c9a84c; font-size: 1.2rem; margin-bottom: 0.5rem; }
        .locked-msg p { color: #6b6960; font-size: 0.9rem; margin-bottom: 1.5rem; }
        .upgrade-btn { background: #c9a84c; color: #0a0a0a; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 700; cursor: pointer; font-family: 'Space Grotesk', sans-serif; text-decoration: none; display: inline-block; }
        .content { background: #111110; border: 1px solid rgba(201,168,76,0.18); border-radius: 12px; padding: 1.5rem; }
        .content-text { font-size: 0.875rem; line-height: 1.7; color: #e8e6df; white-space: pre-wrap; }
        .content-text h1, .content-text h2, .content-text h3, .content-text h4 { color: #c9a84c; margin: 1rem 0 0.5rem; font-family: 'Space Mono', monospace; font-size: 0.85rem; letter-spacing: 0.05em; }
        .content-text table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.8rem; }
        .content-text th { background: rgba(201,168,76,0.1); color: #c9a84c; padding: 0.4rem 0.6rem; text-align: left; font-family: 'Space Mono', monospace; font-size: 0.7rem; }
        .content-text td { padding: 0.4rem 0.6rem; border-bottom: 1px solid rgba(201,168,76,0.1); color: #e8e6df; }
        .content-text strong { color: #1baf7a; }
        .content-text blockquote { border-left: 2px solid #c9a84c; padding-left: 1rem; color: #6b6960; margin: 0.75rem 0; }
        .loading-data { color: #6b6960; font-size: 0.85rem; text-align: center; padding: 2rem; font-family: 'Space Mono', monospace; }
        .last-update { font-size: 0.7rem; color: #6b6960; margin-bottom: 1rem; font-family: 'Space Mono', monospace; }
      `}</style>

      <nav>
        <div className="logo">VAULT.</div>
        <div className="nav-right">
          <span className="username">{username}</span>
          <span className="plan-badge" style={{ color: PLAN_COLORS[plan], borderColor: PLAN_COLORS[plan] + '66', background: PLAN_COLORS[plan] + '15' }}>
            {plan}
          </span>
          <Link href="/profile" className="nav-link">Profile</Link>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </nav>

      <div className="main">
        <div className="tabs">
          {TABS.map((t, i) => (
            <button key={i} className={`tab ${tab === i ? 'active' : ''} ${!hasAccess(t.plans) ? 'locked' : ''}`} onClick={() => hasAccess(t.plans) && setTab(i)}>
              {t.label} {!hasAccess(t.plans) && '🔒'}
            </button>
          ))}
        </div>

        {!hasAccess(TABS[tab].plans) ? (
          <div className="locked-msg">
            <h3>🔒 Upgrade required</h3>
            <p>This section requires a higher plan.</p>
            <a href="/#pricing" className="upgrade-btn">Upgrade plan</a>
          </div>
        ) : (
          <div className="content">
            {dataLoading ? (
              <div className="loading-data">Loading AI analysis...</div>
            ) : marketData[TABS[tab].key] ? (
              <div>
                <div className="last-update">Last updated: {new Date().toLocaleTimeString('en-US')}</div>
                <div className="content-text" dangerouslySetInnerHTML={{ __html: marketData[TABS[tab].key].replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/### (.*?)(<br>|$)/g, '<h3>$1</h3>').replace(/## (.*?)(<br>|$)/g, '<h2>$1</h2>').replace(/# (.*?)(<br>|$)/g, '<h1>$1</h1>') }} />
              </div>
            ) : (
              <div className="loading-data">No data available yet — AI analysis running...</div>
            )}
          </div>
        )}
      </div>
    </>
  )
}