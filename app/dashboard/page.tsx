'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import EvolveSection from './EvolveSection'
import LiveFlipTicker from '../../components/LiveFlipTicker'

function parsePatchItems(text: string): string[] {
  const cleaned = text.replace(/^#+\s*Live Patches\s*/i, '').trim()
  const lines = cleaned.split('\n')
  const tableRows = lines.filter(l => l.trim().startsWith('|') && !l.includes('---'))
  if (tableRows.length > 1) {
    return tableRows.slice(1).map(row => {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean)
      return cells.join(' — ')
    }).filter(Boolean)
  }
  return cleaned.split(/\n(?=[-•*]\s|\d+\.\s)/).map(s => s.trim()).filter(s => s.length > 5)
}

const MONTH_MAP: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

function extractPatchDate(text: string): number {
  const match = text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})/i)
  if (!match) return 0
  const month = MONTH_MAP[match[1].toLowerCase().slice(0, 3)] ?? 0
  const day = parseInt(match[2], 10)
  return month * 31 + day
}

function sortPatchesNewestFirst(items: string[]): string[] {
  return [...items].sort((a, b) => extractPatchDate(b) - extractPatchDate(a))
}

function parseTable(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim().startsWith('|') && l.includes('|'))
  if (lines.length < 3) return []
  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean)
  return lines.slice(2).map(line => {
    const cells = line.split('|').map(c => c.trim()).filter(Boolean)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (cells[i] || '').replace(/\*\*/g, '') })
    return obj
  }).filter(row => Object.values(row).some(v => v && v !== '---'))
}

function extractSection(text: string, keyword: string): string {
  const lines = text.split('\n')
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && lines[i].match(new RegExp('^#+\\s*(' + keyword + ')', 'i'))) {
      start = i
    } else if (start !== -1 && i > start && lines[i].match(/^#+\s/)) {
      end = i
      break
    }
  }
  return start === -1 ? '' : lines.slice(start, end).join('\n')
}

function ItemIcon({ name, color }: { name: string, color: string }) {
  const clean = name.replace(/\*\*/g, '').replace(/[^A-Z0-9_]/gi, '').toUpperCase()
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 6, flexShrink: 0,
      background: color + '18', border: '1px solid ' + color + '40',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, fontFamily: 'Space Mono, monospace', color, fontWeight: 700
    }}>{clean.slice(0, 2)}</div>
  )
}

