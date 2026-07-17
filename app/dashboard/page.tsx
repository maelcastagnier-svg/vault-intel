'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import EvolveSection from './EvolveSection'
import FlashAlertsPage from '../../components/FlashAlertsPage'

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

function extractSection(text: string, keyword: string): string {
  const lines = text.split('\n')
  let start = -1, end = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && lines[i].match(new RegExp('^#+\\s*(' + keyword + ')', 'i'))) start = i
    else if (start !== -1 && i > start && lines[i].match(/^#+\s/)) { end = i; break }
  }
  return start === -1 ? '' : lines.slice(start, end).join('\n')
}

function extractCoins(item: Record<string, string>): string | null {
  const keys = ['Coins/Hour', 'Coins/Hour ', 'Coins/hr', 'Coins/hr ', 'Est. Profit', 'Target Profit', 'Profit/Flip', 'Coins/Hour\n']
  for (const k of keys) if (item[k] && item[k] !== '---' && item[k] !== 'N/A') return item[k]
  return null
}

function coinsToNumber(str: string): number {
  if (!str) return 0
  const clean = str.replace(/[^0-9.MmKkBb]/g, '')
  const num = parseFloat(clean)
  if (str.toLowerCase().includes('b')) return num * 1_000_000_000
  if (str.toLowerCase().includes('m')) return num * 1_000_000
  if (str.toLowerCase().includes('k')) return num * 1_000
  return num
}

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

const MONTH_MAP: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 }
function extractPatchDate(text: string): number {
  const m = text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})/i)
  return m ? (MONTH_MAP[m[1].toLowerCase().slice(0,3)] ?? 0) * 31 + parseInt(m[2]) : 0
}
function sortPatchesNewest(items: string[]) { return [...items].sort((a,b) => extractPatchDate(b) - extractPatchDate(a)) }

// ─────────────────────────────────────────────────────────────
// TIER CONFIG
// ─────────────────────────────────────────────────────────────
const MM_TIERS = [
  { key: 'early', label: 'Early',  emoji: '🌱', target: '10M/h',  color: '#1baf7a', max: 10 },
  { key: 'mid',   label: 'Mid',    emoji: '⚔️', target: '25M/h',  color: '#c9a84c', max: 25 },
  { key: 'end',   label: 'End',    emoji: '🔥', target: '50M/h',  color: '#e34948', max: 50 },
  { key: 'late',  label: 'Late',   emoji: '👑', target: '70M+/h', color: '#9b59b6', max: 100 },
]

const PLAN_COLORS: Record<string, string> = { alert:'#2a78d6', pro:'#c9a84c', elite:'#9b59b6', free:'#6b6960' }

// ─────────────────────────────────────────────────────────────
// CATEGORY CONFIG
// ─────────────────────────────────────────────────────────────
const SECTION_CONFIG = [
  { key: 'bazaar', label: 'Bazaar Flip',    icon: '📈', color: '#1baf7a',  keyword: 'BAZAAR FLIP|Bazaar Flip' },
  { key: 'ah',     label: 'AH Flip',        icon: '🏷️', color: '#2a78d6',  keyword: 'AH FLIP|AH Flip' },
  { key: 'grind',  label: 'Active Grind',   icon: '⚔️', color: '#eda100',  keyword: 'ACTIVE GRIND|Active Grind|Farming|Farm' },
  { key: 'vault',  label: 'Vault Exclusive',icon: '⚡', color: '#9b59b6',  keyword: 'VAULT EXCLUSIVE|Vault Exclusive' },
]

