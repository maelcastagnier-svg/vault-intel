'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Parse Claude markdown tables into structured data
function parseTable(text: string) {
  const lines = text.split('\n').filter(l => l.includes('|'))
  if (lines.length < 2) return []
  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean)
  return lines.slice(2).map(line => {
    const cells = line.split('|').map(c => c.trim()).filter(Boolean)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = cells[i] || '' })
    return obj
  }).filter(row => Object.values(row).some(v => v))
}

function extractSection(text: string, tag: string) {
  const regex = new RegExp('\\[' + tag + '\\]([\\s\\S]*?)(?=\\[|$)')
  const match = text.match(regex)
  return match ? match[1].trim() : text
}

function ItemIcon({ id }: { id: string }) {
  const clean = id?.replace(/[^A-Z0-9_]/gi, '').toUpperCase() || ''
  const colors: Record<string, string> = {
    FISH: '#2a78d6', ENCHANTED: '#9b59b6', SOUL: '#e34948',
    WHALE: '#1baf7a', FARM: '#eda100', WISE: '#2a78d6',
    CHEAP: '#6b6960', RUNE: '#9b59b6', DEFAULT: '#c9a84c'
  }
  const key = Object.keys(colors).find(k => clean.startsWith(k)) || 'DEFAULT'
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 6, flexShrink: 0,
      background: colors[key] + '22', border: '1px solid ' + colors[key] + '44',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, fontFamily: 'Space Mono, monospace', color: colors[key], fontWeight: 700
    }}>
      {clean.slice(0, 2)}
    </div>
  )
}

function FlashCard({ item, type }: { item: Record<string, string>, type: 'bazaar' | 'ah' }) {
  const color = type === 'bazaar' ? '#1baf7a' : '#2a78d6'
  const name = item['Item'] || item['#'] || Object.values(item)[0] || 'Unknown'
  const action = item['Action'] || item['Urgency'] || ''
  const profit = item['Profit'] || item['Est. Profit/Flip'] || item['Action'] || ''

  return (
    <div style={{
      background: '#111110', border: '0.5px solid ' + color + '33',
      borderLeft: '3px solid ' + color, borderRadius: 8,
      padding: '12px 14px', minWidth: 260, maxWidth: 300, flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ItemIcon id={name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Space Mono, monospace', color: '#e8e6df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name.replace(/\*\*/g, '')}
          </div>
          <div style={{ fontSize: 10, color: color, marginTop: 1 }}>
            {type === 'bazaar' ? 'BAZAAR' : 'AUCTION HOUSE'}
          </div>
        </div>
        <div style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: color + '22', color, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {type === 'bazaar' ? 'FLIP' : 'SNIPE'}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10, fontFamily: 'Space Mono, monospace' }}>
        {Object.entries(item).slice(1, 5).map(([k, v]) => v && (
          <span key={k} style={{ color: '#6b6960' }}>
            {k.slice(0, 4)}: <span style={{ color: k.toLowerCase().includes('profit') || k.toLowerCase().includes('spread') ? color : '#e8e6df' }}>{v.replace(/\*\*/g, '').slice(0, 20)}</span>
          </span>
        ))}
      </div>
      {action && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#6b6960', borderTop: '0.5px solid rgba(201,168,76,0.1)', paddingTop: 6 }}>
          {action.replace(/\*\*/g, '').slice(0, 80)}
        </div>
      )}
    </div>
  )
}

