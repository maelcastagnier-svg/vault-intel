'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [plan, setPlan] = useState('free')
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      // Pour l'instant tout le monde est "pro" — on connectera Stripe après
      setPlan('pro')
      setLoading(false)
    }
    getUser()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const TABS = [
    { label: '⚡ Flash Alerts', plans: ['alert', 'pro', 'elite'] },
    { label: '💰 Money Making', plans: ['pro', 'elite'] },
    { label: '🔧 Patch Analysis', plans: ['alert', 'pro', 'elite'] },
    { label: '📈 Radar', plans: ['pro', 'elite'] },
    { label: '🎯 AH Sniper', plans: ['pro', 'elite'] },
  ]

  const hasAccess = (plans: string[]) => plans.includes(plan)

  if (loading) return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9a84c', fontFamily: 'monospace' }}>
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
        .nav-right { display: flex; align-items: center; gap: 1rem; }
        .plan-badge { font-family: 'Space Mono', monospace; font-size: 0.65rem; color: #c9a84c; border: 1px solid rgba(201,168,76,0.4); padding: 0.2rem 0.6rem; border-radius: 3px; text-transform: uppercase; }
        .user-email { font-size: 0.8rem; color: #6b6960; }
        .logout-btn { background: transparent; border: 1px solid rgba(201,168,76,0.18); color: #6b6960; padding: 0.4rem 0.8rem; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-family: 'Space Grotesk', sans-serif; }
        .logout-btn:hover { color: #c9a84c; border-color: rgba(201,168,76,0.4); }
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
        .coming-soon { color: #6b6960; font-size: 0.9rem; text-align: center; padding: 2rem; }
        .flash-card { border: 1px solid rgba(27,175,122,0.3); border-left: 3px solid #1baf7a; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
        .flash-card h4 { font-family: 'Space Mono', monospace; font-size: 0.85rem; color: #e8e6df; margin-bottom: 0.5rem; }
        .flash-meta { display: flex; gap: 1rem; font-size: 0.8rem; font-family: 'Space Mono', monospace; color: #6b6960; flex-wrap: wrap; }
        .flash-meta .up { color: #1baf7a; }
        .flash-meta .action { background: rgba(27,175,122,0.15); color: #1baf7a; padding: 0.15rem 0.5rem; border-radius: 3px; font-size: 0.7rem; }
        .section-title { font-size: 0.7rem; font-family: 'Space Mono', monospace; color: #6b6960; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.75rem; margin-top: 1.25rem; }
      `}</style>

      <nav>
        <div className="logo">VAULT.</div>
        <div className="nav-right">
          <span className="plan-badge">{plan}</span>
          <span className="user-email">{user?.email}</span>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </nav>

      <div className="main">
        <div className="tabs">
          {TABS.map((t, i) => (
            <button
              key={i}
              className={`tab ${tab === i ? 'active' : ''} ${!hasAccess(t.plans) ? 'locked' : ''}`}
              onClick={() => hasAccess(t.plans) && setTab(i)}
            >
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
            {tab === 0 && (
              <div>
                <div className="section-title">Bazaar — Top 3</div>
                {[
                  { id: 'FISH_BAIT', buy: 402, sell: 704, spread: 43, vol: '9.2M' },
                  { id: 'ENCHANTED_MUTTON', buy: 907, sell: 1490, spread: 39, vol: '2.7M' },
                  { id: 'ENCHANTED_DARK_OAK_LOG', buy: 2547, sell: 3849, spread: 34, vol: '2.8M' },
                ].map((item, i) => (
                  <div key={i} className="flash-card">
                    <h4>{item.id}</h4>
                    <div className="flash-meta">
                      <span>BUY {item.buy.toLocaleString()}</span>
                      <span>SELL {item.sell.toLocaleString()}</span>
                      <span className="up">SPREAD {item.spread}%</span>
                      <span>VOL {item.vol}</span>
                      <span className="action">BUY NOW</span>
                    </div>
                  </div>
                ))}
                <div className="section-title">AH — Top 3</div>
                {[
                  { id: 'FARM_ARMOR_HELMET', min: '300K', avg: '995K', profit: '~650K/flip' },
                  { id: 'CHEAP_COFFEE', min: '20K', avg: '281K', profit: '~220K/flip' },
                  { id: 'WISE_DRAGON_CHESTPLATE', min: '1.2M', avg: '2.1M', profit: '~800K/flip' },
                ].map((item, i) => (
                  <div key={i} className="flash-card" style={{ borderColor: 'rgba(42,120,214,0.3)', borderLeftColor: '#2a78d6' }}>
                    <h4>{item.id}</h4>
                    <div className="flash-meta">
                      <span>MIN {item.min}</span>
                      <span>AVG {item.avg}</span>
                      <span style={{ color: '#1baf7a' }}>{item.profit}</span>
                      <span className="action" style={{ background: 'rgba(42,120,214,0.15)', color: '#2a78d6' }}>SNIPE</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === 1 && <div className="coming-soon">Money Making content loading from AI analysis...</div>}
            {tab === 2 && <div className="coming-soon">Patch Analysis loading from AI analysis...</div>}
            {tab === 3 && <div className="coming-soon">Investment Radar loading from AI analysis...</div>}
            {tab === 4 && <div className="coming-soon">AH Sniper loading from AI analysis...</div>}
          </div>
        )}
      </div>
    </>
  )
}