// ─────────────────────────────────────────────────────────────
// PROFIT BAR — signature visuelle
// ─────────────────────────────────────────────────────────────
function ProfitBar({ coins, maxCoins, color }: { coins: string; maxCoins: number; color: string }) {
  const val = coinsToNumber(coins)
  const pct = Math.min(100, Math.round((val / (maxCoins * 1_000_000)) * 100))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: pct + '%', borderRadius: 2,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)'
        }} />
      </div>
      <span style={{ fontSize: 9, color, fontFamily: 'Space Mono, monospace', fontWeight: 700, flexShrink: 0 }}>
        {coins.replace(/coins?\/?h(our)?/gi, '').trim().slice(0, 12)}
        <span style={{ color: color + '88', fontSize: 8 }}>/h</span>
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MONEY CARD
// ─────────────────────────────────────────────────────────────
function MoneyCard({
  item, color, tierMax, onClick
}: {
  item: Record<string, string>; color: string; tierMax: number; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const name  = (item['Item'] || item['Method'] || item['Opportunity'] || Object.values(item)[0] || '').replace(/\*\*/g, '')
  const coins = extractCoins(item)
  const conf  = item['Conf'] || item['Confidence'] || ''
  const confColor = conf.toLowerCase().includes('high') ? '#1baf7a' : conf.toLowerCase().includes('low') ? '#e34948' : '#eda100'
  const initials = name.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 2)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', cursor: 'pointer', marginBottom: 6,
        background: hovered ? color + '0d' : '#0e0e0d',
        border: `1px solid ${hovered ? color + '40' : color + '18'}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8, padding: '11px 13px',
        transition: 'all 0.15s ease',
        boxShadow: hovered ? `0 0 20px ${color}18` : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: 6, flexShrink: 0,
          background: color + '15', border: '1px solid ' + color + '30',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontFamily: 'Space Mono, monospace', color, fontWeight: 700
        }}>{initials}</div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11.5, fontWeight: 600, color: '#e8e6df',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: 2
          }}>{name.slice(0, 38)}</div>
          {coins && <ProfitBar coins={coins} maxCoins={tierMax} color={color} />}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {conf && (
            <span style={{
              fontSize: 8, fontFamily: 'Space Mono, monospace', fontWeight: 700,
              color: confColor, background: confColor + '15',
              border: '1px solid ' + confColor + '30',
              padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase'
            }}>{conf.slice(0, 4)}</span>
          )}
          <span style={{ fontSize: 12, color: hovered ? color : '#2a2a28', transition: 'color 0.15s' }}>›</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SECTION CARD (conteneur des MoneyCards)
// ─────────────────────────────────────────────────────────────
function SectionCard({
  icon, label, color, items, tierMax, onSelect, loading
}: {
  icon: string; label: string; color: string; items: Record<string,string>[];
  tierMax: number; onSelect: (i: Record<string,string>) => void; loading: boolean
}) {
  return (
    <div style={{
      background: '#111110', border: '1px solid rgba(255,255,255,0.05)',
      borderTop: `2px solid ${color}`, borderRadius: '0 0 10px 10px', padding: '14px 14px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, fontFamily: 'Space Mono, monospace',
          color, letterSpacing: '0.1em', textTransform: 'uppercase'
        }}>{label}</span>
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 52, background: '#181816', borderRadius: 8, opacity: 1 - i * 0.2 }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.02), transparent)', borderRadius: 8 }} />
            </div>
          ))}
        </div>
      ) : items.length > 0 ? (
        items.slice(0, 3).map((item, i) => (
          <MoneyCard key={i} item={item} color={color} tierMax={tierMax} onClick={() => onSelect(item)} />
        ))
      ) : (
        <div style={{ padding: '16px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#3a3a38', fontFamily: 'Space Mono, monospace' }}>Building data...</div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SETUP MODAL — redesign complet
// ─────────────────────────────────────────────────────────────
function SetupModal({ item, onClose }: { item: Record<string,string>; onClose: () => void }) {
  const name  = (item['Item'] || item['Method'] || item['Opportunity'] || Object.values(item)[0] || '').replace(/\*\*/g, '')
  const coins = extractCoins(item)
  const conf  = item['Conf'] || item['Confidence'] || ''
  const confColor = conf.toLowerCase().includes('high') ? '#1baf7a' : conf.toLowerCase().includes('low') ? '#e34948' : '#eda100'

  // Icône par type de section
  const getIcon = (key: string) => {
    const k = key.toLowerCase()
    if (k.includes('armor') || k.includes('gear') || k.includes('setup')) return '🛡'
    if (k.includes('weapon')) return '⚔️'
    if (k.includes('enchant')) return '✨'
    if (k.includes('access')) return '💍'
    if (k.includes('math') || k.includes('how') || k.includes('calc')) return '🧮'
    if (k.includes('req') || k.includes('unlock')) return '📋'
    if (k.includes('drop') || k.includes('loot')) return '📦'
    if (k.includes('coin') || k.includes('profit') || k.includes('earn')) return '⚡'
    if (k.includes('capital')) return '💰'
    if (k.includes('why') || k.includes('insight') || k.includes('edge')) return '💡'
    if (k.includes('pet')) return '🐾'
    if (k.includes('gem')) return '💎'
    return '›'
  }

  // Filtre les clés à afficher
  const skipKeys = new Set(['Item','Method','Opportunity','Conf','Confidence','Coins/Hour','Coins/hr','Coins/Hour ','Coins/hr ','Est. Profit','Target Profit','Profit/Flip'])
  const detailKeys = Object.keys(item).filter(k => !skipKeys.has(k) && item[k] && item[k] !== '---' && item[k] !== 'N/A')

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0f0f0e',
          border: '1px solid rgba(201,168,76,0.18)',
          borderRadius: 16, padding: '0',
          maxWidth: 540, width: '100%',
          maxHeight: '88vh', overflowY: 'auto',
          boxShadow: '0 40px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 22px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          position: 'sticky', top: 0, background: '#0f0f0e', zIndex: 1,
          borderRadius: '16px 16px 0 0'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{
                fontSize: 9, color: '#c9a84c', fontFamily: 'Space Mono, monospace',
                letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 7
              }}>⚙ SETUP GUIDE</div>
              <div style={{
                fontSize: 16, fontWeight: 700, color: '#f0d68a',
                lineHeight: 1.3, maxWidth: 400,
                background: 'linear-gradient(135deg, #f0d68a 0%, #c9a84c 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>{name.slice(0, 55)}</div>
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#6b6960', cursor: 'pointer', borderRadius: 8,
              padding: '6px 10px', fontSize: 14, lineHeight: 1, flexShrink: 0, marginLeft: 12
            }}>✕</button>
          </div>

          {/* Stats badges */}
          {(coins || conf) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {coins && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#1baf7a12', border: '1px solid #1baf7a28',
                  borderRadius: 10, padding: '8px 14px'
                }}>
                  <span style={{ fontSize: 18 }}>⚡</span>
                  <div>
                    <div style={{ fontSize: 8, color: '#1baf7a88', fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em' }}>COINS/HOUR</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1baf7a', fontFamily: 'Space Mono, monospace', lineHeight: 1.2 }}>
                      {coins.replace(/coins?\/?h(our)?/gi, '').trim().slice(0, 16)}
                    </div>
                  </div>
                </div>
              )}
              {conf && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: confColor + '12', border: '1px solid ' + confColor + '28',
                  borderRadius: 10, padding: '8px 14px'
                }}>
                  <div>
                    <div style={{ fontSize: 8, color: confColor + '88', fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em' }}>CONFIDENCE</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: confColor, fontFamily: 'Space Mono, monospace', lineHeight: 1.2 }}>
                      {conf.toUpperCase().slice(0, 10)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail sections */}
        <div style={{ padding: '4px 22px 22px' }}>
          {detailKeys.map(k => (
            <div key={k} style={{ padding: '13px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                <span style={{ fontSize: 13, width: 20, textAlign: 'center' }}>{getIcon(k)}</span>
                <span style={{
                  fontSize: 9, fontFamily: 'Space Mono, monospace',
                  color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700
                }}>{k}</span>
              </div>
              <div style={{
                fontSize: 12.5, color: '#cac8c0', lineHeight: 1.7,
                paddingLeft: 27,
                fontFamily: k.toLowerCase().includes('math') || k.toLowerCase().includes('calc') ? 'Space Mono, monospace' : 'inherit',
                fontSize: k.toLowerCase().includes('math') ? 11 : 12.5
              }}>{item[k].replace(/\*\*/g, '')}</div>
            </div>
          ))}

          <div style={{
            marginTop: 14, padding: '10px 14px',
            background: 'rgba(201,168,76,0.04)',
            border: '1px solid rgba(201,168,76,0.08)',
            borderRadius: 10
          }}>
            <div style={{ fontSize: 10, color: '#4a4a45', fontFamily: 'Space Mono, monospace' }}>
              💡 Vault updates analyses twice daily with live market prices
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// FLASH CARD (Radar / Patch)
// ─────────────────────────────────────────────────────────────
function FlashCard({ item, color, type }: { item: Record<string,string>; color: string; type: string }) {
  const name    = item['Item'] || Object.values(item)[0] || 'Unknown'
  const entries = Object.entries(item).filter(([k]) => k !== 'Item').slice(0, 4)
  const [copied, setCopied] = useState(false)

  return (
    <div style={{
      background: '#111110', border: '0.5px solid ' + color + '28',
      borderLeft: '3px solid ' + color, borderRadius: 8, padding: '12px 14px', marginBottom: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 6, flexShrink: 0,
          background: color + '12', border: '1px solid ' + color + '28',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, fontFamily: 'Space Mono, monospace', color, fontWeight: 700
        }}>{name.replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,2)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#e8e6df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name.slice(0, 35)}</div>
          <div style={{ fontSize: 8.5, color, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{type}</div>
        </div>
        <button onClick={() => { navigator.clipboard.writeText(name.replace(/\*\*/g,'').trim()); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          style={{ background: copied ? color+'28':'transparent', border: '1px solid '+color+'35', color, fontSize: 8.5, fontFamily: 'Space Mono, monospace', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>
          {copied ? '✓' : '📋'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
        {entries.map(([k, v]) => v && (
          <div key={k} style={{ fontSize: 9.5, fontFamily: 'Space Mono, monospace' }}>
            <span style={{ color: '#4a4a45' }}>{k.slice(0, 8)}: </span>
            <span style={{ color: k.toLowerCase().includes('profit') || k.toLowerCase().includes('spread') ? color : '#b8b6ae' }}>{v.slice(0, 20)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TICKER
// ─────────────────────────────────────────────────────────────
function LiveTicker({ lastUpdate }: { lastUpdate: Date | null }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const secs = lastUpdate ? Math.floor((now.getTime() - lastUpdate.getTime()) / 1000) : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#4a4a45',
      marginBottom: 16
    }}>
      <span style={{ color: '#1baf7a', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1baf7a', display: 'inline-block', boxShadow: '0 0 6px #1baf7a' }} />
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
  const [user, setUser]              = useState<any>(null)
  const [plan, setPlan]              = useState('free')
  const [username, setUsername]      = useState('')
  const [tab, setTab]                = useState(0)
  const [loading, setLoading]        = useState(true)
  const [marketData, setMarketData]  = useState<Record<string,string>>({})
  const [insights, setInsights]      = useState<any[]>([])
  const [dataLoading, setDataLoading]= useState(true)
  const [mmTier, setMmTier]          = useState('early')
  const [setupItem, setSetupItem]    = useState<Record<string,string>|null>(null)
  const [activeInsight, setActiveInsight] = useState<any|null>(null)
  const [lastUpdate, setLastUpdate]  = useState<Date|null>(null)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      const res = await fetch('/api/subscription', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email: user.email}) })
      const sub = await res.json()
      if (sub) { setPlan(sub.plan||'free'); setUsername(sub.username||user.email?.split('@')[0]||'') }
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
      .on('postgres_changes', {event:'*', schema:'public', table:'claude_analysis'}, loadData)
      .on('postgres_changes', {event:'*', schema:'public', table:'insight_patch'}, loadData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const TABS = [
    { label: '⚡ Flash',   key: 'flash',  plans: ['alert','pro','elite'] },
    { label: '💰 Money',   key: 'money',  plans: ['pro','elite'] },
    { label: '🔧 Patches', key: 'patch',  plans: ['alert','pro','elite'] },
    { label: '📈 Radar',   key: 'radar',  plans: ['pro','elite'] },
    { label: '🧬 Evolve',  key: 'evolve', plans: ['elite'] },
  ]
  const hasAccess = (plans: string[]) => plans.includes(plan)

  // Parse money making
  const currentTier = MM_TIERS.find(t => t.key === mmTier) || MM_TIERS[0]
  const tierText    = marketData['money_making_' + mmTier] || ''

  const sectionData = SECTION_CONFIG.map(s => ({
    ...s,
    items: parseTable(extractSection(tierText, s.keyword))
  }))

  // Parse patch
  const patchText  = marketData['patch_analysis'] || ''
  const patchSplit = patchText.split(/#+\s*Alpha\s*Upcoming/i)
  const patchLive  = (patchSplit[0]||'').replace(/^#+\s*Live Patches\s*/i,'').trim()
  const patchAlpha = (patchSplit[1]||'').trim()

  // Parse radar
  const radarText  = marketData['radar'] || ''
  const radarSplit = radarText.split(/#+\s*Long-Term/i)
  const radarMid   = parseTable(radarSplit[0] || '')
  const radarLong  = parseTable(radarSplit[1] ? '### Long-Term' + radarSplit[1] : '')

  // Patch insights
  const findInsight = (title: string) => {
    const t = title.toLowerCase().replace(/[^a-z0-9]/g,'')
    return insights.find(ins => {
      const s = (ins.patch_title||'').toLowerCase().replace(/[^a-z0-9]/g,'')
      return s.length > 4 && (t.includes(s) || s.includes(t))
    })
  }

  if (loading) return (
    <div style={{ background:'#080807', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Space Mono, monospace' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, color: '#c9a84c', letterSpacing: '0.3em', marginBottom: 8 }}>VAULT</div>
        <div style={{ fontSize: 10, color: '#3a3a38', letterSpacing: '0.15em' }}>LOADING INTELLIGENCE...</div>
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

        /* Nav */
        .vault-nav {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0 2rem; height: 52px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(8,8,7,0.98);
          position: sticky; top: 0; z-index: 100;
          backdrop-filter: blur(12px);
        }
        .vault-logo {
          font-family: 'Space Mono', monospace; font-size: 0.9rem; font-weight: 700;
          color: #c9a84c; letter-spacing: 0.24em;
          text-shadow: 0 0 20px rgba(201,168,76,0.4);
        }
        .nav-right { display: flex; align-items: center; gap: 10px; }
        .plan-badge {
          font-family: 'Space Mono', monospace; font-size: 9px;
          padding: 2px 7px; border-radius: 3px; text-transform: uppercase; font-weight: 700; border: 1px solid;
        }
        .logout-btn {
          background: transparent; border: 1px solid rgba(255,255,255,0.07);
          color: #4a4a45; padding: 4px 10px; border-radius: 5px;
          font-size: 11px; cursor: pointer; font-family: 'Space Grotesk', sans-serif;
          transition: all 0.15s;
        }
        .logout-btn:hover { border-color: rgba(255,255,255,0.15); color: #9b9b8f; }

        /* Main */
        .vault-main { max-width: 1060px; margin: 0 auto; padding: 1.5rem 2rem; }

        /* Tabs */
        .vault-tabs { display: flex; gap: 2px; margin-bottom: 1.5rem; background: #111110; padding: 3px; border-radius: 8px; width: fit-content; }
        .vault-tab {
          padding: 6px 16px; border-radius: 6px; font-size: 12px;
          border: none; background: transparent; color: #4a4a45;
          cursor: pointer; font-family: 'Space Grotesk', sans-serif; font-weight: 500;
          transition: all 0.15s; white-space: nowrap;
        }
        .vault-tab.active { background: #1e1e1c; color: #e8e6df; }
        .vault-tab.locked { opacity: 0.3; cursor: not-allowed; }
        .vault-tab:not(.locked):not(.active):hover { color: #9b9b8f; }

        /* MM Tiers */
        .tier-tabs { display: flex; gap: 4px; margin-bottom: 16px; }
        .tier-tab {
          flex: 1; padding: 10px 12px; border-radius: 8px; font-size: 12px;
          border: 1px solid rgba(255,255,255,0.06); background: #111110;
          color: #4a4a45; cursor: pointer; font-family: 'Space Grotesk', sans-serif;
          font-weight: 500; text-align: center; transition: all 0.15s;
        }
        .tier-tab:hover:not(.tier-active) { border-color: rgba(255,255,255,0.1); color: #9b9b8f; }

        /* Grid money making */
        .mm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        @media (max-width: 680px) { .mm-grid { grid-template-columns: 1fr; } }

        /* Two col */
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 680px) { .two-col { grid-template-columns: 1fr; } }

        /* Scroll areas */
        .scroll-area { max-height: 520px; overflow-y: auto; padding-right: 2px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.05) transparent; }
        .scroll-area::-webkit-scrollbar { width: 2px; }
        .scroll-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 1px; }

        /* Patch items */
        .patch-list { display: flex; flex-direction: column; gap: 10px; max-height: 560px; overflow-y: auto; padding-right: 2px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.05) transparent; }
        .patch-card { background: #111110; border: 1px solid rgba(201,168,76,0.1); border-left: 3px solid #c9a84c; border-radius: 8px; padding: 13px 15px; }
        .patch-card-title { font-size: 12px; font-weight: 600; color: #e8e6df; margin-bottom: 6px; line-height: 1.4; }
        .patch-card-body { font-size: 11px; color: #6b6960; line-height: 1.65; }
        .alpha-card { background: #111110; border: 1px solid rgba(237,161,0,0.12); border-left: 3px solid #eda100; border-radius: 8px; padding: 12px 15px; font-size: 11px; color: #8b8980; line-height: 1.65; }

        /* Section header */
        .section-eyebrow { font-family: 'Space Mono', monospace; font-size: 9.5px; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 12px; font-weight: 700; display: flex; align-items: center; gap: 6px; }

        /* Locked */
        .locked-state { background: #111110; border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 3rem; text-align: center; }
        .upgrade-btn { background: #c9a84c; color: #080807; border: none; padding: 10px 22px; border-radius: 7px; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-block; font-size: 13px; font-family: 'Space Grotesk', sans-serif; }

        /* Loading */
        .loading-state { color: #3a3a38; font-size: 11px; text-align: center; padding: 3rem; font-family: 'Space Mono, monospace'; letter-spacing: 0.08em; }

        /* Nav link */
        a.nav-link { font-size: 11px; color: #4a4a45; text-decoration: none; }
        a.nav-link:hover { color: #c9a84c; }
      `}</style>

      {/* NAV */}
      <nav className="vault-nav">
        <div className="vault-logo">VAULT.</div>
        <div className="nav-right">
          <span style={{ fontSize: 12, color: '#e8e6df', fontWeight: 500 }}>{username}</span>
          <span
            className="plan-badge"
            style={{ color: PLAN_COLORS[plan], borderColor: PLAN_COLORS[plan]+'40', background: PLAN_COLORS[plan]+'10' }}
          >{plan}</span>
          <Link href="/profile" className="nav-link">Profile</Link>
          <button className="logout-btn" onClick={async () => { await supabase.auth.signOut(); router.push('/') }}>
            Sign out
          </button>
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
            <div style={{ fontSize: 24, marginBottom: 12 }}>🔒</div>
            <div style={{ color: '#c9a84c', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Upgrade required</div>
            <div style={{ color: '#4a4a45', fontSize: 12, marginBottom: 20 }}>This section requires a higher plan.</div>
            <a href="/#pricing" className="upgrade-btn">View plans</a>
          </div>
        ) : (
          <>
            {/* ── FLASH ALERTS ── */}
            {tab === 0 && <FlashAlertsPage />}

            {/* ── MONEY MAKING ── */}
            {tab === 1 && (
              <div>
                {/* Tier tabs */}
                <div className="tier-tabs">
                  {MM_TIERS.map(t => (
                    <button
                      key={t.key}
                      className={`tier-tab ${mmTier === t.key ? 'tier-active' : ''}`}
                      style={mmTier === t.key ? {
                        borderColor: t.color + '50',
                        background: t.color + '10',
                        color: t.color,
                      } : {}}
                      onClick={() => setMmTier(t.key)}
                    >
                      <div style={{ fontSize: 14, marginBottom: 2 }}>{t.emoji}</div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{t.label}</div>
                      <div style={{
                        fontSize: 9, fontFamily: 'Space Mono, monospace', marginTop: 1,
                        color: mmTier === t.key ? t.color + 'cc' : '#3a3a38'
                      }}>{t.target}</div>
                    </button>
                  ))}
                </div>

                {/* Tier banner */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
                  padding: '10px 16px',
                  background: currentTier.color + '08',
                  border: '1px solid ' + currentTier.color + '18',
                  borderRadius: 8
                }}>
                  <span style={{ fontSize: 20 }}>{currentTier.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: currentTier.color, fontFamily: 'Space Mono, monospace' }}>
                      TARGET {currentTier.target} minimum
                    </div>
                    <div style={{ fontSize: 10, color: '#3a3a38', marginTop: 1 }}>
                      Click any method to see gear setup, enchants & math
                    </div>
                  </div>
                  <div style={{
                    fontSize: 9, fontFamily: 'Space Mono, monospace', color: '#3a3a38',
                    padding: '3px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 5
                  }}>AI · Updated 12h</div>
                </div>

                {/* 4-grid sections */}
                {dataLoading ? (
                  <div className="loading-data" style={{ color:'#3a3a38', fontSize:11, textAlign:'center', padding:'3rem', fontFamily:'Space Mono, monospace', letterSpacing:'0.08em' }}>
                    LOADING AI ANALYSIS...
                  </div>
                ) : tierText ? (
                  <div className="mm-grid">
                    {sectionData.map(s => (
                      <SectionCard
                        key={s.key}
                        icon={s.icon}
                        label={s.label}
                        color={s.color}
                        items={s.items}
                        tierMax={currentTier.max}
                        onSelect={setSetupItem}
                        loading={dataLoading}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ color:'#3a3a38', fontSize:11, textAlign:'center', padding:'3rem', fontFamily:'Space Mono, monospace' }}>
                    AI analysis running for this tier...
                  </div>
                )}
              </div>
            )}

            {/* ── PATCHES ── */}
            {tab === 2 && (
              <div className="two-col">
                <div>
                  <div className="section-eyebrow" style={{ color: '#1baf7a' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1baf7a', display: 'inline-block' }} />
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                              <div className="patch-card-title">{title.replace(/\*\*/g,'').slice(0, 90)}</div>
                              {ins && (
                                <button
                                  onClick={() => setActiveInsight(ins)}
                                  style={{ flexShrink:0, background:'rgba(201,168,76,0.08)', border:'1px solid rgba(201,168,76,0.2)', color:'#c9a84c', fontSize:9, fontFamily:'Space Mono, monospace', padding:'3px 8px', borderRadius:4, cursor:'pointer', fontWeight:700 }}
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
                  <div className="section-eyebrow" style={{ color: '#eda100' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#eda100', display: 'inline-block' }} />
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
                <div className="section-eyebrow" style={{ color: '#c9a84c', marginBottom: 14 }}>Market intelligence · Mid &amp; Long term</div>
                {dataLoading ? <div className="loading-state">Loading...</div> : (
                  <div className="two-col">
                    <div>
                      <div className="section-eyebrow" style={{ color: '#2a78d6' }}>📅 Mid-Term · 1-2 weeks</div>
                      <div className="scroll-area">
                        {radarMid.length > 0 ? radarMid.map((i, idx) => <FlashCard key={idx} item={i} color="#2a78d6" type="MID" />) :
                          <div className="loading-state">No mid-term signals</div>}
                      </div>
                    </div>
                    <div>
                      <div className="section-eyebrow" style={{ color: '#9b59b6' }}>🔮 Long-Term · 1+ month</div>
                      <div className="scroll-area">
                        {radarLong.length > 0 ? radarLong.map((i, idx) => <FlashCard key={idx} item={i} color="#9b59b6" type="LONG" />) :
                          <div className="loading-state">No long-term signals</div>}
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

      {/* SETUP MODAL */}
      {setupItem && <SetupModal item={setupItem} onClose={() => setSetupItem(null)} />}

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
            <div style={{ fontSize:9, color:'#c9a84c', fontFamily:'Space Mono, monospace', letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:8 }}>📋 Patch Deep-Dive</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#f0d68a', marginBottom:16, lineHeight:1.3 }}>
              {activeInsight.patch_title}
              {activeInsight.patch_date && <span style={{ color:'#3a3a38', fontSize:10, fontFamily:'Space Mono, monospace', fontWeight:400 }}> · {activeInsight.patch_date}</span>}
            </div>
            {activeInsight.action_signal && (
              <span style={{ fontSize:10, padding:'3px 9px', borderRadius:4, fontFamily:'Space Mono, monospace', fontWeight:700, background:'rgba(201,168,76,0.1)', color:'#c9a84c', border:'1px solid rgba(201,168,76,0.25)', display:'inline-block', marginBottom:16 }}>
                {activeInsight.action_signal}
              </span>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {activeInsight.price_prediction && (
                <div style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', paddingBottom:12 }}>
                  <div style={{ fontSize:9, color:'#c9a84c', fontFamily:'Space Mono, monospace', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.1em' }}>Prediction</div>
                  <div style={{ fontSize:12.5, color:'#cac8c0', lineHeight:1.6 }}>{activeInsight.price_prediction}</div>
                </div>
              )}
              {activeInsight.direct_impact && (
                <div>
                  <div style={{ fontSize:9, color:'#1baf7a', fontFamily:'Space Mono, monospace', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.1em' }}>🎯 Direct Impact</div>
                  <div style={{ fontSize:12.5, color:'#cac8c0', lineHeight:1.6 }}>{activeInsight.direct_impact}</div>
                </div>
              )}
            </div>
            <div style={{ marginTop:16, padding:'8px 12px', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:8, fontSize:10, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>
              Vault self-corrects this prediction on next analysis run.
            </div>
          </div>
        </div>
      )}
    </>
  )
}