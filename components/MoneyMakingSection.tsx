// components/MoneyMakingSection.tsx
'use client'
import { useState } from 'react'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type ActiveMethod = {
  id: string; method: string; skill: string
  coins_min: number; coins_max: number; coins_display: string
  key_drops: string; why_best: string; confidence: 'HIGH'|'MED'|'LOW'
}
type VaultMethod = {
  id: string; method: string; skills_combined: string[]
  coins_min: number; coins_max: number; coins_display: string
  the_edge: string; data_source: string; confidence: 'HIGH'|'MED'|'LOW'
}
type Setup = {
  how_to: string; why_best: string
  armor: { set: string; stars: number; recomb: boolean; total_stats: string; set_bonus: string }
  weapon: { name: string; stars: number; recomb: boolean; stats: string; ability: string }
  tool?: string; rod?: string
  pet: { name: string; level: number; rarity: string; bonus: string; alternative: string }
  accessories: { mp_target: number; power_stone: string; must_have: string[] }
  enchants: { weapon: string[]; armor: string[]; drill?: string[]; rod?: string[] }
  gemstones: string; reforges: string; target_stats: string
  requirements: string; cost_estimate: string; location: string
  strategy?: string; team_config?: string; hotm_perks?: string
}

const TIER_CONFIG = [
  { key: 'early', label: 'Early',  emoji: '🌱', target: '10M/h',  color: '#1baf7a' },
  { key: 'mid',   label: 'Mid',    emoji: '⚔️', target: '25M/h',  color: '#c9a84c' },
  { key: 'end',   label: 'End',    emoji: '🔥', target: '50M/h',  color: '#e34948' },
  { key: 'late',  label: 'Late',   emoji: '👑', target: '70M+/h', color: '#9b59b6' },
]

const SKILL_ICONS: Record<string, string> = {
  combat:'⚔️', mining:'⛏️', farming:'🌾', fishing:'🎣', foraging:'🌲', default:'⚡'
}

const CONF_COLORS: Record<string, string> = { HIGH:'#1baf7a', MED:'#c9a84c', LOW:'#e34948' }

// ─────────────────────────────────────────────────────────────
// STARS
// ─────────────────────────────────────────────────────────────
function Stars({ n }: { n: number }) {
  return <span style={{ color:'#c9a84c', fontSize:10, marginLeft:4 }}>{'⭐'.repeat(Math.min(n||0, 7))}</span>
}

