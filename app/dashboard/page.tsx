'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FlashAlertsPage from '../../components/FlashAlertsPage'
import MoneyMakingSection from '../../components/MoneyMakingSection'
import PatchSection from '../../components/PatchSection'

// ─────────────────────────────────────────────────────────────
// PARSERS
// ─────────────────────────────────────────────────────────────
function parseTable(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim().startsWith('|') && l.includes('|'))
  if (lines.length < 3) return []
  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean)
  return lines.slice(2).map(line => {
    const cells = line.split('|').map(c => c.trim()).filter(Boolean)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (cells[i] || '').replace(/\*\*/g, '') })
    return obj
  }).filter(row => Object.values(row).some(v => v && v !== '---' && v !== 'N/A'))
}

const PLAN_COLORS: Record<string, string> = {
  alert: '#2a78d6', pro: '#c9a84c', elite: '#9b59b6', free: '#6b6960'
}

// ─── FlashCard (Radar) ────────────────────────────────────────
function FlashCard({ item, color, type }: { item: Record<string,string>; color: string; type: string }) {
  const name    = item['Item'] || Object.values(item)[0] || 'Unknown'
  const entries = Object.entries(item).filter(([k]) => k !== 'Item').slice(0, 4)
  const [copied, setCopied] = useState(false)

  return (
    <div style={{ background:'#111110', border:'0.5px solid '+color+'28', borderLeft:'3px solid '+color, borderRadius:8, padding:'12px 14px', marginBottom:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <div style={{ width:30, height:30, borderRadius:6, flexShrink:0, background:color+'12', border:'1px solid '+color+'28', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontFamily:'Space Mono, monospace', color, fontWeight:700 }}>
          {name.replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,2)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:11.5, fontWeight:600, color:'#e8e6df', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name.slice(0,35)}</div>
          <div style={{ fontSize:8.5, color, marginTop:2, textTransform:'uppercase', letterSpacing:'0.08em' }}>{type}</div>
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(name.replace(/\*\*/g,'').trim()); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          style={{ background:copied?color+'28':'transparent', border:'1px solid '+color+'35', color, fontSize:8.5, fontFamily:'Space Mono, monospace', padding:'3px 8px', borderRadius:4, cursor:'pointer', fontWeight:700, flexShrink:0 }}
        >{copied ? '✓' : '📋'}</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'3px 12px' }}>
        {entries.map(([k, v]) => v && (
          <div key={k} style={{ fontSize:9.5, fontFamily:'Space Mono, monospace' }}>
            <span style={{ color:'#4a4a45' }}>{k.slice(0,8)}: </span>
            <span style={{ color: k.toLowerCase().includes('profit')||k.toLowerCase().includes('spread') ? color : '#b8b6ae' }}>{v.slice(0,20)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Live Ticker ──────────────────────────────────────────────
function LiveTicker({ lastUpdate }: { lastUpdate: Date | null }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
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
  const [user, setUser]               = useState<any>(null)
  const [plan, setPlan]               = useState('free')
  const [username, setUsername]       = useState('')
  const [tab, setTab]                 = useState(0)
  const [loading, setLoading]         = useState(true)
  const [marketData, setMarketData]   = useState<Record<string,string>>({})
  const [dataLoading, setDataLoading] = useState(true)
  const [lastUpdate, setLastUpdate]   = useState<Date|null>(null)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      const res = await fetch('/api/subscription', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: user.email }) })
      const sub = await res.json()
      if (sub) { setPlan(sub.plan || 'free'); setUsername(sub.username || user.email?.split('@')[0] || '') }
      setLoading(false)
    }
    getUser()
  }, [])

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
    { label: '⚡ Flash',    plans: ['alert','pro','elite'] },
    { label: '💰 Money',    plans: ['pro','elite'] },
    { label: '🔧 Patches',  plans: ['alert','pro','elite'] },
    { label: '📈 Radar',    plans: ['pro','elite'] },
    { label: '🧬 Evolve',   plans: ['elite'] },
  ]
  const hasAccess = (plans: string[]) => plans.includes(plan)

  // Radar
  const radarText  = marketData['radar'] || ''
  const radarSplit = radarText.split(/#+\s*Long-Term/i)
  const radarMid   = parseTable(radarSplit[0] || '')
  const radarLong  = parseTable(radarSplit[1] ? '### Long-Term' + radarSplit[1] : '')

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
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { background: #080807; }
        body { background: #080807; color: #e8e6df; font-family: 'Space Grotesk', sans-serif; min-height: 100vh; }

        .vault-nav { display:flex; justify-content:space-between; align-items:center; padding:0 2rem; height:52px; border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(8,8,7,0.98); position:sticky; top:0; z-index:100; backdrop-filter:blur(12px); }
        .vault-logo { font-family:'Space Mono',monospace; font-size:0.9rem; font-weight:700; color:#c9a84c; letter-spacing:0.24em; text-shadow:0 0 20px rgba(201,168,76,0.4); }
        .nav-right { display:flex; align-items:center; gap:10px; }
        .plan-badge { font-family:'Space Mono',monospace; font-size:9px; padding:2px 7px; border-radius:3px; text-transform:uppercase; font-weight:700; border:1px solid; }
        .logout-btn { background:transparent; border:1px solid rgba(255,255,255,0.07); color:#4a4a45; padding:4px 10px; border-radius:5px; font-size:11px; cursor:pointer; transition:all 0.15s; font-family:'Space Grotesk',sans-serif; }
        .logout-btn:hover { border-color:rgba(255,255,255,0.15); color:#9b9b8f; }
        a.nav-link { font-size:11px; color:#4a4a45; text-decoration:none; }
        a.nav-link:hover { color:#c9a84c; }

        .vault-main { max-width:1060px; margin:0 auto; padding:1.5rem 2rem; }

        .vault-tabs { display:flex; gap:2px; margin-bottom:1.5rem; background:#111110; padding:3px; border-radius:8px; width:fit-content; }
        .vault-tab { padding:6px 16px; border-radius:6px; font-size:12px; border:none; background:transparent; color:#4a4a45; cursor:pointer; font-family:'Space Grotesk',sans-serif; font-weight:500; transition:all 0.15s; white-space:nowrap; }
        .vault-tab.active { background:#1e1e1c; color:#e8e6df; }
        .vault-tab.locked { opacity:0.3; cursor:not-allowed; }
        .vault-tab:not(.locked):not(.active):hover { color:#9b9b8f; }

        .two-col { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        @media (max-width:680px) { .two-col { grid-template-columns:1fr; } }

        .scroll-area { max-height:520px; overflow-y:auto; padding-right:2px; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.05) transparent; }
        .scroll-area::-webkit-scrollbar { width:2px; }
        .scroll-area::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.06); border-radius:1px; }

        .locked-state { background:#111110; border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:3rem; text-align:center; }
        .upgrade-btn { background:#c9a84c; color:#080807; border:none; padding:10px 22px; border-radius:7px; font-weight:700; cursor:pointer; text-decoration:none; display:inline-block; font-size:13px; font-family:'Space Grotesk',sans-serif; }
        .loading-state { color:#3a3a38; font-size:11px; text-align:center; padding:3rem; font-family:'Space Mono',monospace; letter-spacing:0.08em; }
      `}</style>

      {/* NAV */}
      <nav className="vault-nav">
        <div className="vault-logo">VAULT.</div>
        <div className="nav-right">
          <span style={{ fontSize:12, color:'#e8e6df', fontWeight:500 }}>{username}</span>
          <span className="plan-badge" style={{ color:PLAN_COLORS[plan], borderColor:PLAN_COLORS[plan]+'40', background:PLAN_COLORS[plan]+'10' }}>{plan}</span>
          <Link href="/profile" className="nav-link">Profile</Link>
          <button className="logout-btn" onClick={async () => { await supabase.auth.signOut(); router.push('/') }}>Sign out</button>
        </div>
      </nav>

      <div className="vault-main">
        <LiveTicker lastUpdate={lastUpdate} />

        {/* TABS */}
        <div className="vault-tabs">
          {TABS.map((t, i) => (
            <button
              key={i}
              className={`vault-tab ${tab === i ? 'active' : ''} ${!hasAccess(t.plans) ? 'locked' : ''}`}
              onClick={() => hasAccess(t.plans) && setTab(i)}
            >
              {t.label}{!hasAccess(t.plans) && ' 🔒'}
            </button>
          ))}
        </div>

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
            {tab === 3 && (
              <div>
                <div style={{ fontSize:9.5, fontFamily:'Space Mono, monospace', color:'#c9a84c', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:14, display:'flex', alignItems:'center', gap:6 }}>
                  Market intelligence · Mid &amp; Long term
                </div>
                {dataLoading ? <div className="loading-state">Loading...</div> : (
                  <div className="two-col">
                    <div>
                      <div style={{ fontSize:9.5, fontFamily:'Space Mono, monospace', color:'#2a78d6', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:'#2a78d6', display:'inline-block' }} />
                        Mid-Term · 1-2 weeks
                      </div>
                      <div className="scroll-area">
                        {radarMid.length > 0
                          ? radarMid.map((i, idx) => <FlashCard key={idx} item={i} color="#2a78d6" type="MID" />)
                          : <div className="loading-state">No mid-term signals</div>}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize:9.5, fontFamily:'Space Mono, monospace', color:'#9b59b6', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:'#9b59b6', display:'inline-block' }} />
                        Long-Term · 1+ month
                      </div>
                      <div className="scroll-area">
                        {radarLong.length > 0
                          ? radarLong.map((i, idx) => <FlashCard key={idx} item={i} color="#9b59b6" type="LONG" />)
                          : <div className="loading-state">No long-term signals</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── EVOLVE ── */}
            {tab === 4 && (
              <div className="loading-state">
                🧬 Evolve — coming soon
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}