function FlashCard({ item, color, type, auctionUuid }: { item: Record<string, string>, color: string, type: string, auctionUuid?: string }) {
  const name = item['Item'] || Object.values(item)[0] || 'Unknown'
  const entries = Object.entries(item).filter(([k]) => k !== 'Item').slice(0, 4)
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    const textToCopy = auctionUuid ? '/viewauction ' + auctionUuid : name.replace(/\*\*/g, '').trim()
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ background: '#111110', border: '0.5px solid ' + color + '30', borderLeft: '3px solid ' + color, borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <ItemIcon name={name} color={color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Space Mono, monospace', color: '#e8e6df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name.slice(0, 35)}</div>
          <div style={{ fontSize: 9, color, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{type}</div>
        </div>
        {type === 'AH' && (
          <button
            onClick={handleCopy}
            title={auctionUuid ? 'Copy /viewauction command' : 'Copy item name for /ah search'}
            style={{ flexShrink: 0, background: copied ? color + '30' : 'transparent', border: '1px solid ' + color + '40', color, fontSize: 9, fontFamily: 'Space Mono, monospace', padding: '3px 7px', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
          >
            {copied ? '✓ Copied' : auctionUuid ? '🎯 /viewauction' : '📋 Copy'}
          </button>
        )}
        <div style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: color + '18', color, fontWeight: 700, fontFamily: 'Space Mono, monospace' }}>
          {type === 'BAZAAR' ? 'FLIP' : 'SNIPE'}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
        {entries.map(([k, v]) => v && (
          <div key={k} style={{ fontSize: 10, fontFamily: 'Space Mono, monospace' }}>
            <span style={{ color: '#6b6960' }}>{k.slice(0, 8)}: </span>
            <span style={{ color: k.toLowerCase().includes('spread') || k.toLowerCase().includes('profit') || k.toLowerCase().includes('action') ? color : '#c8c6bf' }}>{v.slice(0, 20)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MoneyCard({ item, color, onClick }: { item: Record<string, string>, color: string, onClick: () => void }) {
  const name = item['Item'] || item['Method'] || item['Opportunity'] || Object.values(item)[0] || ''
  const cph = item['Coins/hr'] || item['Coins/hr '] || ''
  const conf = item['Conf'] || item['Confidence'] || ''
  return (
    <div onClick={onClick} style={{ background: '#0d0d0c', border: '0.5px solid ' + color + '25', borderLeft: '2px solid ' + color, borderRadius: 6, padding: '10px 12px', cursor: 'pointer', marginBottom: 6 }}
      onMouseEnter={e => (e.currentTarget.style.background = color + '08')}
      onMouseLeave={e => (e.currentTarget.style.background = '#0d0d0c')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ItemIcon name={name} color={color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#e8e6df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name.slice(0, 35)}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
            {cph && <span style={{ fontSize: 10, color, fontFamily: 'Space Mono, monospace' }}>{cph.slice(0, 20)}</span>}
            {conf && <span style={{ fontSize: 9, color: conf.toLowerCase().includes('high') ? '#1baf7a' : '#eda100' }}>● {conf.slice(0, 10)}</span>}
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#6b6960' }}>→</div>
      </div>
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
  const [insights, setInsights] = useState<any[]>([])
  const [ahAuctionData, setAhAuctionData] = useState<any[]>([])
  const [activeInsight, setActiveInsight] = useState<any | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [mmTier, setMmTier] = useState('early')
  const [setupItem, setSetupItem] = useState<Record<string, string> | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      const res = await fetch('/api/subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email }) })
      const sub = await res.json()
      if (sub) { setPlan(sub.plan || 'free'); setUsername(sub.username || user.email?.split('@')[0] || '') }
      setLoading(false)
    }
    getUser()
  }, [])

  useEffect(() => {
    async function loadData() {
      const res = await fetch('/api/market-data')
      const data = await res.json()
      setMarketData(data)
      setInsights(data.insights || [])
      setAhAuctionData(data.ah_live || [])
      setLastUpdate(new Date())
      setDataLoading(false)
    }
    loadData()

    const channel = supabase
      .channel('claude_analysis_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claude_analysis' }, () => {
        loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'insight_patch' }, () => {
        loadData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function handleLogout() { await supabase.auth.signOut(); router.push('/') }

  const TABS = [
    { label: '⚡ Flash Alerts', key: 'flash', plans: ['alert', 'pro', 'elite'] },
    { label: '💰 Money Making', key: 'money', plans: ['pro', 'elite'] },
    { label: '🔧 Patches', key: 'patch', plans: ['alert', 'pro', 'elite'] },
    { label: '📈 Radar', key: 'radar', plans: ['pro', 'elite'] },
    { label: '🧬 Evolve', key: 'evolve', plans: ['elite'] },
  ]

  const PLAN_COLORS: Record<string, string> = { alert: '#2a78d6', pro: '#c9a84c', elite: '#9b59b6', free: '#6b6960' }

  const MM_TIERS = [
    { key: 'early', label: '🌱 Early', target: '5-15M/h', color: '#1baf7a' },
    { key: 'mid', label: '⚔️ Mid', target: '15-35M/h', color: '#c9a84c' },
    { key: 'end', label: '🔥 End', target: '35-70M/h', color: '#e34948' },
    { key: 'late', label: '👑 Late', target: '70M+/h', color: '#9b59b6' },
  ]

  const normalizeItemName = (raw: string) => {
    return raw
      .toLowerCase()
      .replace(/lvl_?\d+_?/gi, '')
      .replace(/^_+|_+$/g, '')
      .replace(/[^a-z0-9]/g, '')
  }

  const findAuctionUuid = (itemName: string) => {
    const clean = normalizeItemName(itemName)
    if (clean.length < 3) return undefined
    const match = ahAuctionData.find(a => {
      const aName = normalizeItemName(a.item_id || a.item_name || '')
      if (aName.length < 3) return false
      return clean.includes(aName) || aName.includes(clean)
    })
    return match?.best_auction_uuid
  }

  const hasAccess = (plans: string[]) => plans.includes(plan)

  const findInsightForPatch = (patchTitle: string) => {
    const cleanTitle = patchTitle.toLowerCase().replace(/[^a-z0-9]/g, '')
    return insights.find(ins => {
      const t = (ins.patch_title || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      return t.length > 4 && (cleanTitle.includes(t) || t.includes(cleanTitle))
    })
  }

  // Parse flash alerts — 3 sous-sections : Bazaar / AH Short Term / AH Mid Term
  const flashText = marketData['flash_alerts'] || ''
  const bazaarSection = flashText.split(/###\s*AH FLIP/i)[0] || flashText
  const afterBazaar = flashText.split(/###\s*AH FLIP/i).slice(1).join('### AH FLIP')
  const ahShortSection = afterBazaar.split(/###\s*AH FLIP\s*—?\s*MID/i)[0] || ''
  const ahMidSection = afterBazaar.split(/###\s*AH FLIP\s*—?\s*MID/i)[1] || ''
  const bazaarItems = parseTable(bazaarSection)
  const ahShortItems = parseTable(ahShortSection)
  const ahMidItems = parseTable(ahMidSection)

  // Parse money making
  const tierKey = 'money_making_' + mmTier
  const tierText = marketData[tierKey] || ''
  const bazaarFlips = parseTable(extractSection(tierText, 'Bazaar Flip'))
  const ahFlips = parseTable(extractSection(tierText, 'AH Flip'))
  const farmMethods = parseTable(extractSection(tierText, 'Farming|Slayer Farming|Farm'))
  const vaultExclusive = parseTable(extractSection(tierText, 'Vault Exclusive'))

  const currentTier = MM_TIERS.find(t => t.key === mmTier) || MM_TIERS[0]

  // Parse patch analysis
  const patchText = marketData['patch_analysis'] || ''
  const patchSplit = patchText.split(/#+\s*Alpha\s*Upcoming/i)
  const patchLive = (patchSplit[0] || '').replace(/^#+\s*Live Patches\s*/i, '').trim()
  const patchAlpha = (patchSplit[1] || '').trim()

  // Parse radar mid/long term
  const radarText = marketData['radar'] || ''
  const radarSplit = radarText.split(/#+\s*Long-Term/i)
  const radarMid = parseTable(radarSplit[0] || '')
  const radarLong = parseTable(radarSplit[1] ? '### Long-Term' + radarSplit[1] : '')

  if (loading) return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9a84c', fontFamily: 'Space Mono, monospace' }}>
      Loading Vault...
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; color: #e8e6df; font-family: 'Space Grotesk', sans-serif; min-height: 100vh; }
        nav { display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 2rem; border-bottom: 1px solid rgba(201,168,76,0.15); background: rgba(8,8,8,0.98); position: sticky; top: 0; z-index: 100; backdrop-filter: blur(10px); }
        .logo { font-family: 'Space Mono', monospace; font-size: 0.98rem; font-weight: 700; color: #c9a84c; letter-spacing: 0.18em; text-shadow: 0 0 16px rgba(201,168,76,0.5); }
        .nav-right { display: flex; align-items: center; gap: 0.65rem; }
        .plan-badge { font-family: 'Space Mono', monospace; font-size: 0.6rem; padding: 0.18rem 0.55rem; border-radius: 3px; text-transform: uppercase; font-weight: 700; border: 1px solid; }
        .nav-link { font-size: 0.78rem; color: #6b6960; text-decoration: none; }
        .nav-link:hover { color: #c9a84c; }
        .logout-btn { background: transparent; border: 1px solid rgba(201,168,76,0.15); color: #6b6960; padding: 0.35rem 0.75rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; font-family: 'Space Grotesk', sans-serif; }
        .main { max-width: 1100px; margin: 0 auto; padding: 1.5rem 2rem; }
        .tabs { display: flex; gap: 3px; margin-bottom: 1.25rem; flex-wrap: wrap; }
        .tab { padding: 0.4rem 0.9rem; border-radius: 5px; font-size: 0.8rem; border: 1px solid rgba(201,168,76,0.15); background: #0f0f0e; color: #6b6960; cursor: pointer; font-family: 'Space Grotesk', sans-serif; }
        .tab.active { border-color: #c9a84c; background: rgba(201,168,76,0.08); color: #c9a84c; font-weight: 500; }
        .tab.locked { opacity: 0.35; cursor: not-allowed; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }
        .col-scroll { max-height: 520px; overflow-y: auto; padding-right: 4px; scrollbar-width: thin; scrollbar-color: rgba(201,168,76,0.15) transparent; }
        .col-scroll::-webkit-scrollbar { width: 3px; }
        .col-scroll::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.15); border-radius: 2px; }
        .section-label { font-family: 'Space Mono', monospace; font-size: 0.66rem; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 12px; font-weight: 700; text-shadow: 0 0 12px currentColor; opacity: 0.95; }
        .mm-tabs { display: flex; gap: 4px; margin-bottom: 14px; flex-wrap: wrap; }
        .mm-tab { padding: 0.35rem 0.85rem; border-radius: 5px; font-size: 0.78rem; border: 1px solid rgba(201,168,76,0.15); background: #0f0f0e; color: #6b6960; cursor: pointer; font-family: 'Space Grotesk', sans-serif; }
        .four-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        @media (max-width: 650px) { .four-grid { grid-template-columns: 1fr; } }
        .sub-card { background: #111110; border: 0.5px solid rgba(201,168,76,0.12); border-radius: 8px; padding: 12px; }
        .sub-label { font-family: 'Space Mono', monospace; font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 10px; font-weight: 700; text-shadow: 0 0 8px currentColor; opacity: 0.9; }
        .locked-msg { background: #111110; border: 1px solid rgba(201,168,76,0.15); border-radius: 12px; padding: 3rem; text-align: center; }
        .locked-msg h3 { color: #c9a84c; font-size: 1.1rem; margin-bottom: 0.5rem; }
        .locked-msg p { color: #6b6960; font-size: 0.85rem; margin-bottom: 1.5rem; }
        .upgrade-btn { background: #c9a84c; color: #0a0a0a; border: none; padding: 0.7rem 1.4rem; border-radius: 5px; font-weight: 700; cursor: pointer; font-family: 'Space Grotesk', sans-serif; text-decoration: none; display: inline-block; }
        .loading-data { color: #6b6960; font-size: 0.82rem; text-align: center; padding: 3rem; font-family: 'Space Mono, monospace'; }
        .setup-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 2rem; }
        .setup-card { background: #111110; border: 1px solid rgba(201,168,76,0.25); border-radius: 12px; padding: 1.75rem; max-width: 480px; width: 100%; }
        .setup-close { float: right; background: transparent; border: none; color: #6b6960; cursor: pointer; font-size: 1.1rem; }
        .ticker { font-family: 'Space Mono', monospace; font-size: 0.65rem; color: #6b6960; margin-bottom: 12px; letter-spacing: 0.08em; }
        .gold-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; background: linear-gradient(135deg, #f0d68a 0%, #c9a84c 50%, #a5822f 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .plain-content { background: #111110; border: 0.5px solid rgba(201,168,76,0.15); border-radius: 10px; padding: 1.25rem; font-size: 12px; color: #9b9b8f; line-height: 1.7; white-space: pre-wrap; max-height: 600px; overflow-y: auto; }
        .patch-list { display: flex; flex-direction: column; gap: 14px; max-height: 600px; overflow-y: auto; padding-right: 4px; }
        .patch-item { background: #111110; border: 0.5px solid rgba(201,168,76,0.15); border-left: 3px solid #c9a84c; border-radius: 8px; padding: 14px 16px; }
        .patch-item-title { font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 700; color: #f0d68a; text-shadow: 0 0 10px rgba(201,168,76,0.35); margin-bottom: 8px; line-height: 1.4; }
        .patch-item-body { font-size: 11.5px; color: #9b9b8f; line-height: 1.7; }
        .patch-alpha-item { background: #111110; border: 0.5px solid rgba(237,161,0,0.2); border-left: 3px solid #eda100; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; font-size: 11.5px; color: #b8b6ad; line-height: 1.7; }
      `}</style>

      <nav>
        <div className="logo">VAULT.</div>
        <div className="nav-right">
          <span style={{ fontSize: '0.82rem', color: '#e8e6df', fontWeight: 500 }}>{username}</span>
          <span className="plan-badge" style={{ color: PLAN_COLORS[plan], borderColor: PLAN_COLORS[plan] + '55', background: PLAN_COLORS[plan] + '12' }}>{plan}</span>
          <Link href="/profile" className="nav-link">Profile</Link>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </nav>

      <div className="main">
        {lastUpdate && (
          <div className="ticker">
            VAULT INTELLIGENCE <span style={{ color: '#1baf7a' }}>● LIVE</span>
            <span style={{ marginLeft: 12 }}>Last update: {lastUpdate.toLocaleTimeString('en-US')}</span>
          </div>
        )}

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
                <div style={{ marginBottom: 20 }}>
                  <LiveFlipTicker type="AH" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <div className="section-label" style={{ color: '#1baf7a' }}>⚡ Bazaar Flip</div>
                  <div style={{ fontSize: 10, color: '#6b6960', marginBottom: 8, fontFamily: 'Space Mono, monospace' }}>ACT NOW</div>
                  <div className="col-scroll">
                    {dataLoading ? <div className="loading-data">Loading...</div> :
                      bazaarItems.length > 0 ? bazaarItems.map((item, i) => <FlashCard key={i} item={item} color="#1baf7a" type="BAZAAR" />) :
                      <div className="loading-data">Scanning market...</div>}
                  </div>
                </div>
                <div>
                  <div className="section-label" style={{ color: '#2a78d6' }}>🎯 AH Flip — Short Term</div>
                  <div style={{ fontSize: 10, color: '#6b6960', marginBottom: 8, fontFamily: 'Space Mono, monospace' }}>SNIPE NOW</div>
                  <div className="col-scroll">
                    {dataLoading ? <div className="loading-data">Loading...</div> :
                      ahShortItems.length > 0 ? ahShortItems.map((item, i) => <FlashCard key={i} item={item} color="#2a78d6" type="AH" auctionUuid={item['UUID'] && item['UUID'] !== 'none' ? item['UUID'] : findAuctionUuid(item['Item'] || Object.values(item)[0] || '')} />) :
                      <div className="loading-data">Scanning AH...</div>}
                  </div>
                </div>
                <div>
                  <div className="section-label" style={{ color: '#9b59b6' }}>📈 AH Flip — Mid Term</div>
                  <div style={{ fontSize: 10, color: '#6b6960', marginBottom: 8, fontFamily: 'Space Mono, monospace' }}>DAYS-WEEKS HORIZON</div>
                  <div className="col-scroll">
                    {dataLoading ? <div className="loading-data">Loading...</div> :
                      ahMidItems.length > 0 ? ahMidItems.map((item, i) => <FlashCard key={i} item={item} color="#9b59b6" type="AH" auctionUuid={item['UUID'] && item['UUID'] !== 'none' ? item['UUID'] : findAuctionUuid(item['Item'] || Object.values(item)[0] || '')} />) :
                      <div className="loading-data">Scanning trends...</div>}
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* MONEY MAKING */}
            {tab === 1 && (
              <div>
                <div className="mm-tabs">
                  {MM_TIERS.map(t => (
                    <button key={t.key} className={`mm-tab ${mmTier === t.key ? 'active' : ''}`}
                      style={mmTier === t.key ? { borderColor: t.color, color: t.color, background: t.color + '12' } : {}}
                      onClick={() => setMmTier(t.key)}>
                      {t.label} <span style={{ fontSize: 9, color: mmTier === t.key ? t.color : '#6b6960', marginLeft: 4, fontFamily: 'Space Mono, monospace' }}>{t.target}</span>
                    </button>
                  ))}
                </div>
                {dataLoading ? <div className="loading-data">Loading AI analysis...</div> : (
                  tierText ? (
                    <div className="four-grid">
                      <div className="sub-card">
                        <div className="sub-label" style={{ color: '#1baf7a' }}>Bazaar Flips</div>
                        {bazaarFlips.length > 0 ? bazaarFlips.slice(0, 3).map((item, i) => <MoneyCard key={i} item={item} color="#1baf7a" onClick={() => setSetupItem(item)} />) :
                          <div style={{ color: '#6b6960', fontSize: 11, fontFamily: 'Space Mono, monospace' }}>Loading...</div>}
                      </div>
                      <div className="sub-card">
                        <div className="sub-label" style={{ color: '#2a78d6' }}>AH Flips</div>
                        {ahFlips.length > 0 ? ahFlips.slice(0, 3).map((item, i) => <MoneyCard key={i} item={item} color="#2a78d6" onClick={() => setSetupItem(item)} />) :
                          <div style={{ color: '#6b6960', fontSize: 11, fontFamily: 'Space Mono, monospace' }}>Loading...</div>}
                      </div>
                      <div className="sub-card">
                        <div className="sub-label" style={{ color: '#eda100' }}>Farming Methods</div>
                        {farmMethods.length > 0 ? farmMethods.slice(0, 3).map((item, i) => <MoneyCard key={i} item={item} color="#eda100" onClick={() => setSetupItem(item)} />) :
                          <div style={{ color: '#6b6960', fontSize: 11, fontFamily: 'Space Mono, monospace' }}>Loading...</div>}
                      </div>
                      <div className="sub-card">
                        <div className="sub-label" style={{ color: '#9b59b6' }}>⚡ Vault Exclusive</div>
                        {vaultExclusive.length > 0 ? vaultExclusive.slice(0, 3).map((item, i) => <MoneyCard key={i} item={item} color="#9b59b6" onClick={() => setSetupItem(item)} />) :
                          <div style={{ color: '#6b6960', fontSize: 11, fontFamily: 'Space Mono, monospace' }}>Loading...</div>}
                      </div>
                    </div>
                  ) : <div className="loading-data">AI analysis running for this tier...</div>
                )}
              </div>
            )}

            {/* PATCH ANALYSIS */}
            {tab === 2 && (
              <div className="two-col">
                <div>
                  <div className="section-label" style={{ color: '#1baf7a', marginBottom: 10 }}>✅ Live Patches</div>
                  <div className="patch-list">
                    {dataLoading ? <div className="loading-data">Loading...</div> :
                      sortPatchesNewestFirst(parsePatchItems(patchLive)).map((item, i) => {
                        const parts = item.split(' — ')
                        const title = parts[0] || item
                        const body = parts.slice(1).join(' — ')
                        const insight = findInsightForPatch(title)
                        return (
                          <div key={i} className="patch-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div className="patch-item-title" style={{ marginBottom: 0 }}>📋 {title.replace(/\*\*/g, '').slice(0, 90)}</div>
                              {insight && (
                                <button
                                  onClick={() => setActiveInsight(insight)}
                                  style={{ flexShrink: 0, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontSize: 10, fontFamily: 'Space Mono, monospace', padding: '3px 9px', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
                                >
                                  MORE →
                                </button>
                              )}
                            </div>
                            {body && <div className="patch-item-body" style={{ marginTop: 8 }}>{body.replace(/\*\*/g, '')}</div>}
                          </div>
                        )
                      })}
                  </div>
                </div>
                <div>
                  <div className="section-label" style={{ color: '#eda100', marginBottom: 10 }}>⚠️ Alpha — Upcoming</div>
                  <div className="patch-list">
                    {dataLoading ? <div className="loading-data">Loading...</div> :
                      patchAlpha.split(/\n(?=[-•*]\s)/).filter(s => s.trim().length > 5).map((item, i) => (
                        <div key={i} className="patch-alpha-item">⚡ {item.replace(/^[-•*]\s*/, '').replace(/\*\*/g, '')}</div>
                      ))}
                    {!dataLoading && !patchAlpha && <div className="patch-alpha-item">Monitoring Hypixel Alpha Network for upcoming changes.</div>}
                  </div>
                </div>
              </div>
            )}

            {/* RADAR */}
            {tab === 3 && (
              <div>
                <div className="section-label" style={{ color: '#c9a84c', marginBottom: 10 }}>Mid/Long term market intelligence</div>
                {dataLoading ? <div className="loading-data">Loading...</div> : (
                  <div className="two-col">
                    <div>
                      <div className="section-label" style={{ color: '#2a78d6' }}>📅 Mid-Term (1-2 weeks)</div>
                      <div className="col-scroll">
                        {radarMid.length > 0 ? radarMid.map((item, i) => <FlashCard key={i} item={item} color="#2a78d6" type="MID" />) :
                          <div className="loading-data">No mid-term data</div>}
                      </div>
                    </div>
                    <div>
                      <div className="section-label" style={{ color: '#9b59b6' }}>🔮 Long-Term (1+ month)</div>
                      <div className="col-scroll">
                        {radarLong.length > 0 ? radarLong.map((item, i) => <FlashCard key={i} item={item} color="#9b59b6" type="LONG" />) :
                          <div className="loading-data">No long-term data</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* EVOLVE */}
            {tab === 4 && (
              <EvolveSection plan={plan} userId={user?.id} />
            )}
          </>
        )}
      </div>

      {setupItem && (
        <div className="setup-overlay" onClick={() => setSetupItem(null)}>
          <div className="setup-card" onClick={e => e.stopPropagation()}>
            <button className="setup-close" onClick={() => setSetupItem(null)}>✕</button>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.7rem', color: '#c9a84c', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>⚙️ Setup Guide</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(setupItem).map(([k, v]) => v && v !== '---' && (
                <div key={k} style={{ borderBottom: '0.5px solid rgba(201,168,76,0.1)', paddingBottom: 10 }}>
                  <div style={{ fontSize: 10, color: '#c9a84c', fontFamily: 'Space Mono, monospace', marginBottom: 3, textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ fontSize: 13, color: '#e8e6df', lineHeight: 1.5 }}>{v.replace(/\*\*/g, '')}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: '0.75rem', background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.12)', borderRadius: 6, fontSize: 11, color: '#6b6960' }}>
              💡 Full gear recommendations coming with Evolve
            </div>
          </div>
        </div>
      )}
      {activeInsight && (
        <div className="setup-overlay" onClick={() => setActiveInsight(null)}>
          <div className="setup-card" onClick={e => e.stopPropagation()}>
            <button className="setup-close" onClick={() => setActiveInsight(null)}>✕</button>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.7rem', color: '#c9a84c', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>📋 Patch Deep-Dive</div>
            <div className="gold-title" style={{ fontSize: 16, marginBottom: 14, lineHeight: 1.4 }}>{activeInsight.patch_title} {activeInsight.patch_date && <span style={{ color: '#6b6960', fontSize: 11, fontFamily: 'Space Mono, monospace' }}>· {activeInsight.patch_date}</span>}</div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 4, fontFamily: 'Space Mono, monospace', fontWeight: 700, background: 'rgba(201,168,76,0.12)', color: '#c9a84c', border: '1px solid rgba(201,168,76,0.3)' }}>
                {activeInsight.action_signal}
              </span>
              <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 4, fontFamily: 'Space Mono, monospace', fontWeight: 700,
                background: activeInsight.confirmed === 'confirmed' ? 'rgba(27,175,122,0.12)' : activeInsight.confirmed === 'contradicted' ? 'rgba(227,73,72,0.12)' : 'rgba(107,105,96,0.12)',
                color: activeInsight.confirmed === 'confirmed' ? '#1baf7a' : activeInsight.confirmed === 'contradicted' ? '#e34948' : '#6b6960',
                border: '1px solid ' + (activeInsight.confirmed === 'confirmed' ? 'rgba(27,175,122,0.3)' : activeInsight.confirmed === 'contradicted' ? 'rgba(227,73,72,0.3)' : 'rgba(107,105,96,0.3)') }}>
                {activeInsight.confirmed === 'confirmed' ? '✓ Confirmed' : activeInsight.confirmed === 'contradicted' ? '✗ Contradicted' : '⏳ Pending'}
              </span>
              {activeInsight.is_alpha && (
                <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 4, fontFamily: 'Space Mono, monospace', fontWeight: 700, background: 'rgba(237,161,0,0.12)', color: '#eda100', border: '1px solid rgba(237,161,0,0.3)' }}>ALPHA</span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {activeInsight.items_affected && activeInsight.items_affected.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: '#c9a84c', fontFamily: 'Space Mono, monospace', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Items Affected</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {activeInsight.items_affected.map((it: string, i: number) => (
                      <span key={i} style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', padding: '3px 8px', background: '#111110', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 4, color: '#e8e6df' }}>{it}</span>
                    ))}
                  </div>
                </div>
              )}

              {activeInsight.price_prediction && (
                <div style={{ borderBottom: '0.5px solid rgba(201,168,76,0.1)', paddingBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#c9a84c', fontFamily: 'Space Mono, monospace', marginBottom: 4, textTransform: 'uppercase' }}>Prediction</div>
                  <div style={{ fontSize: 13, color: '#e8e6df', lineHeight: 1.5 }}>{activeInsight.price_prediction}</div>
                </div>
              )}

              {activeInsight.direct_impact && (
                <div style={{ borderBottom: '0.5px solid rgba(201,168,76,0.1)', paddingBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#1baf7a', fontFamily: 'Space Mono, monospace', marginBottom: 4, textTransform: 'uppercase' }}>🎯 Direct Impact</div>
                  <div style={{ fontSize: 13, color: '#e8e6df', lineHeight: 1.5 }}>{activeInsight.direct_impact}</div>
                </div>
              )}

              {activeInsight.unexpected_impact && (
                <div>
                  <div style={{ fontSize: 10, color: '#9b59b6', fontFamily: 'Space Mono, monospace', marginBottom: 4, textTransform: 'uppercase' }}>🔮 Unexpected Impact</div>
                  <div style={{ fontSize: 13, color: '#e8e6df', lineHeight: 1.5 }}>{activeInsight.unexpected_impact}</div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, padding: '0.6rem 0.75rem', background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.12)', borderRadius: 6, fontSize: 10.5, color: '#6b6960', fontFamily: 'Space Mono, monospace' }}>
              Vault tracks this prediction and self-corrects on next analysis.
            </div>
          </div>
        </div>
      )}
    </>
  )
}