// ─────────────────────────────────────────────────────────────
// TAG
// ─────────────────────────────────────────────────────────────
function Tag({ text, color = '#c9a84c' }: { text: string; color?: string }) {
  return (
    <span style={{ display:'inline-block', fontSize:9.5, padding:'1px 6px', borderRadius:3, background:color+'15', border:'1px solid '+color+'28', color, margin:'2px 3px 2px 0', fontFamily:'Space Mono, monospace', whiteSpace:'nowrap' }}>
      {text}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// ROW compact
// ─────────────────────────────────────────────────────────────
function Row({ icon, label, value, color = '#e8e6df' }: { icon: string; label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'7px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize:13, width:20, textAlign:'center', flexShrink:0 }}>{icon}</span>
      <span style={{ fontSize:9, fontFamily:'Space Mono, monospace', color:'#4a4a45', textTransform:'uppercase', letterSpacing:'0.1em', width:80, flexShrink:0, paddingTop:1 }}>{label}</span>
      <span style={{ fontSize:11, color, flex:1, lineHeight:1.5 }}>{value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SETUP PANEL — compact
// ─────────────────────────────────────────────────────────────
function SetupPanel({ setup }: { setup: Setup }) {
  return (
    <div style={{ background:'#0b0b0a', padding:'14px 16px 10px' }}>

      {/* HOW TO + WHY — le plus important */}
      <div style={{ background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.12)', borderRadius:8, padding:'10px 13px', marginBottom:12 }}>
        <div style={{ fontSize:9, color:'#c9a84c', fontFamily:'Space Mono, monospace', letterSpacing:'0.1em', marginBottom:5 }}>HOW TO</div>
        <div style={{ fontSize:11.5, color:'#d8d6cf', lineHeight:1.65 }}>{setup.how_to}</div>
        {setup.why_best && (
          <div style={{ fontSize:10.5, color:'#6b6960', marginTop:6, fontStyle:'italic' }}>→ {setup.why_best}</div>
        )}
      </div>

      {/* ARMOR */}
      {setup.armor && (
        <Row icon="🛡" label="Armor" value={
          <span>
            <strong style={{ color:'#e8e6df' }}>{setup.armor.set}</strong>
            <Stars n={setup.armor.stars} />
            {setup.armor.recomb && <Tag text="RECOMB" color="#9b59b6" />}
            <span style={{ display:'block', fontSize:10, color:'#6b6960', marginTop:2 }}>
              {setup.armor.total_stats}
              {setup.armor.set_bonus && <span style={{ color:'#9b59b6', marginLeft:6 }}>· {setup.armor.set_bonus}</span>}
            </span>
          </span>
        } />
      )}

      {/* WEAPON */}
      {setup.weapon && (
        <Row icon="⚔️" label="Weapon" value={
          <span>
            <strong style={{ color:'#e8e6df' }}>{setup.weapon.name}</strong>
            <Stars n={setup.weapon.stars} />
            {setup.weapon.recomb && <Tag text="RECOMB" color="#9b59b6" />}
            <span style={{ display:'block', fontSize:10, color:'#6b6960', marginTop:2 }}>
              {setup.weapon.stats}
              {setup.weapon.ability && <span style={{ color:'#2a78d6', marginLeft:6 }}>· {setup.weapon.ability}</span>}
            </span>
          </span>
        } />
      )}

      {/* TOOL (mining) */}
      {setup.tool && <Row icon="⛏️" label="Drill" value={<span style={{ color:'#e8e6df' }}>{setup.tool}</span>} />}

      {/* ROD (fishing) */}
      {setup.rod && <Row icon="🎣" label="Rod" value={<span style={{ color:'#e8e6df' }}>{setup.rod}</span>} />}

      {/* PET */}
      {setup.pet && (
        <Row icon="🐾" label="Pet" value={
          <span>
            <strong style={{ color:'#e8e6df' }}>{setup.pet.name}</strong>
            <Tag text={'L' + (setup.pet.level||100)} color="#1baf7a" />
            <Tag text={setup.pet.rarity || 'LEG'} color="#9b59b6" />
            <span style={{ display:'block', fontSize:10, color:'#1baf7a', marginTop:2 }}>{setup.pet.bonus}</span>
            {setup.pet.alternative && <span style={{ display:'block', fontSize:10, color:'#4a4a45', marginTop:1 }}>Alt: {setup.pet.alternative}</span>}
          </span>
        } />
      )}

      {/* ACCESSORIES */}
      {setup.accessories && (
        <Row icon="💍" label="Access." value={
          <span>
            <Tag text={'MP ' + (setup.accessories.mp_target||900) + '+'} color="#c9a84c" />
            {setup.accessories.power_stone && <Tag text={setup.accessories.power_stone} color="#9b59b6" />}
            <div style={{ marginTop:4 }}>
              {(setup.accessories.must_have || []).map((a: string, i: number) => <Tag key={i} text={a} />)}
            </div>
          </span>
        } />
      )}

      {/* ENCHANTS */}
      {setup.enchants && (
        <Row icon="✨" label="Enchants" value={
          <span>
            {Object.entries(setup.enchants).map(([item, enchants]: [string, any]) => (
              <div key={item} style={{ marginBottom:3 }}>
                <span style={{ fontSize:9, color:'#4a4a45', fontFamily:'Space Mono, monospace', marginRight:4, textTransform:'capitalize' }}>{item}:</span>
                {(Array.isArray(enchants) ? enchants : [enchants]).map((e: string, i: number) => (
                  <Tag key={i} text={e} color="#2a78d6" />
                ))}
              </div>
            ))}
          </span>
        } />
      )}

      {/* GEMSTONES */}
      {setup.gemstones && (
        <Row icon="💎" label="Gems" value={<span style={{ color:'#e8e6df' }}>{setup.gemstones}</span>} />
      )}

      {/* REFORGES */}
      {setup.reforges && (
        <Row icon="🔮" label="Reforges" value={<span style={{ color:'#e8e6df' }}>{setup.reforges}</span>} />
      )}

      {/* TARGET STATS */}
      {setup.target_stats && (
        <Row icon="🎯" label="Stats" value={
          <span style={{ fontFamily:'Space Mono, monospace', fontSize:10.5, color:'#1baf7a', fontWeight:700 }}>
            {setup.target_stats}
          </span>
        } />
      )}

      {/* REQUIREMENTS */}
      {setup.requirements && (
        <Row icon="📋" label="Reqs" value={<span style={{ color:'#9b9b8f' }}>{setup.requirements}</span>} />
      )}

      {/* COST */}
      {setup.cost_estimate && (
        <Row icon="💰" label="Cost" value={<span style={{ color:'#c9a84c' }}>{setup.cost_estimate}</span>} />
      )}

      {/* LOCATION */}
      {setup.location && (
        <Row icon="🗺️" label="Location" value={<span style={{ color:'#e8e6df' }}>{setup.location}</span>} />
      )}

      {/* STRATEGY (slayer) */}
      {setup.strategy && (
        <Row icon="👹" label="Strategy" value={<span style={{ color:'#e8e6df', lineHeight:1.5 }}>{setup.strategy}</span>} />
      )}

      {/* TEAM CONFIG (dungeon/kuudra) */}
      {setup.team_config && (
        <Row icon="🏰" label="Team" value={<span style={{ color:'#e8e6df', lineHeight:1.5 }}>{setup.team_config}</span>} />
      )}

      {/* HOTM (mining) */}
      {setup.hotm_perks && (
        <Row icon="⛏️" label="HotM" value={<span style={{ color:'#e8e6df' }}>{setup.hotm_perks}</span>} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// METHOD CARD avec accordion
// ─────────────────────────────────────────────────────────────
function MethodCard({ method, tier, accentColor, type }: {
  method: ActiveMethod | VaultMethod; tier: string; accentColor: string; type: 'active'|'vault'
}) {
  const [expanded, setExpanded] = useState(false)
  const [setup, setSetup]       = useState<Setup | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const m         = method as any
  const skill     = type === 'active' ? m.skill : (m.skills_combined || []).join('+')
  const skillIcon = SKILL_ICONS[m.skill] || SKILL_ICONS[m.skills_combined?.[0]] || SKILL_ICONS.default
  const confColor = CONF_COLORS[m.confidence] || '#c9a84c'

  async function toggle() {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (setup) return
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/setup/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ method, tier })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSetup(data.setup)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Header */}
      <div
        onClick={toggle}
        style={{
          background:   expanded ? accentColor + '0d' : '#0e0e0d',
          border:       `1px solid ${expanded ? accentColor + '38' : accentColor + '16'}`,
          borderLeft:   `3px solid ${accentColor}`,
          borderRadius: expanded ? '8px 8px 0 0' : 8,
          padding:      '10px 13px', cursor: 'pointer',
          transition:   'all 0.15s ease',
        }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <div style={{ width:30, height:30, borderRadius:6, flexShrink:0, background:accentColor+'13', border:'1px solid '+accentColor+'25', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>
            {skillIcon}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11.5, fontWeight:600, color:'#e8e6df', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.method}</div>
            <div style={{ fontSize:9, color:accentColor+'bb', fontFamily:'Space Mono, monospace', marginTop:1, textTransform:'uppercase', letterSpacing:'0.06em' }}>
              {skill.replace(/_/g, ' ')}
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, flexShrink:0 }}>
            <div style={{ fontSize:12, fontWeight:700, color:accentColor, fontFamily:'Space Mono, monospace' }}>{m.coins_display}</div>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:7.5, color:confColor, background:confColor+'13', border:'1px solid '+confColor+'22', padding:'1px 5px', borderRadius:3, fontFamily:'Space Mono, monospace', fontWeight:700 }}>{m.confidence}</span>
              <span style={{ fontSize:13, color:accentColor, transform:expanded?'rotate(90deg)':'none', transition:'transform 0.2s', display:'inline-block' }}>›</span>
            </div>
          </div>
        </div>
        {/* Preview text */}
        {(m.why_best || m.the_edge) && !expanded && (
          <div style={{ marginTop:5, paddingLeft:39, fontSize:10, color:'#4a4a45', lineHeight:1.4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical' }}>
            {m.why_best || m.the_edge}
          </div>
        )}
      </div>

      {/* Accordion */}
      {expanded && (
        <div style={{ border:'1px solid '+accentColor+'22', borderTop:'none', borderRadius:'0 0 8px 8px', overflow:'hidden' }}>
          {loading ? (
            <div style={{ padding:'20px', textAlign:'center', background:'#0b0b0a' }}>
              <div style={{ fontSize:9.5, color:accentColor, fontFamily:'Space Mono, monospace', letterSpacing:'0.1em', marginBottom:10 }}>GENERATING SETUP...</div>
              <div style={{ display:'flex', justifyContent:'center', gap:5 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width:5, height:5, borderRadius:'50%', background:accentColor, animation:`pulse 1.2s ${i*0.2}s infinite`, opacity:0.7 }} />
                ))}
              </div>
            </div>
          ) : error ? (
            <div style={{ padding:'14px', background:'#0b0b0a', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:10, color:'#e34948', fontFamily:'Space Mono, monospace' }}>{error.slice(0, 80)}</div>
              <button onClick={e => { e.stopPropagation(); setError(null); toggle() }} style={{ fontSize:9, color:accentColor, background:'transparent', border:'1px solid '+accentColor+'35', padding:'3px 8px', borderRadius:4, cursor:'pointer', fontFamily:'Space Mono, monospace', flexShrink:0, marginLeft:8 }}>
                Retry
              </button>
            </div>
          ) : setup ? (
            <SetupPanel setup={setup} />
          ) : null}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MONEY MAKING SECTION
// ─────────────────────────────────────────────────────────────
export default function MoneyMakingSection({ marketData, dataLoading }: {
  marketData: Record<string, string>; dataLoading: boolean
}) {
  const [mmTier, setMmTier] = useState('early')
  const currentTier = TIER_CONFIG.find(t => t.key === mmTier) || TIER_CONFIG[0]

  const tierRaw = marketData['money_making_' + mmTier] || ''
  let tierData: { active: ActiveMethod[]; vault: VaultMethod[] } = { active: [], vault: [] }
  try { if (tierRaw) tierData = JSON.parse(tierRaw) } catch {}

  return (
    <div>
      <style>{`
        @keyframes pulse {
          0%,100%{transform:scale(1);opacity:0.7}
          50%{transform:scale(1.5);opacity:1}
        }
      `}</style>

      {/* Tier selector */}
      <div style={{ display:'flex', gap:4, marginBottom:14 }}>
        {TIER_CONFIG.map(t => (
          <button key={t.key} onClick={() => setMmTier(t.key)} style={{
            flex:1, padding:'9px 8px', borderRadius:8, fontSize:11,
            border:`1px solid ${mmTier===t.key ? t.color+'45' : 'rgba(255,255,255,0.05)'}`,
            background: mmTier===t.key ? t.color+'0d' : '#111110',
            color: mmTier===t.key ? t.color : '#4a4a45',
            cursor:'pointer', textAlign:'center', transition:'all 0.15s',
            fontFamily:'Space Grotesk, sans-serif', fontWeight:500
          }}>
            <div style={{ fontSize:15, marginBottom:1 }}>{t.emoji}</div>
            <div style={{ fontWeight:600 }}>{t.label}</div>
            <div style={{ fontSize:8.5, fontFamily:'Space Mono, monospace', marginTop:1, color:mmTier===t.key ? t.color+'bb' : '#2a2a28' }}>{t.target}</div>
          </button>
        ))}
      </div>

      {/* Banner */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, padding:'8px 13px', background:currentTier.color+'07', border:'1px solid '+currentTier.color+'16', borderRadius:7 }}>
        <span style={{ fontSize:16 }}>{currentTier.emoji}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:10.5, fontWeight:600, color:currentTier.color, fontFamily:'Space Mono, monospace' }}>TARGET {currentTier.target} minimum</div>
          <div style={{ fontSize:9.5, color:'#3a3a38', marginTop:1 }}>Click any method → full setup with gear, enchants & strategy</div>
        </div>
        <div style={{ fontSize:8.5, fontFamily:'Space Mono, monospace', color:'#3a3a38', padding:'2px 7px', background:'rgba(255,255,255,0.02)', borderRadius:4 }}>Weekly AI</div>
      </div>

      {/* Content */}
      {dataLoading ? (
        <div style={{ color:'#2a2a28', fontSize:10.5, textAlign:'center', padding:'3rem', fontFamily:'Space Mono, monospace', letterSpacing:'0.08em' }}>
          LOADING AI ANALYSIS...
        </div>
      ) : tierData.active.length === 0 && tierData.vault.length === 0 ? (
        <div style={{ color:'#2a2a28', fontSize:10.5, textAlign:'center', padding:'3rem', fontFamily:'Space Mono, monospace' }}>
          AI analysis running... check back in a moment
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {/* ACTIVE GRIND */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, padding:'0 2px' }}>
              <span style={{ fontSize:13 }}>⚔️</span>
              <span style={{ fontSize:9.5, fontWeight:700, fontFamily:'Space Mono, monospace', color:currentTier.color, letterSpacing:'0.12em', textTransform:'uppercase' }}>Active Grind</span>
            </div>
            {tierData.active.length > 0
              ? tierData.active.slice(0, 3).map((m, i) => (
                  <MethodCard key={i} method={m} tier={mmTier} accentColor={currentTier.color} type="active" />
                ))
              : <div style={{ padding:'20px', textAlign:'center', background:'#111110', borderRadius:8, border:'1px solid rgba(255,255,255,0.04)', fontSize:10, color:'#2a2a28', fontFamily:'Space Mono, monospace' }}>Building data...</div>
            }
          </div>

          {/* VAULT EXCLUSIVE */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, padding:'0 2px' }}>
              <span style={{ fontSize:13 }}>⚡</span>
              <span style={{ fontSize:9.5, fontWeight:700, fontFamily:'Space Mono, monospace', color:'#9b59b6', letterSpacing:'0.12em', textTransform:'uppercase' }}>Vault Exclusive</span>
            </div>
            {tierData.vault.length > 0
              ? tierData.vault.slice(0, 3).map((m, i) => (
                  <MethodCard key={i} method={m} tier={mmTier} accentColor="#9b59b6" type="vault" />
                ))
              : <div style={{ padding:'20px', textAlign:'center', background:'#111110', borderRadius:8, border:'1px solid rgba(255,255,255,0.04)', fontSize:10, color:'#2a2a28', fontFamily:'Space Mono, monospace' }}>Generating innovations...</div>
            }
          </div>
        </div>
      )}
    </div>
  )
}