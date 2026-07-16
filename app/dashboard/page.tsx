+'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import EvolveSection from './EvolveSection'
import FlashAlertsPage from '../../components/FlashAlertsPage'

// ============================================================
// PARSERS
// ============================================================
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
  return (MONTH_MAP[match[1].toLowerCase().slice(0, 3)] ?? 0) * 31 + parseInt(match[2], 10)
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
  }).filter(row => Object.values(row).some(v => v && v !== '---' && v !== 'N/A'))
}

function extractSection(text: string, keyword: string): string {
  const lines = text.split('\n')
  let start = -1, end = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && lines[i].match(new RegExp('^#+\\s*(' + keyword + ')', 'i'))) { start = i }
    else if (start !== -1 && i > start && lines[i].match(/^#+\s/)) { end = i; break }
  }
  return start === -1 ? '' : lines.slice(start, end).join('\n')
}

// Extrait le coins/heure depuis les colonnes connues
function extractCoinsPerHour(item: Record<string, string>): string | null {
  const keys = ['Coins/Hour', 'Coins/Hour ', 'Coins/hr', 'Coins/hr ', 'Est. Profit', 'Target Profit', 'Profit/Flip']
  for (const k of keys) {
    if (item[k] && item[k] !== '---' && item[k] !== 'N/A') return item[k]
  }
  return null
}

// ============================================================
// COMPOSANTS UI
// ============================================================
function ItemIcon({ name, color }: { name: string; color: string }) {
  const clean = name.replace(/\*\*/g, '').replace(/[^A-Z0-9_]/gi, '').toUpperCase()
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 7, flexShrink: 0,
      background: color + '15', border: '1px solid ' + color + '35',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, fontFamily: 'Space Mono, monospace', color, fontWeight: 700
    }}>
      {clean.slice(0, 2)}
    </div>
  )
}

function CoinsPerHourBadge({ value, color }: { value: string; color: string }) {
  // Extrait juste les chiffres + M/K pour affichage court
  const short = value.replace(/coins?\/?h(our)?/gi, '').replace(/\s+/g, '').trim()
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: color + '12', border: '1px solid ' + color + '30',
      borderRadius: 20, padding: '2px 8px', marginTop: 6
    }}>
      <span style={{ fontSize: 8, color, fontFamily: 'Space Mono, monospace', letterSpacing: '0.06em' }}>⚡</span>
      <span style={{ fontSize: 10, color, fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>{short.slice(0, 18)}</span>
      <span style={{ fontSize: 8, color: color + 'aa', fontFamily: 'Space Mono, monospace' }}>/h</span>
    </div>
  )
}

