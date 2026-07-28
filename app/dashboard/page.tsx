'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FlashAlertsPage    from '../../components/FlashAlertsPage'
import MoneyMakingSection from '../../components/MoneyMakingSection'
import PatchSection       from '../../components/PatchSection'
import RadarSection       from '../../components/RadarSection'
import EvolveSection      from './EvolveSection'

function DashboardFooter() {
  return (
    <footer style={{
      maxWidth: 1060, margin: '2rem auto 0', padding: '1.25rem 2rem',
      borderTop: '1px solid rgba(201,168,76,0.12)', textAlign: 'center',
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
      <span className="pixel" style={{ fontSize: 8, letterSpacing: '0.1em' }}>VAULT INTELLIGENCE</span>
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
    { label:'⚡ Flash',   plans:['free','alert','pro','elite'] },
    { label:'💰 Money',   plans:['pro','elite']                },
    { label:'🔧 Patches', plans:['free','alert','pro','elite'] },
    { label:'📡 Radar',   plans:['pro','elite']                },
    { label:'🧬 Evolve',  plans:['pro','elite']                },
  ]

  const hasAccess = (plans: string[]) => plans.includes(plan)

  if (loading) return (
    <div style={{ background:'#080807', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Space Mono, monospace' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');`}</style>
      <div style={{ textAlign:'center' }}>
        <div className="pixel" style={{ fontSize:16, color:'#e8c063', letterSpacing:'0.2em', marginBottom:14, textShadow:'0 0 20px rgba(232,192,99,0.4)' }}>VAULT</div>
        <div style={{ fontSize:10, color:'#3a3a38', letterSpacing:'0.15em' }}>LOADING INTELLIGENCE...</div>
      </div>
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html { background:#080807; }
        /* The dashboard now literally carries the hero scene, not just its hex codes:
           a heavily darkened, fixed copy of the same hero-background.jpg sits behind
           the whole app, plus a real cropped strip of it (undarkened) right below the
           nav so the connection to the marketing hero is immediate, not just numeric. */
        body {
          background-color:#080807; color:#e8e6df; font-family:'Space Grotesk',sans-serif; min-height:100vh;
          background-image: linear-gradient(rgba(8,8,7,0.93), rgba(8,8,7,0.95)), url('/images/hero-background.jpg');
          background-size: cover; background-position: center 30%; background-attachment: fixed;
          background-repeat: no-repeat;
        }
        .pixel { font-family:'Press Start 2P', monospace; }

        .dashboard-hero-strip {
          position: relative; height: 130px; overflow: hidden;
          border-bottom: 2px solid rgba(232,192,99,0.4);
          box-shadow: 0 4px 24px rgba(0,0,0,0.5);
        }
        .dashboard-hero-strip::before {
          content:''; position:absolute; inset:0;
          background-image: url('/images/hero-background.jpg');
          background-size: cover; background-position: center 24%;
        }
        .dashboard-hero-strip::after {
          content:''; position:absolute; inset:0;
          background: linear-gradient(to bottom, rgba(8,8,7,0.55) 0%, rgba(8,8,7,0.25) 50%, rgba(8,8,7,0.85) 100%);
        }
        .dashboard-hero-strip-label {
          position: relative; z-index: 2; height: 100%;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center;
        }
        .dashboard-hero-strip-label .pixel {
          font-size: 13px; color: #e8c063; letter-spacing: 0.12em;
          text-shadow: 0 0 20px rgba(232,192,99,0.7), 0 2px 6px rgba(0,0,0,0.9);
        }
        .dashboard-hero-strip-label span {
          font-size: 11px; color: #d8d0be; margin-top: 8px;
          text-shadow: 0 2px 6px rgba(0,0,0,0.9);
        }
        /* globals.css's .section-label was sized for short marketing eyebrows (0.55rem,
           0.15em tracking). Several dashboard panels (FlashAlertsPage, Evolve tabs) reuse
           the same className for much longer descriptive headers -- override to a size
           that stays legible for a full sentence while keeping the pixel-font identity. */
        .section-label { font-size:10.5px !important; letter-spacing:0.03em !important; margin-bottom:14px !important; }

        .vault-nav {
          display:flex; justify-content:space-between; align-items:center;
          padding:0 2rem; height:56px; border-bottom:1px solid rgba(201,168,76,0.14);
          background:rgba(8,8,7,0.98); position:sticky; top:0; z-index:100; backdrop-filter:blur(12px);
        }
        .vault-logo {
          font-family:'Press Start 2P',monospace; font-size:0.85rem;
          color:#e8c063; letter-spacing:0.1em; text-shadow:0 0 16px rgba(232,192,99,0.45);
        }
        .nav-right { display:flex; align-items:center; gap:10px; }
        .plan-badge {
          font-family:'Press Start 2P',monospace; font-size:8px; padding:4px 8px;
          border-radius:3px; text-transform:uppercase; border:1px solid;
        }
        .logout-btn {
          background:transparent; border:1px solid rgba(201,168,76,0.16); color:#4a4a45;
          padding:4px 10px; border-radius:5px; font-size:11px; cursor:pointer;
          transition:all 0.15s; font-family:'Space Grotesk',sans-serif;
        }
        .logout-btn:hover { border-color:rgba(232,192,99,0.4); color:#9b9b8f; }
        a.nav-link { font-size:11px; color:#4a4a45; text-decoration:none; }
        a.nav-link:hover { color:#c9a84c; }

        .vault-main { max-width:1060px; margin:0 auto; padding:1.5rem 2rem; }

        /* tab bar carries the same gold corner-bracket "vault UI panel" language as the
           landing page's .vault-card, built the same way (layered background gradients,
           no extra markup) so the dashboard reads as the same product as the hero. */
        .vault-tabs {
          position:relative;
          display:flex; gap:3px; margin-bottom:1.5rem; background:rgba(17,17,16,0.85);
          padding:5px; border-radius:6px; width:fit-content;
          border:1px solid rgba(232,192,99,0.35);
          box-shadow: 0 0 24px rgba(232,192,99,0.06), inset 0 1px 0 rgba(255,255,255,0.03);
        }
        .vault-tab {
          padding:8px 18px; border-radius:4px; font-size:12.5px; border:1px solid transparent;
          background:transparent; color:#6b6960; cursor:pointer;
          font-family:'Space Grotesk',sans-serif; font-weight:500;
          transition:all 0.15s; white-space:nowrap;
        }
        .vault-tab.active  {
          background:linear-gradient(135deg, rgba(232,192,99,0.16), rgba(232,192,99,0.06));
          color:#e8c063; border-color:rgba(232,192,99,0.5);
          box-shadow: 0 0 16px rgba(232,192,99,0.2);
          text-shadow: 0 0 12px rgba(232,192,99,0.4);
        }
        .vault-tab.locked  { opacity:0.3; cursor:not-allowed; }
        .vault-tab:not(.locked):not(.active):hover { color:#9b9b8f; }

        .locked-state {
          position:relative;
          background:#111110; border:1px solid rgba(201,168,76,0.14);
          border-radius:4px; padding:3rem; text-align:center;
          background-image:
            linear-gradient(#e8c063,#e8c063), linear-gradient(#e8c063,#e8c063),
            linear-gradient(#e8c063,#e8c063), linear-gradient(#e8c063,#e8c063),
            linear-gradient(#e8c063,#e8c063), linear-gradient(#e8c063,#e8c063),
            linear-gradient(#e8c063,#e8c063), linear-gradient(#e8c063,#e8c063);
          background-repeat:no-repeat;
          background-size:2px 16px, 16px 2px, 2px 16px, 16px 2px, 2px 16px, 16px 2px, 2px 16px, 16px 2px;
          background-position:0 0, 0 0, 100% 0, 100% 0, 0 100%, 0 100%, 100% 100%, 100% 100%;
        }
        .upgrade-btn {
          background:#c9a84c; color:#080807; border:none; padding:10px 22px;
          border-radius:4px; font-weight:700; cursor:pointer; text-decoration:none;
          display:inline-block; font-size:13px; font-family:'Space Grotesk',sans-serif;
        }

        input:focus { border-color:rgba(201,168,76,0.3) !important; }
        textarea:focus { border-color:rgba(201,168,76,0.3) !important; }
        select:focus { border-color:rgba(201,168,76,0.3) !important; }

        ::-webkit-scrollbar { width:3px; height:3px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(201,168,76,0.18); border-radius:2px; }
      `}</style>

      {/* NAV */}
      <nav className="vault-nav">
        <Link href="/" className="vault-logo" style={{ textDecoration: 'none' }}>VAULT.</Link>
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

      {/* Same scene as the marketing hero -- makes the shared identity immediate rather
          than relying on matching hex codes alone. */}
      <div className="dashboard-hero-strip">
        <div className="dashboard-hero-strip-label">
          <div className="pixel">VAULT INTELLIGENCE</div>
          <span>Real-time market intelligence for Hypixel Skyblock</span>
        </div>
      </div>

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
            <div className="pixel" style={{ color:'#e8c063', fontSize:12, marginBottom:12 }}>UPGRADE REQUIRED</div>
            <div style={{ color:'#4a4a45', fontSize:12, marginBottom:20 }}>This section requires a higher plan.</div>
            <a href="/#pricing" className="upgrade-btn">View plans</a>
          </div>
        ) : (
          <>
            {/* ── FLASH ALERTS ── */}
            {tab === 0 && <FlashAlertsPage plan={plan} />}

            {/* ── MONEY MAKING ── */}
            {tab === 1 && <MoneyMakingSection marketData={marketData} dataLoading={dataLoading} />}

            {/* ── PATCHES ── */}
            {tab === 2 && <PatchSection marketData={marketData} dataLoading={dataLoading} />}

            {/* ── RADAR ── */}
            {tab === 3 && <RadarSection marketData={marketData} dataLoading={dataLoading} />}

            {/* ── EVOLVE ── */}
            {tab === 4 && <EvolveSection />}
          </>
        )}
      </div>
      <DashboardFooter />
    </>
  )
}
