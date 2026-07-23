'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FlashAlertsPage    from '../../components/FlashAlertsPage'
import MoneyMakingSection from '../../components/MoneyMakingSection'
import PatchSection       from '../../components/PatchSection'
import RadarSection       from '../../components/RadarSection'

function DashboardFooter() {
  return (
    <footer style={{
      maxWidth: 1060, margin: '2rem auto 0', padding: '1.25rem 2rem',
      borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center',
    }}>
      <p style={{ fontSize: 11, color: '#4a4a45' }}>© 2026 Vault Intelligence. All rights reserved.</p>
      <p style={{ fontSize: 11, color: '#4a4a45', marginTop: 4 }}>
        Not affiliated with Hypixel or Mojang.{' '}
        <a href="/privacy" style={{ color: '#6b6960', textDecoration: 'none' }}>Privacy</a>
        {' · '}
        <a href="/terms" style={{ color: '#6b6960', textDecoration: 'none' }}>Terms</a>
      </p>
    </footer>
  )
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const PLAN_COLORS: Record<string, string> = {
  alert: '#2a78d6', pro: '#c9a84c', elite: '#9b59b6', free: '#6b6960'
}

// ─── Live Ticker ──────────────────────────────────────────────
function LiveTicker({ lastUpdate }: { lastUpdate: Date | null }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = lastUpdate ? Math.floor((now.getTime() - lastUpdate.getTime()) / 1000) : null

  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, fontFamily:'Space Mono, monospace', fontSize:10, color:'#4a4a45', marginBottom:16 }}>
      <span style={{ color:'#1baf7a', display:'flex', alignItems:'center', gap:5 }}>
        <span style={{ width:6, height:6, borderRadius:'50%', background:'#1baf7a', display:'inline-block', boxShadow:'0 0 6px #1baf7a' }} />
        LIVE
      </span>
      <span>VAULT INTELLIGENCE</span>
      {secs !== null && (
        <span style={{ color: secs < 60 ? '#4a4a45' : '#eda100' }}>
          {secs < 60 ? `Updated ${secs}s ago` : `Updated ${Math.floor(secs/60)}m ago`}
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [user,        setUser]        = useState<any>(null)
  const [plan,        setPlan]        = useState('free')
  const [username,    setUsername]    = useState('')
  const [tab,         setTab]         = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [marketData,  setMarketData]  = useState<Record<string,string>>({})
  const [dataLoading, setDataLoading] = useState(true)
  const [lastUpdate,  setLastUpdate]  = useState<Date|null>(null)
  const router   = useRouter()
  const supabase = createClient()

  // Auth
  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
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

  // Market data
  useEffect(() => {
    async function loadData() {
      const res  = await fetch('/api/market-data')
      const data = await res.json()
      setMarketData(data)
      setLastUpdate(new Date())
      setDataLoading(false)
    }
    loadData()

    const channel = supabase.channel('vault_live')
      .on('postgres_changes', { event:'*', schema:'public', table:'claude_analysis' }, loadData)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const TABS = [
    { label:'⚡ Flash',   plans:['alert','pro','elite'] },
    { label:'💰 Money',   plans:['pro','elite']          },
    { label:'🔧 Patches', plans:['alert','pro','elite']  },
    { label:'📡 Radar',   plans:['pro','elite']          },
    { label:'🧬 Evolve',  plans:['pro','elite']          },
  ]

  const hasAccess = (plans: string[]) => plans.includes(plan)

  if (loading) return (
    <div style={{ background:'#080807', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Space Mono, monospace' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:18, color:'#c9a84c', letterSpacing:'0.3em', marginBottom:8 }}>VAULT</div>
        <div style={{ fontSize:10, color:'#3a3a38', letterSpacing:'0.15em' }}>LOADING INTELLIGENCE...</div>
      </div>
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html { background:#080807; }
        body { background:#080807; color:#e8e6df; font-family:'Space Grotesk',sans-serif; min-height:100vh; }

        .vault-nav {
          display:flex; justify-content:space-between; align-items:center;
          padding:0 2rem; height:52px; border-bottom:1px solid rgba(255,255,255,0.05);
          background:rgba(8,8,7,0.98); position:sticky; top:0; z-index:100; backdrop-filter:blur(12px);
        }
        .vault-logo {
          font-family:'Space Mono',monospace; font-size:0.9rem; font-weight:700;
          color:#c9a84c; letter-spacing:0.24em; text-shadow:0 0 20px rgba(201,168,76,0.4);
        }
        .nav-right { display:flex; align-items:center; gap:10px; }
        .plan-badge {
          font-family:'Space Mono',monospace; font-size:9px; padding:2px 7px;
          border-radius:3px; text-transform:uppercase; font-weight:700; border:1px solid;
        }
        .logout-btn {
          background:transparent; border:1px solid rgba(255,255,255,0.07); color:#4a4a45;
          padding:4px 10px; border-radius:5px; font-size:11px; cursor:pointer;
          transition:all 0.15s; font-family:'Space Grotesk',sans-serif;
        }
        .logout-btn:hover { border-color:rgba(255,255,255,0.15); color:#9b9b8f; }
        a.nav-link { font-size:11px; color:#4a4a45; text-decoration:none; }
        a.nav-link:hover { color:#c9a84c; }

        .vault-main { max-width:1060px; margin:0 auto; padding:1.5rem 2rem; }

        .vault-tabs {
          display:flex; gap:2px; margin-bottom:1.5rem; background:#111110;
          padding:3px; border-radius:8px; width:fit-content;
        }
        .vault-tab {
          padding:6px 16px; border-radius:6px; font-size:12px; border:none;
          background:transparent; color:#4a4a45; cursor:pointer;
          font-family:'Space Grotesk',sans-serif; font-weight:500;
          transition:all 0.15s; white-space:nowrap;
        }
        .vault-tab.active  { background:#1e1e1c; color:#e8e6df; }
        .vault-tab.locked  { opacity:0.3; cursor:not-allowed; }
        .vault-tab:not(.locked):not(.active):hover { color:#9b9b8f; }

        .locked-state {
          background:#111110; border:1px solid rgba(255,255,255,0.05);
          border-radius:12px; padding:3rem; text-align:center;
        }
        .upgrade-btn {
          background:#c9a84c; color:#080807; border:none; padding:10px 22px;
          border-radius:7px; font-weight:700; cursor:pointer; text-decoration:none;
          display:inline-block; font-size:13px; font-family:'Space Grotesk',sans-serif;
        }

        input:focus { border-color:rgba(201,168,76,0.3) !important; }
        textarea:focus { border-color:rgba(201,168,76,0.3) !important; }
        select:focus { border-color:rgba(201,168,76,0.3) !important; }

        ::-webkit-scrollbar { width:3px; height:3px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.06); border-radius:2px; }
      `}</style>

      {/* NAV */}
      <nav className="vault-nav">
        <div className="vault-logo">VAULT.</div>
        <div className="nav-right">
          <span style={{ fontSize:12, color:'#e8e6df', fontWeight:500 }}>{username}</span>
          <span
            className="plan-badge"
            style={{
              color:       PLAN_COLORS[plan],
              borderColor: PLAN_COLORS[plan]+'40',
              background:  PLAN_COLORS[plan]+'10'
            }}
          >{plan}</span>
          <Link href="/profile" className="nav-link">Profile</Link>
          <button
            className="logout-btn"
            onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
          >Sign out</button>
        </div>
      </nav>

      <div className="vault-main">
        <LiveTicker lastUpdate={lastUpdate} />

        {/* TABS */}
        <div className="vault-tabs">
          {TABS.map((t, i) => (
            <button
              key={i}
              className={`vault-tab${tab===i?' active':''}${!hasAccess(t.plans)?' locked':''}`}
              onClick={() => hasAccess(t.plans) && setTab(i)}
            >
              {t.label}{!hasAccess(t.plans) && ' 🔒'}
            </button>
          ))}
        </div>

        {/* LOCKED */}
        {!hasAccess(TABS[tab].plans) ? (
          <div className="locked-state">
            <div style={{ fontSize:24, marginBottom:12 }}>🔒</div>
            <div style={{ color:'#c9a84c', fontSize:14, fontWeight:600, marginBottom:6 }}>Upgrade required</div>
            <div style={{ color:'#4a4a45', fontSize:12, marginBottom:20 }}>This section requires a higher plan.</div>
            <a href="/#pricing" className="upgrade-btn">View plans</a>
          </div>
        ) : (
          <>
            {/* ── FLASH ALERTS ── */}
            {tab === 0 && <FlashAlertsPage />}

            {/* ── MONEY MAKING ── */}
            {tab === 1 && <MoneyMakingSection marketData={marketData} dataLoading={dataLoading} />}

            {/* ── PATCHES ── */}
            {tab === 2 && <PatchSection marketData={marketData} dataLoading={dataLoading} />}

            {/* ── RADAR ── */}
            {tab === 3 && <RadarSection marketData={marketData} dataLoading={dataLoading} />}

            {/* ── EVOLVE ── */}
            {tab === 4 && (
              <div style={{ textAlign:'center', padding:'4rem', color:'#2a2a28', fontSize:11, fontFamily:'Space Mono, monospace', letterSpacing:'0.08em' }}>
                🧬 Evolve — coming soon
              </div>
            )}
          </>
        )}
      </div>
      <DashboardFooter />
    </>
  )
}