function MoneyCard({ item, color, onClick }: { item: Record<string, string>; color: string; onClick: () => void }) {
  const name = item['Item'] || item['Method'] || item['Opportunity'] || Object.values(item)[0] || ''
  const coins = extractCoinsPerHour(item)
  const conf  = item['Conf'] || item['Confidence'] || ''
  const confColor = conf.toLowerCase().includes('high') ? '#1baf7a'
    : conf.toLowerCase().includes('low') ? '#e34948'
    : '#eda100'

  return (
    <div
      onClick={onClick}
      style={{
        background: '#0d0d0c',
        border: '0.5px solid ' + color + '22',
        borderLeft: '2px solid ' + color,
        borderRadius: 7,
        padding: '10px 12px',
        cursor: 'pointer',
        marginBottom: 7,
        transition: 'background 0.15s ease'
      }}
      onMouseEnter={e => (e.currentTarget.style.background = color + '08')}
      onMouseLeave={e => (e.currentTarget.style.background = '#0d0d0c')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <ItemIcon name={name} color={color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: '#e8e6df',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {name.replace(/\*\*/g, '').slice(0, 36)}
          </div>
          {coins && <CoinsPerHourBadge value={coins} color={color} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {conf && (
            <span style={{
              fontSize: 8, color: confColor,
              fontFamily: 'Space Mono, monospace',
              background: confColor + '12',
              border: '1px solid ' + confColor + '30',
              padding: '1px 5px', borderRadius: 3
            }}>
              {conf.slice(0, 4).toUpperCase()}
            </span>
          )}
          <span style={{ fontSize: 10, color: '#3a3a38' }}>→</span>
        </div>
      </div>
    </div>
  )
}

function FlashCard({ item, color, type }: { item: Record<string, string>; color: string; type: string }) {
  const name    = item['Item'] || Object.values(item)[0] || 'Unknown'
  const entries = Object.entries(item).filter(([k]) => k !== 'Item').slice(0, 4)
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(name.replace(/\*\*/g, '').trim())
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
        <button onClick={handleCopy} style={{ flexShrink: 0, background: copied ? color + '30' : 'transparent', border: '1px solid ' + color + '40', color, fontSize: 9, fontFamily: 'Space Mono, monospace', padding: '3px 7px', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>
          {copied ? '✓' : '📋'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
        {entries.map(([k, v]) => v && (
          <div key={k} style={{ fontSize: 10, fontFamily: 'Space Mono, monospace' }}>
            <span style={{ color: '#6b6960' }}>{k.slice(0, 8)}: </span>
            <span style={{ color: k.toLowerCase().includes('spread') || k.toLowerCase().includes('profit') ? color : '#c8c6bf' }}>{v.slice(0, 20)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// SETUP MODAL — redesigné
// ============================================================
function SetupModal({ item, onClose }: { item: Record<string, string>; onClose: () => void }) {
  const name   = item['Item'] || item['Method'] || Object.values(item)[0] || ''
  const coins  = extractCoinsPerHour(item)
  const conf   = item['Conf'] || item['Confidence'] || ''

  // Colonnes à afficher dans le détail (tout sauf le nom)
  const detailKeys = Object.keys(item).filter(k =>
    k !== 'Item' && k !== 'Method' && k !== 'Opportunity' && item[k] && item[k] !== '---'
  )

  // Icône par catégorie de colonne
  const keyIcon = (k: string): string => {
    const l = k.toLowerCase()
    if (l.includes('setup') || l.includes('gear'))    return '🛡️'
    if (l.includes('access') || l.includes('power'))  return '💍'
    if (l.includes('stone') || l.includes('gem'))     return '💎'
    if (l.includes('req'))                             return '📋'
    if (l.includes('math') || l.includes('how'))      return '🧮'
    if (l.includes('insight') || l.includes('edge'))  return '🔮'
    if (l.includes('why'))                             return '💡'
    if (l.includes('coin') || l.includes('profit'))   return '⚡'
    if (l.includes('capital'))                         return '💰'
    if (l.includes('conf'))                            return '📊'
    return '›'
  }

  const confColor = conf.toLowerCase().includes('high') ? '#1baf7a'
    : conf.toLowerCase().includes('low') ? '#e34948'
    : '#eda100'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0f0f0e', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 14, padding: '1.75rem', maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 9, color: '#c9a84c', fontFamily: 'Space Mono, monospace', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
              ⚙️ Setup Guide
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f0d68a', lineHeight: 1.3, maxWidth: 380 }}>
              {name.replace(/\*\*/g, '').slice(0, 60)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#6b6960', cursor: 'pointer', fontSize: 13, borderRadius: 6, padding: '4px 8px', flexShrink: 0, marginLeft: 12 }}>✕</button>
        </div>

        {/* Coins/heure + confidence en bandeau */}
        {(coins || conf) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            {coins && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1baf7a15', border: '1px solid #1baf7a35', borderRadius: 8, padding: '6px 12px' }}>
                <span style={{ fontSize: 16 }}>⚡</span>
                <div>
                  <div style={{ fontSize: 9, color: '#1baf7a', fontFamily: 'Space Mono, monospace', letterSpacing: '0.08em' }}>COINS/HOUR</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1baf7a', fontFamily: 'Space Mono, monospace' }}>{coins.replace(/coins?\/?h(our)?/gi, '').trim()}</div>
                </div>
              </div>
            )}
            {conf && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: confColor + '12', border: '1px solid ' + confColor + '35', borderRadius: 8, padding: '6px 12px' }}>
                <div>
                  <div style={{ fontSize: 9, color: confColor, fontFamily: 'Space Mono, monospace', letterSpacing: '0.08em' }}>CONFIDENCE</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: confColor, fontFamily: 'Space Mono, monospace' }}>{conf.slice(0, 4).toUpperCase()}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Détails par section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {detailKeys
            .filter(k => !['Coins/Hour', 'Coins/hr', 'Coins/Hour ', 'Coins/hr ', 'Conf', 'Confidence'].includes(k))
            .map(k => (
            <div key={k} style={{ padding: '10px 0', borderBottom: '0.5px solid rgba(201,168,76,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 11 }}>{keyIcon(k)}</span>
                <span style={{ fontSize: 9, color: '#c9a84c', fontFamily: 'Space Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{k}</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#d8d6cf', lineHeight: 1.65, paddingLeft: 18 }}>
                {item[k].replace(/\*\*/g, '')}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 16, padding: '0.65rem 0.85rem', background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.1)', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: '#6b6960', fontFamily: 'Space Mono, monospace' }}>
            💡 Vault updates this analysis twice daily with current market prices
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// DASHBOARD PRINCIPAL
// ============================================================
export default function Dashboard() {
  const [user, setUser]               = useState<any>(null)
  const [plan, setPlan]               = useState('free')
  const [username, setUsername]       = useState('')
  const [tab, setTab]                 = useState(0)
  const [loading, setLoading]         = useState(true)
  const [marketData, setMarketData]   = useState<Record<string, string>>({})
  const [insights, setInsights]       = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [mmTier, setMmTier]           = useState('early')
  const [setupItem, setSetupItem]     = useState<Record<string, string> | null>(null)
  const [activeInsight, setActiveInsight] = useState<any | null>(null)
  const [lastUpdate, setLastUpdate]   = useState<Date | null>(null)
  const router  = useRouter()
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
      const res  = await fetch('/api/market-data')
      const data = await res.json()
      setMarketData(data)
      setInsights(data.insights || [])
      setLastUpdate(new Date())
      setDataLoading(false)
    }
    loadData()
    const channel = supabase
      .channel('claude_analysis_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claude_analysis' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'insight_patch' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function handleLogout() { await supabase.auth.signOut(); router.push('/') }

  const TABS = [
    { label: '⚡ Flash Alerts', key: 'flash', plans: ['alert', 'pro', 'elite'] },
    { label: '💰 Money Making', key: 'money', plans: ['pro', 'elite'] },
    { label: '🔧 Patches',      key: 'patch', plans: ['alert', 'pro', 'elite'] },
    { label: '📈 Radar',        key: 'radar', plans: ['pro', 'elite'] },
    { label: '🧬 Evolve',       key: 'evolve', plans: ['elite'] },
  ]

  const PLAN_COLORS: Record<string, string> = { alert: '#2a78d6', pro: '#c9a84c', elite: '#9b59b6', free: '#6b6960' }

  const MM_TIERS = [
    { key: 'early', label: '🌱 Early', target: '10M/h',  color: '#1baf7a' },
    { key: 'mid',   label: '⚔️ Mid',   target: '25M/h',  color: '#c9a84c' },
    { key: 'end',   label: '🔥 End',   target: '50M/h',  color: '#e34948' },
    { key: 'late',  label: '👑 Late',  target: '70M+/h', color: '#9b59b6' },
  ]

  const hasAccess = (plans: string[]) => plans.includes(plan)

  const findInsightForPatch = (patchTitle: string) => {
    const cleanTitle = patchTitle.toLowerCase().replace(/[^a-z0-9]/g, '')
    return insights.find(ins => {
      const t = (ins.patch_title || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      return t.length > 4 && (cleanTitle.includes(t) || t.includes(cleanTitle))
    })
  }

  // Parse money making
  const tierKey     = 'money_making_' + mmTier
  const tierText    = marketData[tierKey] || ''
  const bazaarFlips = parseTable(extractSection(tierText, 'BAZAAR FLIP|Bazaar Flip'))
  const ahFlips     = parseTable(extractSection(tierText, 'AH FLIP|AH Flip'))
  const grindMethods = parseTable(extractSection(tierText, 'ACTIVE GRIND|Active Grind|Farming|Farm'))
  const vaultEx     = parseTable(extractSection(tierText, 'VAULT EXCLUSIVE|Vault Exclusive'))
  const currentTier = MM_TIERS.find(t => t.key === mmTier) || MM_TIERS[0]

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
        .logout-btn { background: transparent; border: 1px solid rgba(201,168,76,0.15); color: #6b6960; padding: 0.35rem 0.75rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; }
        .main { max-width: 1100px; margin: 0 auto; padding: 1.5rem 2rem; }
        .tabs { display: flex; gap: 3px; margin-bottom: 1.25rem; flex-wrap: wrap; }
        .tab { padding: 0.4rem 0.9rem; border-radius: 5px; font-size: 0.8rem; border: 1px solid rgba(201,168,76,0.15); background: #0f0f0e; color: #6b6960; cursor: pointer; }
        .tab.active { border-color: #c9a84c; background: rgba(201,168,76,0.08); color: #c9a84c; font-weight: 500; }
        .tab.locked { opacity: 0.35; cursor: not-allowed; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }
        .col-scroll { max-height: 520px; overflow-y: auto; padding-right: 4px; scrollbar-width: thin; scrollbar-color: rgba(201,168,76,0.15) transparent; }
        .col-scroll::-webkit-scrollbar { width: 3px; }
        .col-scroll::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.15); border-radius: 2px; }
        .section-label { font-family: 'Space Mono', monospace; font-size: 0.66rem; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 12px; font-weight: 700; opacity: 0.95; }
        .mm-tabs { display: flex; gap: 4px; margin-bottom: 14px; flex-wrap: wrap; }
        .mm-tab { padding: 0.35rem 0.85rem; border-radius: 5px; font-size: 0.78rem; border: 1px solid rgba(201,168,76,0.15); background: #0f0f0e; color: #6b6960; cursor: pointer; }
        .four-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        @media (max-width: 650px) { .four-grid { grid-template-columns: 1fr; } }
        .sub-card { background: #111110; border: 0.5px solid rgba(201,168,76,0.1); border-radius: 10px; padding: 14px; }
        .sub-label { font-family: 'Space Mono', monospace; font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 10px; font-weight: 700; }
        .locked-msg { background: #111110; border: 1px solid rgba(201,168,76,0.15); border-radius: 12px; padding: 3rem; text-align: center; }
        .locked-msg h3 { color: #c9a84c; font-size: 1.1rem; margin-bottom: 0.5rem; }
        .locked-msg p { color: #6b6960; font-size: 0.85rem; margin-bottom: 1.5rem; }
        .upgrade-btn { background: #c9a84c; color: #0a0a0a; border: none; padding: 0.7rem 1.4rem; border-radius: 5px; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-block; }
        .loading-data { color: #6b6960; font-size: 0.82rem; text-align: center; padding: 3rem; font-family: 'Space Mono, monospace'; }
        .ticker { font-family: 'Space Mono', monospace; font-size: 0.65rem; color: #6b6960; margin-bottom: 12px; letter-spacing: 0.08em; }
        .gold-title { font-weight: 700; background: linear-gradient(135deg, #f0d68a 0%, #c9a84c 50%, #a5822f 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .patch-list { display: flex; flex-direction: column; gap: 14px; max-height: 600px; overflow-y: auto; padding-right: 4px; }
        .patch-item { background: #111110; border: 0.5px solid rgba(201,168,76,0.15); border-left: 3px solid #c9a84c; border-radius: 8px; padding: 14px 16px; }
        .patch-item-title { font-size: 13px; font-weight: 700; color: #f0d68a; margin-bottom: 8px; line-height: 1.4; }
        .patch-item-body { font-size: 11.5px; color: #9b9b8f; line-height: 1.7; }
        .patch-alpha-item { background: #111110; border: 0.5px solid rgba(237,161,0,0.2); border-left: 3px solid #eda100; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; font-size: 11.5px; color: #b8b6ad; line-height: 1.7; }
        .tier-header { display: flex; align-items: center; gap: 10; margin-bottom: 14px; padding: 10px 14px; background: ${currentTier.color}08; border: 1px solid ${currentTier.color}20; border-radius: 8px; }
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
            {tab === 0 && <FlashAlertsPage />}

            {/* MONEY MAKING */}
            {tab === 1 && (
              <div>
                {/* Tier selector */}
                <div className="mm-tabs">
                  {MM_TIERS.map(t => (
                    <button
                      key={t.key}
                      className={`mm-tab ${mmTier === t.key ? 'active' : ''}`}
                      style={mmTier === t.key ? { borderColor: t.color, color: t.color, background: t.color + '12' } : {}}
                      onClick={() => setMmTier(t.key)}
                    >
                      {t.label}
                      <span style={{ fontSize: 9, color: mmTier === t.key ? t.color : '#6b6960', marginLeft: 5, fontFamily: 'Space Mono, monospace' }}>
                        {t.target}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Bandeau tier actif */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '8px 14px', background: currentTier.color + '08', border: '1px solid ' + currentTier.color + '20', borderRadius: 8 }}>
                  <span style={{ fontSize: 16 }}>⚡</span>
                  <div>
                    <span style={{ fontSize: 11, color: currentTier.color, fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>
                      TARGET: {currentTier.target} minimum
                    </span>
                    <span style={{ fontSize: 10, color: '#6b6960', fontFamily: 'Space Mono, monospace', marginLeft: 12 }}>
                      Click any method to see full setup
                    </span>
                  </div>
                </div>

                {dataLoading ? (
                  <div className="loading-data">Loading AI analysis...</div>
                ) : tierText ? (
                  <div className="four-grid">
                    <div className="sub-card">
                      <div className="sub-label" style={{ color: '#1baf7a' }}>📈 Bazaar Flips</div>
                      {bazaarFlips.length > 0
                        ? bazaarFlips.slice(0, 3).map((item, i) => <MoneyCard key={i} item={item} color="#1baf7a" onClick={() => setSetupItem(item)} />)
                        : <div style={{ color: '#6b6960', fontSize: 11, fontFamily: 'Space Mono, monospace' }}>No data yet...</div>
                      }
                    </div>

                    <div className="sub-card">
                      <div className="sub-label" style={{ color: '#2a78d6' }}>🏷️ AH Flips</div>
                      {ahFlips.length > 0
                        ? ahFlips.slice(0, 3).map((item, i) => <MoneyCard key={i} item={item} color="#2a78d6" onClick={() => setSetupItem(item)} />)
                        : <div style={{ color: '#6b6960', fontSize: 11, fontFamily: 'Space Mono, monospace' }}>Insufficient AH history — building data...</div>
                      }
                    </div>

                    <div className="sub-card">
                      <div className="sub-label" style={{ color: '#eda100' }}>⚔️ Active Grind</div>
                      {grindMethods.length > 0
                        ? grindMethods.slice(0, 3).map((item, i) => <MoneyCard key={i} item={item} color="#eda100" onClick={() => setSetupItem(item)} />)
                        : <div style={{ color: '#6b6960', fontSize: 11, fontFamily: 'Space Mono, monospace' }}>No data yet...</div>
                      }
                    </div>

                    <div className="sub-card">
                      <div className="sub-label" style={{ color: '#9b59b6' }}>⚡ Vault Exclusive</div>
                      {vaultEx.length > 0
                        ? vaultEx.slice(0, 3).map((item, i) => <MoneyCard key={i} item={item} color="#9b59b6" onClick={() => setSetupItem(item)} />)
                        : <div style={{ color: '#6b6960', fontSize: 11, fontFamily: 'Space Mono, monospace' }}>No data yet...</div>
                      }
                    </div>
                  </div>
                ) : (
                  <div className="loading-data">AI analysis running for this tier...</div>
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
                        const parts   = item.split(' — ')
                        const title   = parts[0] || item
                        const body    = parts.slice(1).join(' — ')
                        const insight = findInsightForPatch(title)
                        return (
                          <div key={i} className="patch-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div className="patch-item-title" style={{ marginBottom: 0 }}>📋 {title.replace(/\*\*/g, '').slice(0, 90)}</div>
                              {insight && (
                                <button onClick={() => setActiveInsight(insight)} style={{ flexShrink: 0, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontSize: 10, fontFamily: 'Space Mono, monospace', padding: '3px 9px', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>
                                  MORE →
                                </button>
                              )}
                            </div>
                            {body && <div className="patch-item-body" style={{ marginTop: 8 }}>{body.replace(/\*\*/g, '')}</div>}
                          </div>
                        )
                      })
                    }
                  </div>
                </div>
                <div>
                  <div className="section-label" style={{ color: '#eda100', marginBottom: 10 }}>⚠️ Alpha — Upcoming</div>
                  <div className="patch-list">
                    {dataLoading ? <div className="loading-data">Loading...</div> :
                      patchAlpha.split(/\n(?=[-•*]\s)/).filter(s => s.trim().length > 5).map((item, i) => (
                        <div key={i} className="patch-alpha-item">⚡ {item.replace(/^[-•*]\s*/, '').replace(/\*\*/g, '')}</div>
                      ))
                    }
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
                        {radarMid.length > 0
                          ? radarMid.map((item, i) => <FlashCard key={i} item={item} color="#2a78d6" type="MID" />)
                          : <div className="loading-data">No mid-term data</div>
                        }
                      </div>
                    </div>
                    <div>
                      <div className="section-label" style={{ color: '#9b59b6' }}>🔮 Long-Term (1+ month)</div>
                      <div className="col-scroll">
                        {radarLong.length > 0
                          ? radarLong.map((item, i) => <FlashCard key={i} item={item} color="#9b59b6" type="LONG" />)
                          : <div className="loading-data">No long-term data</div>
                        }
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* EVOLVE */}
            {tab === 4 && <EvolveSection plan={plan} userId={user?.id} />}
          </>
        )}
      </div>

      {/* SETUP MODAL */}
      {setupItem && <SetupModal item={setupItem} onClose={() => setSetupItem(null)} />}

      {/* PATCH INSIGHT MODAL */}
      {activeInsight && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }} onClick={() => setActiveInsight(null)}>
          <div style={{ background: '#111110', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 12, padding: '1.75rem', maxWidth: 480, width: '100%' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setActiveInsight(null)} style={{ float: 'right', background: 'transparent', border: 'none', color: '#6b6960', cursor: 'pointer', fontSize: 1.1 + 'rem' }}>✕</button>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.7rem', color: '#c9a84c', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>📋 Patch Deep-Dive</div>
            <div className="gold-title" style={{ fontSize: 16, marginBottom: 14, lineHeight: 1.4 }}>
              {activeInsight.patch_title}
              {activeInsight.patch_date && <span style={{ color: '#6b6960', fontSize: 11, fontFamily: 'Space Mono, monospace' }}> · {activeInsight.patch_date}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {activeInsight.action_signal && (
                <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 4, fontFamily: 'Space Mono, monospace', fontWeight: 700, background: 'rgba(201,168,76,0.12)', color: '#c9a84c', border: '1px solid rgba(201,168,76,0.3)' }}>
                  {activeInsight.action_signal}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {activeInsight.price_prediction && (
                <div style={{ borderBottom: '0.5px solid rgba(201,168,76,0.1)', paddingBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#c9a84c', fontFamily: 'Space Mono, monospace', marginBottom: 4, textTransform: 'uppercase' }}>Prediction</div>
                  <div style={{ fontSize: 13, color: '#e8e6df', lineHeight: 1.5 }}>{activeInsight.price_prediction}</div>
                </div>
              )}
              {activeInsight.direct_impact && (
                <div>
                  <div style={{ fontSize: 10, color: '#1baf7a', fontFamily: 'Space Mono, monospace', marginBottom: 4, textTransform: 'uppercase' }}>🎯 Direct Impact</div>
                  <div style={{ fontSize: 13, color: '#e8e6df', lineHeight: 1.5 }}>{activeInsight.direct_impact}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}