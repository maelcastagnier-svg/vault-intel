'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import EvolveSection from './EvolveSection'
import FlashAlertsPage from '../../components/FlashAlertsPage'
import MoneyMakingSection from '../../components/MoneyMakingSection'

// ─────────────────────────────────────────────────────────────
// PARSERS (Patch + Radar)
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

function parsePatchItems(text: string): string[] {
  const cleaned = text.replace(/^#+\s*Live Patches\s*/i, '').trim()
  const lines   = cleaned.split('\n')
  const tableRows = lines.filter(l => l.trim().startsWith('|') && !l.includes('---'))
  if (tableRows.length > 1) {
    return tableRows.slice(1).map(row => {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean)
      return cells.join(' — ')
    }).filter(Boolean)
  }
  return cleaned.split(/\n(?=[-•*]\s|\d+\.\s)/).map(s => s.trim()).filter(s => s.length > 5)
}

const MONTH_MAP: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 }
function extractPatchDate(text: string): number {
  const m = text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})/i)
  return m ? (MONTH_MAP[m[1].toLowerCase().slice(0,3)] ?? 0) * 31 + parseInt(m[2]) : 0
}
function sortPatchesNewest(items: string[]) {
  return [...items].sort((a, b) => extractPatchDate(b) - extractPatchDate(a))
}

const PLAN_COLORS: Record<string, string> = {
  alert: '#2a78d6', pro: '#c9a84c', elite: '#9b59b6', free: '#6b6960'
}