function MoneyCard({ item, color }: { item: Record<string, string>, color: string }) {
  const name = item['Item'] || item['Method'] || Object.values(item)[0] || ''
  const cph = item['Coins/hr'] || item['Est. coins/hr'] || item['Coins/hr'] || ''
  return (
    <div style={{
      background: '#0f0f0e', border: '0.5px solid ' + color + '22',
      borderLeft: '2px solid ' + color, borderRadius: 6, padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ItemIcon id={name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#e8e6df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name.replace(/\*\*/g, '')}
          </div>
          {cph && <div style={{ fontSize: 10, color, marginTop: 2, fontFamily: 'Space Mono, monospace' }}>{cph.replace(/\*\*/g, '')}</div>}
        </div>
      </div>
      {Object.entries(item).slice(1, 3).filter(([k]) => !k.toLowerCase().includes('coins')).map(([k, v]) => v && (
        <div key={k} style={{ fontSize: 10, color: '#6b6960', marginTop: 4 }}>
          {k}: <span style={{ color: '#9b9b8f' }}>{v.replace(/\*\*/g, '').slice(0, 60)}</span>
        </div>
      ))}
    </div>
  )
}

function PatchCard({ patch }: { patch: { title: string, content: string, isAlpha: boolean } }) {
  const color = patch.isAlpha ? '#eda100' : '#1baf7a'
  return (
    <div style={{
      background: '#111110', border: '0.5px solid ' + color + '33',
      borderLeft: '3px solid ' + color, borderRadius: 8, padding: '14px 16px', marginBottom: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: color + '22', color, fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>
          {patch.isAlpha ? 'ALPHA' : 'LIVE'}
        </span>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e6df' }}>{patch.title}</div>
      </div>
      <div style={{ fontSize: 12, color: '#9b9b8f', lineHeight: 1.6 }}>{patch.content.slice(0, 300)}...</div>
    </div>
  )
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [plan, setPlan] = useState('free')
  const [username, setUsername] = useState('')
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [marketData, setMarketData] = useState<Record<string, string>>({})
  const [dataLoading, setDataLoading] = useState(true)
  const [mmTier, setMmTier] = useState('early')
  const [setupItem, setSetupItem] = useState<Record<string, string> | null>(null)
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
    const interval = setInterval(loadMarketData, 5 * 60 * 1000)
    return () => clearInterval(interval)
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
    { label: '🧬 Evolve', key: 'evolve', plans: ['elite'] },
  ]

  const PLAN_COLORS: Record<string, string> = {
    alert: '#2a78d6', pro: '#c9a84c', elite: '#9b59b6', free: '#6b6960',
  }

  const MM_TIERS = [
    { key: 'early', label: '🌱 Early', target: '10M+/h', networth: '0–10M' },
    { key: 'mid', label: '⚔️ Mid', target: '25M+/h', networth: '10–500M' },
    { key: 'end', label: '🔥 End', target: '60M+/h', networth: '500M–5B' },
    { key: 'late', label: '👑 Late', target: '100M+/h', networth: '5B+' },
  ]

  const hasAccess = (plans: string[]) => plans.includes(plan)

  const flashContent = marketData['flash_alerts'] || ''
  const bazaarRows = parseTable(flashContent.split('AH')[0])
  const ahRows = parseTable(flashContent.split('AH')[1] || '')

  const mmContent = marketData['money_making'] || ''
  const tierRegex = new RegExp(mmTier.toUpperCase() + '[\\s\\S]*?(?=###|$)', 'i')
  const tierContent = mmContent.match(tierRegex)?.[0] || mmContent

  const bazaarFlips = parseTable(tierContent.split('AH Flip')[0])
  const ahFlips = parseTable(tierContent.split('AH Flip')[1]?.split('Farm')[0] || '')
  const farmMethods = parseTable(tierContent.split('Farm')[1]?.split('Vault')[0] || '')
  const vaultExclusive = parseTable(tierContent.split('Vault Exclusive')[1] || tierContent.split('Exclusive')[1] || '')

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
        .plan-badge { font-family: 'Space Mono', monospace; font-size: 0.65rem; padding: 0.2rem 0.6rem; border-radius: 3px; text-transform: uppercase; font-weight: 700; border: 1px solid; }
        .nav-link { font-size: 0.8rem; color: #6b6960; text-decoration: none; }
        .nav-link:hover { color: #c9a84c; }
        .logout-btn { background: transparent; border: 1px solid rgba(201,168,76,0.18); color: #6b6960; padding: 0.4rem 0.8rem; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-family: 'Space Grotesk', sans-serif; }
        .main { max-width: 1100px; margin: 0 auto; padding: 1.5rem 2rem; }
        .tabs { display: flex; gap: 4px; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .tab { padding: 0.45rem 1rem; border-radius: 6px; font-size: 0.82rem; border: 1px solid rgba(201,168,76,0.18); background: #111110; color: #6b6960; cursor: pointer; font-family: 'Space Grotesk', sans-serif; }
        .tab.active { border-color: #c9a84c; background: rgba(201,168,76,0.1); color: #c9a84c; font-weight: 500; }
        .tab.locked { opacity: 0.4; cursor: not-allowed; }
        .section-label { font-family: 'Space Mono', monospace; font-size: 0.65rem; letter-spacing: 0.15em; text-transform: uppercase; color: #6b6960; margin-bottom: 10px; }
        .scroll-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: thin; scrollbar-color: rgba(201,168,76,0.2) transparent; }
        .scroll-row::-webkit-scrollbar { height: 4px; }
        .scroll-row::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.2); border-radius: 2px; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }
        .card-section { background: #111110; border: 0.5px solid rgba(201,168,76,0.18); border-radius: 10px; padding: 14px; }
        .mm-tabs { display: flex; gap: 4px; margin-bottom: 14px; flex-wrap: wrap; }
        .mm-tab { padding: 0.35rem 0.85rem; border-radius: 5px; font-size: 0.78rem; border: 1px solid rgba(201,168,76,0.18); background: #0f0f0e; color: #6b6960; cursor: pointer; font-family: 'Space Grotesk', sans-serif; }
        .mm-tab.active { border-color: #c9a84c; background: rgba(201,168,76,0.1); color: #c9a84c; }
        .sub-label { font-family: 'Space Mono', monospace; font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase; margin: 12px 0 6px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        @media (max-width: 600px) { .grid-2 { grid-template-columns: 1fr; } }
        .locked-msg { background: #111110; border: 1px solid rgba(201,168,76,0.18); border-radius: 12px; padding: 3rem; text-align: center; }
        .locked-msg h3 { color: #c9a84c; font-size: 1.2rem; margin-bottom: 0.5rem; }
        .locked-msg p { color: #6b6960; font-size: 0.9rem; margin-bottom: 1.5rem; }
        .upgrade-btn { background: #c9a84c; color: #0a0a0a; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 700; cursor: pointer; font-family: 'Space Grotesk', sans-serif; text-decoration: none; display: inline-block; }
        .loading-data { color: #6b6960; font-size: 0.85rem; text-align: center; padding: 3rem; font-family: 'Space Mono, monospace'; }
        .setup-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 2rem; }
        .setup-card { background: #111110; border: 1px solid rgba(201,168,76,0.3); border-radius: 12px; padding: 2rem; max-width: 500px; width: 100%; }
        .setup-card h3 { color: #c9a84c; font-family: 'Space Mono', monospace; font-size: 0.9rem; margin-bottom: 1rem; }
        .setup-close { float: right; background: transparent; border: none; color: #6b6960; cursor: pointer; font-size: 1.2rem; }
        .radar-item { background: #111110; border: 0.5px solid rgba(201,168,76,0.15); border-left: 3px solid; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; }
        .tag { font-size: 9px; padding: 2px 6px; border-radius: 3px; font-family: 'Space Mono', monospace; font-weight: 700; }
        .evolve-card { background: rgba(155,89,182,0.1); border: 1px solid rgba(155,89,182,0.3); border-radius: 10px; padding: 1.5rem; text-align: center; }
      `}</style>

      <nav>
        <div className="logo">VAULT.</div>
        <div className="nav-right">
          <span style={{ fontSize: '0.85rem', color: '#e8e6df', fontWeight: 500 }}>{username}</span>
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
          <>
            {/* FLASH ALERTS */}
            {tab === 0 && (
              <div>
                {dataLoading ? <div className="loading-data">Loading AI analysis...</div> : (
                  <div className="two-col">
                    <div>
                      <div className="section-label" style={{ color: '#1baf7a' }}>⚡ Bazaar — Top opportunities</div>
                      <div className="scroll-row">
                        {bazaarRows.length > 0 ? bazaarRows.map((item, i) => (
                          <FlashCard key={i} item={item} type="bazaar" />
                        )) : (
                          <div style={{ color: '#6b6960', fontSize: 12, padding: '1rem' }}>Analysis loading...</div>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="section-label" style={{ color: '#2a78d6' }}>🎯 Auction House — Top opportunities</div>
                      <div className="scroll-row">
                        {ahRows.length > 0 ? ahRows.map((item, i) => (
                          <FlashCard key={i} item={item} type="ah" />
                        )) : (
                          <div style={{ color: '#6b6960', fontSize: 12, padding: '1rem' }}>Analysis loading...</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MONEY MAKING */}
            {tab === 1 && (
              <div>
                <div className="mm-tabs">
                  {MM_TIERS.map(t => (
                    <button key={t.key} className={`mm-tab ${mmTier === t.key ? 'active' : ''}`} onClick={() => setMmTier(t.key)}>
                      {t.label}
                      <span style={{ fontSize: 9, color: mmTier === t.key ? '#c9a84c' : '#6b6960', marginLeft: 4 }}>{t.target}</span>
                    </button>
                  ))}
                </div>
                {dataLoading ? <div className="loading-data">Loading AI analysis...</div> : (
                  <div>
                    <div className="grid-2">
                      <div className="card-section">
                        <div className="sub-label" style={{ color: '#1baf7a' }}>Bazaar Flips</div>
                        {bazaarFlips.slice(0, 3).map((item, i) => (
                          <div key={i} style={{ cursor: 'pointer' }} onClick={() => setSetupItem(item)}>
                            <MoneyCard item={item} color="#1baf7a" />
                          </div>
                        ))}
                      </div>
                      <div className="card-section">
                        <div className="sub-label" style={{ color: '#2a78d6' }}>AH Flips</div>
                        {ahFlips.slice(0, 3).map((item, i) => (
                          <div key={i} style={{ cursor: 'pointer' }} onClick={() => setSetupItem(item)}>
                            <MoneyCard item={item} color="#2a78d6" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid-2" style={{ marginTop: 10 }}>
                      <div className="card-section">
                        <div className="sub-label" style={{ color: '#eda100' }}>Farming Methods</div>
                        {farmMethods.slice(0, 3).map((item, i) => (
                          <div key={i} style={{ cursor: 'pointer' }} onClick={() => setSetupItem(item)}>
                            <MoneyCard item={item} color="#eda100" />
                          </div>
                        ))}
                      </div>
                      <div className="card-section">
                        <div className="sub-label" style={{ color: '#9b59b6' }}>⚡ Vault Exclusive</div>
                        {vaultExclusive.slice(0, 3).map((item, i) => (
                          <div key={i} style={{ cursor: 'pointer' }} onClick={() => setSetupItem(item)}>
                            <MoneyCard item={item} color="#9b59b6" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PATCH ANALYSIS */}
            {tab === 2 && (
              <div>
                {dataLoading ? <div className="loading-data">Loading AI analysis...</div> : (
                  <div className="two-col">
                    <div>
                      <div className="section-label" style={{ color: '#1baf7a' }}>✅ Live Patches</div>
                      <PatchCard patch={{ title: 'Latest patch analysis', content: marketData['patch_analysis'] || 'No data', isAlpha: false }} />
                    </div>
                    <div>
                      <div className="section-label" style={{ color: '#eda100' }}>⚠️ Alpha — Coming soon</div>
                      <div style={{ background: '#111110', border: '0.5px solid rgba(237,161,0,0.2)', borderRadius: 8, padding: '1rem', color: '#6b6960', fontSize: 12 }}>
                        Alpha patch tracking coming soon — monitoring Hypixel Alpha Network.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* RADAR */}
            {tab === 3 && (
              <div>
                {dataLoading ? <div className="loading-data">Loading AI analysis...</div> : (
                  <div>
                    <div className="section-label" style={{ color: '#c9a84c' }}>Mid/Long term market intelligence</div>
                    <div style={{ background: '#111110', border: '0.5px solid rgba(201,168,76,0.18)', borderRadius: 10, padding: '1.25rem' }}>
                      <div style={{ fontSize: 13, lineHeight: 1.7, color: '#9b9b8f', whiteSpace: 'pre-wrap' }}>
                        {(marketData['radar'] || 'No data available').replace(/\*\*/g, '').slice(0, 2000)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AH SNIPER */}
            {tab === 4 && (
              <div>
                {dataLoading ? <div className="loading-data">Loading AI analysis...</div> : (
                  <div>
                    <div className="section-label" style={{ color: '#2a78d6' }}>Top AH opportunities — Mid term</div>
                    <div className="scroll-row" style={{ flexWrap: 'wrap' }}>
                      {parseTable(marketData['ah_sniper'] || '').slice(0, 20).map((item, i) => (
                        <FlashCard key={i} item={item} type="ah" />
                      ))}
                      {parseTable(marketData['ah_sniper'] || '').length === 0 && (
                        <div style={{ color: '#6b6960', fontSize: 12, padding: '1rem' }}>
                          {(marketData['ah_sniper'] || 'No data').replace(/\*\*/g, '').slice(0, 500)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* EVOLVE */}
            {tab === 5 && (
              <div>
                <div className="evolve-card">
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🧬</div>
                  <h3 style={{ color: '#9b59b6', fontSize: 1.1 + 'rem', marginBottom: 8 }}>Evolve — Personal AI Coach</h3>
                  <p style={{ color: '#6b6960', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
                    Connect your Hypixel account to get personalized recommendations based on your current gear, skills, and networth. Vault will tell you exactly which money-making method to pursue next.
                  </p>
                  <div style={{ background: 'rgba(155,89,182,0.1)', border: '1px solid rgba(155,89,182,0.2)', borderRadius: 8, padding: '1rem', fontSize: 12, color: '#6b6960' }}>
                    🔗 SkyCrypt integration coming soon — link your Hypixel profile to unlock full personalized analysis
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* SETUP OVERLAY */}
      {setupItem && (
        <div className="setup-overlay" onClick={() => setSetupItem(null)}>
          <div className="setup-card" onClick={e => e.stopPropagation()}>
            <button className="setup-close" onClick={() => setSetupItem(null)}>✕</button>
            <h3>⚙️ Setup Guide</h3>
            <div style={{ marginTop: 12 }}>
              {Object.entries(setupItem).map(([k, v]) => v && (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: '#c9a84c', fontFamily: 'Space Mono, monospace', marginBottom: 3, textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ fontSize: 13, color: '#e8e6df', lineHeight: 1.5 }}>{v.replace(/\*\*/g, '')}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: '0.75rem', background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 6, fontSize: 11, color: '#6b6960' }}>
              💡 Full gear setup and SkyCrypt integration coming with Evolve
            </div>
          </div>
        </div>
      )}
    </>
  )
}