// ─────────────────────────────────────────────────────────────
// FLASH CARD (Radar)
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// LIVE TICKER
// ─────────────────────────────────────────────────────────────
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
  const [insights, setInsights]       = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [activeInsight, setActiveInsight] = useState<any|null>(null)
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
      setInsights(data.insights || [])
      setLastUpdate(new Date())
      setDataLoading(false)
    }
    loadData()
    const channel = supabase.channel('vault_live')
      .on('postgres_changes', { event:'*', schema:'public', table:'claude_analysis' }, loadData)
      .on('postgres_changes', { event:'*', schema:'public', table:'insight_patch' }, loadData)
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

  // Parse patch
  const patchText  = marketData['patch_analysis'] || ''
  const patchSplit = patchText.split(/#+\s*Alpha\s*Upcoming/i)
  const patchLive  = (patchSplit[0] || '').replace(/^#+\s*Live Patches\s*/i, '').trim()
  const patchAlpha = (patchSplit[1] || '').trim()

  // Parse radar
  const radarText  = marketData['radar'] || ''
  const radarSplit = radarText.split(/#+\s*Long-Term/i)
  const radarMid   = parseTable(radarSplit[0] || '')
  const radarLong  = parseTable(radarSplit[1] ? '### Long-Term' + radarSplit[1] : '')

  const findInsight = (title: string) => {
    const t = title.toLowerCase().replace(/[^a-z0-9]/g, '')
    return insights.find(ins => {
      const s = (ins.patch_title || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      return s.length > 4 && (t.includes(s) || s.includes(t))
    })
  }

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
        .logout-btn { background:transparent; border:1px solid rgba(255,255,255,0.07); color:#4a4a45; padding:4px 10px; border-radius:5px; font-size:11px; cursor:pointer; transition:all 0.15s; }
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

        .patch-list { display:flex; flex-direction:column; gap:10px; max-height:560px; overflow-y:auto; padding-right:2px; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.05) transparent; }
        .patch-card { background:#111110; border:1px solid rgba(201,168,76,0.1); border-left:3px solid #c9a84c; border-radius:8px; padding:13px 15px; }
        .patch-card-title { font-size:12px; font-weight:600; color:#e8e6df; margin-bottom:6px; line-height:1.4; }
        .patch-card-body { font-size:11px; color:#6b6960; line-height:1.65; }
        .alpha-card { background:#111110; border:1px solid rgba(237,161,0,0.12); border-left:3px solid #eda100; border-radius:8px; padding:12px 15px; font-size:11px; color:#8b8980; line-height:1.65; }

        .section-eyebrow { font-family:'Space Mono',monospace; font-size:9.5px; letter-spacing:0.15em; text-transform:uppercase; margin-bottom:12px; font-weight:700; display:flex; align-items:center; gap:6px; }

        .locked-state { background:#111110; border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:3rem; text-align:center; }
        .upgrade-btn { background:#c9a84c; color:#080807; border:none; padding:10px 22px; border-radius:7px; font-weight:700; cursor:pointer; text-decoration:none; display:inline-block; font-size:13px; font-family:'Space Grotesk',sans-serif; }
        .loading-state { color:#3a3a38; font-size:11px; text-align:center; padding:3rem; font-family:'Space Mono,monospace'; letter-spacing:0.08em; }
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
            {tab === 1 && (
              <MoneyMakingSection marketData={marketData} dataLoading={dataLoading} />
            )}

            {/* ── PATCHES ── */}
            {tab === 2 && (
              <div className="two-col">
                <div>
                  <div className="section-eyebrow" style={{ color:'#1baf7a' }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:'#1baf7a', display:'inline-block' }} />
                    Live Patches
                  </div>
                  <div className="patch-list">
                    {dataLoading ? <div className="loading-state">Loading...</div> :
                      sortPatchesNewest(parsePatchItems(patchLive)).map((item, i) => {
                        const parts = item.split(' — ')
                        const title = parts[0] || item
                        const body  = parts.slice(1).join(' — ')
                        const ins   = findInsight(title)
                        return (
                          <div key={i} className="patch-card">
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                              <div className="patch-card-title">{title.replace(/\*\*/g,'').slice(0,90)}</div>
                              {ins && (
                                <button
                                  onClick={() => setActiveInsight(ins)}
                                  style={{ flexShrink:0, background:'rgba(201,168,76,0.08)', border:'1px solid rgba(201,168,76,0.2)', color:'#c9a84c', fontSize:9, fontFamily:'Space Mono,monospace', padding:'3px 8px', borderRadius:4, cursor:'pointer', fontWeight:700 }}
                                >DEEP DIVE →</button>
                              )}
                            </div>
                            {body && <div className="patch-card-body">{body.replace(/\*\*/g,'')}</div>}
                          </div>
                        )
                      })
                    }
                  </div>
                </div>
                <div>
                  <div className="section-eyebrow" style={{ color:'#eda100' }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:'#eda100', display:'inline-block' }} />
                    Alpha — Upcoming
                  </div>
                  <div className="patch-list">
                    {dataLoading ? <div className="loading-state">Loading...</div> :
                      patchAlpha.split(/\n(?=[-•*]\s)/).filter(s => s.trim().length > 5).map((item, i) => (
                        <div key={i} className="alpha-card">⚡ {item.replace(/^[-•*]\s*/,'').replace(/\*\*/g,'')}</div>
                      ))
                    }
                    {!dataLoading && !patchAlpha && <div className="alpha-card">Monitoring Hypixel Alpha Network...</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ── RADAR ── */}
            {tab === 3 && (
              <div>
                <div className="section-eyebrow" style={{ color:'#c9a84c', marginBottom:14 }}>
                  Market intelligence · Mid &amp; Long term
                </div>
                {dataLoading ? <div className="loading-state">Loading...</div> : (
                  <div className="two-col">
                    <div>
                      <div className="section-eyebrow" style={{ color:'#2a78d6' }}>📅 Mid-Term · 1-2 weeks</div>
                      <div className="scroll-area">
                        {radarMid.length > 0
                          ? radarMid.map((i, idx) => <FlashCard key={idx} item={i} color="#2a78d6" type="MID" />)
                          : <div className="loading-state">No mid-term signals</div>
                        }
                      </div>
                    </div>
                    <div>
                      <div className="section-eyebrow" style={{ color:'#9b59b6' }}>🔮 Long-Term · 1+ month</div>
                      <div className="scroll-area">
                        {radarLong.length > 0
                          ? radarLong.map((i, idx) => <FlashCard key={idx} item={i} color="#9b59b6" type="LONG" />)
                          : <div className="loading-state">No long-term signals</div>
                        }
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── EVOLVE ── */}
            {tab === 4 && <EvolveSection plan={plan} userId={user?.id} />}
          </>
        )}
      </div>

      {/* PATCH INSIGHT MODAL */}
      {activeInsight && (
        <div
          onClick={() => setActiveInsight(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem', backdropFilter:'blur(8px)' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background:'#0f0f0e', border:'1px solid rgba(201,168,76,0.18)', borderRadius:16, padding:'22px', maxWidth:460, width:'100%', boxShadow:'0 40px 80px rgba(0,0,0,0.8)' }}
          >
            <button onClick={() => setActiveInsight(null)} style={{ float:'right', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', color:'#4a4a45', cursor:'pointer', borderRadius:6, padding:'5px 9px', fontSize:12 }}>✕</button>
            <div style={{ fontSize:9, color:'#c9a84c', fontFamily:'Space Mono,monospace', letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:8 }}>📋 Patch Deep-Dive</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#f0d68a', marginBottom:16, lineHeight:1.3 }}>
              {activeInsight.patch_title}
              {activeInsight.patch_date && <span style={{ color:'#3a3a38', fontSize:10, fontFamily:'Space Mono,monospace', fontWeight:400 }}> · {activeInsight.patch_date}</span>}
            </div>
            {activeInsight.action_signal && (
              <span style={{ fontSize:10, padding:'3px 9px', borderRadius:4, fontFamily:'Space Mono,monospace', fontWeight:700, background:'rgba(201,168,76,0.1)', color:'#c9a84c', border:'1px solid rgba(201,168,76,0.25)', display:'inline-block', marginBottom:16 }}>
                {activeInsight.action_signal}
              </span>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {activeInsight.price_prediction && (
                <div style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', paddingBottom:12 }}>
                  <div style={{ fontSize:9, color:'#c9a84c', fontFamily:'Space Mono,monospace', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.1em' }}>Prediction</div>
                  <div style={{ fontSize:12.5, color:'#cac8c0', lineHeight:1.6 }}>{activeInsight.price_prediction}</div>
                </div>
              )}
              {activeInsight.direct_impact && (
                <div>
                  <div style={{ fontSize:9, color:'#1baf7a', fontFamily:'Space Mono,monospace', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.1em' }}>🎯 Direct Impact</div>
                  <div style={{ fontSize:12.5, color:'#cac8c0', lineHeight:1.6 }}>{activeInsight.direct_impact}</div>
                </div>
              )}
            </div>
            <div style={{ marginTop:16, padding:'8px 12px', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:8, fontSize:10, color:'#3a3a38', fontFamily:'Space Mono,monospace' }}>
              Vault self-corrects this prediction on next analysis run.
            </div>
          </div>
        </div>
      )}
    </>
  )
}