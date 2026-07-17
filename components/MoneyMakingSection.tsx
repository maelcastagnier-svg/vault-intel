// components/MoneyMakingSection.tsx
// Section Money Making avec accordion + setup on-demand
'use client'
import { useState, useEffect } from 'react'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type ActiveMethod = {
  id:           string
  method:       string
  skill:        string
  coins_min:    number
  coins_max:    number
  coins_display:string
  key_drops:    string
  why_best:     string
  confidence:   'HIGH' | 'MED' | 'LOW'
}

type VaultMethod = {
  id:              string
  method:          string
  skills_combined: string[]
  coins_min:       number
  coins_max:       number
  coins_display:   string
  the_edge:        string
  data_source:     string
  confidence:      'HIGH' | 'MED' | 'LOW'
}

type Setup = {
  armor:          any
  weapon:         any
  tool?:          any
  rod?:           any
  pet:            any
  accessories:    any
  enchants:       any
  gemstones:      any[]
  reforges:       any
  potions:        string[]
  target_stats:   Record<string, string>
  requirements:   any
  cost_estimate:  any
  location:       string
  strategy?:      string
  team_config?:   string
  hotm_perks?:    string
}

const TIER_CONFIG = [
  { key: 'early', label: 'Early',  emoji: '🌱', target: '10M/h',  color: '#1baf7a' },
  { key: 'mid',   label: 'Mid',    emoji: '⚔️', target: '25M/h',  color: '#c9a84c' },
  { key: 'end',   label: 'End',    emoji: '🔥', target: '50M/h',  color: '#e34948' },
  { key: 'late',  label: 'Late',   emoji: '👑', target: '70M+/h', color: '#9b59b6' },
]

const SKILL_ICONS: Record<string, string> = {
  combat:   '⚔️',
  mining:   '⛏️',
  farming:  '🌾',
  fishing:  '🎣',
  foraging: '🌲',
  dungeon:  '🏰',
  default:  '⚡'
}

const CONF_COLORS: Record<string, string> = { HIGH: '#1baf7a', MED: '#c9a84c', LOW: '#e34948' }

// ─────────────────────────────────────────────────────────────
// SETUP PANEL — affichage du setup généré
// ─────────────────────────────────────────────────────────────
function SetupPanel({ setup }: { setup: Setup }) {
  const Section = ({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 9, fontFamily: 'Space Mono, monospace', color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ paddingLeft: 22 }}>{children}</div>
    </div>
  )

  const Tag = ({ text, color = '#c9a84c' }: { text: string; color?: string }) => (
    <span style={{ display: 'inline-block', fontSize: 10.5, padding: '2px 8px', borderRadius: 4, background: color + '15', border: '1px solid ' + color + '30', color, margin: '2px 3px 2px 0', fontFamily: 'Space Mono, monospace' }}>
      {text}
    </span>
  )

  const Stars = ({ n }: { n: number }) => (
    <span style={{ color: '#c9a84c', fontSize: 10 }}>{'⭐'.repeat(Math.min(n || 0, 7))}</span>
  )

  const StatRow = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ fontSize: 10.5, color: '#6b6960' }}>{label}</span>
      <span style={{ fontSize: 10.5, color: '#e8e6df', fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>{value}</span>
    </div>
  )

  return (
    <div style={{ background: '#0c0c0b', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '18px 18px 12px', marginTop: 2 }}>

      {/* ARMOR */}
      {setup.armor && (
        <Section icon="🛡" label="Armor">
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#e8e6df', marginRight: 8 }}>{setup.armor.set}</span>
            <Stars n={setup.armor.stars} />
            {setup.armor.recomb && <Tag text="RECOMB" color="#9b59b6" />}
          </div>
          {setup.armor.pieces && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
              {setup.armor.pieces.map((p: any, i: number) => (
                <div key={i} style={{ fontSize: 10, background: '#161614', borderRadius: 5, padding: '4px 8px', color: '#9b9b8f' }}>
                  <span style={{ color: '#e8e6df', fontWeight: 600 }}>{p.name}</span>
                  {p.str > 0 && <span style={{ color: '#e34948', marginLeft: 4 }}>+{p.str}STR</span>}
                  {p.def > 0 && <span style={{ color: '#2a78d6', marginLeft: 4 }}>+{p.def}DEF</span>}
                  {p.hp > 0 && <span style={{ color: '#1baf7a', marginLeft: 4 }}>+{p.hp}HP</span>}
                  {p.cd > 0 && <span style={{ color: '#eda100', marginLeft: 4 }}>+{p.cd}%CD</span>}
                </div>
              ))}
            </div>
          )}
          {setup.armor.set_bonus && <div style={{ fontSize: 10.5, color: '#9b59b6', marginBottom: 4 }}>✨ {setup.armor.set_bonus}</div>}
          {setup.armor.why && <div style={{ fontSize: 10.5, color: '#6b6960', fontStyle: 'italic' }}>{setup.armor.why}</div>}
        </Section>
      )}

      {/* WEAPON / TOOL / ROD */}
      {setup.weapon && (
        <Section icon="⚔️" label="Weapon">
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#e8e6df', marginRight: 8 }}>{setup.weapon.name}</span>
            <Stars n={setup.weapon.stars} />
            {setup.weapon.recomb && <Tag text="RECOMB" color="#9b59b6" />}
          </div>
          {setup.weapon.key_stat && <div style={{ fontSize: 10.5, color: '#e34948', marginBottom: 3 }}>{setup.weapon.key_stat}</div>}
          {setup.weapon.ability && <div style={{ fontSize: 10.5, color: '#9b59b6', marginBottom: 3 }}>⚡ {setup.weapon.ability}</div>}
          {setup.weapon.why && <div style={{ fontSize: 10.5, color: '#6b6960', fontStyle: 'italic' }}>{setup.weapon.why}</div>}
        </Section>
      )}

      {setup.tool && (
        <Section icon="⛏️" label="Drill Config">
          <div style={{ fontSize: 11, color: '#e8e6df', marginBottom: 3 }}><span style={{ color: '#6b6960' }}>Drill: </span>{setup.tool.drill}</div>
          <div style={{ fontSize: 11, color: '#e8e6df', marginBottom: 3 }}><span style={{ color: '#6b6960' }}>Fuel: </span>{setup.tool.fuel_tank}</div>
          <div style={{ fontSize: 11, color: '#e8e6df', marginBottom: 3 }}><span style={{ color: '#6b6960' }}>Engine: </span>{setup.tool.engine}</div>
          {setup.tool.why && <div style={{ fontSize: 10.5, color: '#6b6960', fontStyle: 'italic', marginTop: 3 }}>{setup.tool.why}</div>}
        </Section>
      )}

      {setup.rod && (
        <Section icon="🎣" label="Rod Config">
          <div style={{ fontSize: 11, color: '#e8e6df', marginBottom: 3 }}><span style={{ color: '#6b6960' }}>Rod: </span>{setup.rod.name}</div>
          <div style={{ fontSize: 11, color: '#e8e6df', marginBottom: 3 }}><span style={{ color: '#6b6960' }}>Line: </span>{setup.rod.line}</div>
          {setup.rod.why && <div style={{ fontSize: 10.5, color: '#6b6960', fontStyle: 'italic', marginTop: 3 }}>{setup.rod.why}</div>}
        </Section>
      )}

      {/* PET */}
      {setup.pet && (
        <Section icon="🐾" label="Pet">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#e8e6df' }}>{setup.pet.name}</span>
            <Tag text={'L' + (setup.pet.level || 100)} color="#1baf7a" />
            <Tag text={setup.pet.rarity || 'LEG'} color="#9b59b6" />
          </div>
          {setup.pet.bonus && <div style={{ fontSize: 10.5, color: '#1baf7a', marginBottom: 3 }}>{setup.pet.bonus}</div>}
          {setup.pet.alternative && <div style={{ fontSize: 10, color: '#6b6960' }}>Alt: {setup.pet.alternative}</div>}
        </Section>
      )}

      {/* ACCESSORIES */}
      {setup.accessories && (
        <Section icon="💍" label="Accessories">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            {setup.accessories.mp_target && (
              <div style={{ background: '#c9a84c12', border: '1px solid #c9a84c28', borderRadius: 6, padding: '4px 10px' }}>
                <span style={{ fontSize: 9, color: '#c9a84c88', fontFamily: 'Space Mono, monospace' }}>MAGIC POWER</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', fontFamily: 'Space Mono, monospace', marginLeft: 6 }}>{setup.accessories.mp_target}+</span>
              </div>
            )}
            {setup.accessories.power_stone && (
              <div style={{ background: '#9b59b612', border: '1px solid #9b59b628', borderRadius: 6, padding: '4px 10px' }}>
                <span style={{ fontSize: 9, color: '#9b59b688', fontFamily: 'Space Mono, monospace' }}>POWER STONE</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9b59b6', marginLeft: 6 }}>{setup.accessories.power_stone}</span>
              </div>
            )}
          </div>
          {setup.accessories.must_have && (
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {setup.accessories.must_have.map((a: string, i: number) => <Tag key={i} text={a} color="#c9a84c" />)}
            </div>
          )}
        </Section>
      )}

      {/* ENCHANTS */}
      {setup.enchants && (
        <Section icon="✨" label="Enchantments">
          {Object.entries(setup.enchants).map(([item, enchants]: [string, any]) => (
            <div key={item} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: '#6b6960', fontFamily: 'Space Mono, monospace', textTransform: 'uppercase', marginBottom: 4 }}>{item}:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {(Array.isArray(enchants) ? enchants : [enchants]).map((e: string, i: number) => (
                  <Tag key={i} text={e} color="#2a78d6" />
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* GEMSTONES */}
      {setup.gemstones && setup.gemstones.length > 0 && (
        <Section icon="💎" label="Gemstones">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {setup.gemstones.map((g: any, i: number) => (
              <div key={i} style={{ fontSize: 10.5, background: '#161614', borderRadius: 5, padding: '4px 8px' }}>
                <span style={{ color: '#6b6960' }}>{g.slot}: </span>
                <span style={{ color: '#e8e6df', fontWeight: 600 }}>{g.gem}</span>
                <span style={{ color: '#1baf7a', marginLeft: 4 }}>{g.stat}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* REFORGES */}
      {setup.reforges && (
        <Section icon="🔮" label="Reforges">
          {setup.reforges.weapon && <div style={{ fontSize: 10.5, color: '#e8e6df', marginBottom: 3 }}><span style={{ color: '#6b6960' }}>Weapon: </span>{setup.reforges.weapon}</div>}
          {setup.reforges.armor  && <div style={{ fontSize: 10.5, color: '#e8e6df' }}><span style={{ color: '#6b6960' }}>Armor: </span>{setup.reforges.armor}</div>}
        </Section>
      )}

      {/* POTIONS */}
      {setup.potions && setup.potions.length > 0 && (
        <Section icon="⚗️" label="Potions">
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {setup.potions.map((p: string, i: number) => <Tag key={i} text={p} color="#eda100" />)}
          </div>
        </Section>
      )}

      {/* TARGET STATS */}
      {setup.target_stats && (
        <Section icon="🎯" label="Target Stats">
          <div style={{ background: '#0e0e0d', borderRadius: 7, padding: '10px 12px' }}>
            {Object.entries(setup.target_stats).map(([k, v]) => (
              <StatRow key={k} label={k.replace(/_/g, ' ').toUpperCase()} value={v as string} />
            ))}
          </div>
        </Section>
      )}

      {/* REQUIREMENTS */}
      {setup.requirements && (
        <Section icon="📋" label="Requirements">
          {Object.entries(setup.requirements).map(([k, v]) => v && (
            <div key={k} style={{ fontSize: 10.5, color: '#9b9b8f', marginBottom: 2 }}>
              <span style={{ color: '#6b6960', textTransform: 'capitalize' }}>{k}: </span>{v as string}
            </div>
          ))}
        </Section>
      )}

      {/* COST ESTIMATE */}
      {setup.cost_estimate && (
        <Section icon="💰" label="Setup Cost">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(setup.cost_estimate).map(([tier, desc]) => (
              <div key={tier} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Tag text={tier.toUpperCase()} color={tier === 'budget' ? '#1baf7a' : tier === 'optimal' ? '#c9a84c' : '#9b59b6'} />
                <span style={{ fontSize: 10.5, color: '#9b9b8f', flex: 1 }}>{desc as string}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* LOCATION */}
      {setup.location && (
        <Section icon="🗺️" label="Location">
          <div style={{ fontSize: 11, color: '#e8e6df' }}>{setup.location}</div>
        </Section>
      )}

      {/* STRATEGY (slayer) */}
      {setup.strategy && (
        <Section icon="👹" label="Strategy">
          <div style={{ fontSize: 11, color: '#e8e6df', lineHeight: 1.6 }}>{setup.strategy}</div>
        </Section>
      )}

      {/* TEAM CONFIG (dungeon/kuudra) */}
      {setup.team_config && (
        <Section icon="🏰" label="Team Config">
          <div style={{ fontSize: 11, color: '#e8e6df', lineHeight: 1.6 }}>{setup.team_config}</div>
        </Section>
      )}

      {/* HOTM (mining) */}
      {setup.hotm_perks && (
        <Section icon="⛏️" label="HotM Perks">
          <div style={{ fontSize: 11, color: '#e8e6df', lineHeight: 1.6 }}>{setup.hotm_perks}</div>
        </Section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// METHOD CARD — avec accordion
// ─────────────────────────────────────────────────────────────
function MethodCard({
  method,
  tier,
  accentColor,
  type
}: {
  method: ActiveMethod | VaultMethod,
  tier: string,
  accentColor: string,
  type: 'active' | 'vault'
}) {
  const [expanded, setExpanded] = useState(false)
  const [setup, setSetup]       = useState<Setup | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const isActive = type === 'active'
  const m        = method as any
  const skill    = isActive ? m.skill : (m.skills_combined || []).join('+')
  const skillIcon = SKILL_ICONS[m.skill] || SKILL_ICONS[m.skills_combined?.[0]] || SKILL_ICONS.default
  const confColor = CONF_COLORS[m.confidence] || '#c9a84c'
  const coinsNum  = m.coins_min || 0

  async function loadSetup() {
    if (setup) { setExpanded(!expanded); return }
    setExpanded(true)
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
      {/* Header card */}
      <div
        onClick={loadSetup}
        style={{
          background:     expanded ? accentColor + '10' : '#0e0e0d',
          border:         `1px solid ${expanded ? accentColor + '40' : accentColor + '18'}`,
          borderLeft:     `3px solid ${accentColor}`,
          borderRadius:   expanded ? '8px 8px 0 0' : 8,
          padding:        '11px 14px',
          cursor:         'pointer',
          transition:     'all 0.15s ease',
          boxShadow:      expanded ? `0 0 20px ${accentColor}15` : 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Skill icon */}
          <div style={{
            width: 32, height: 32, borderRadius: 7, flexShrink: 0,
            background: accentColor + '15', border: '1px solid ' + accentColor + '28',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15
          }}>{skillIcon}</div>

          {/* Name + skill */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e8e6df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.method}
            </div>
            <div style={{ fontSize: 9.5, color: accentColor + 'cc', fontFamily: 'Space Mono, monospace', marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {skill.replace(/_/g, ' ')}
            </div>
          </div>

          {/* Coins/h */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: accentColor, fontFamily: 'Space Mono, monospace' }}>
              {m.coins_display}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 8, color: confColor, background: confColor + '15', border: '1px solid ' + confColor + '25', padding: '1px 5px', borderRadius: 3, fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>
                {m.confidence}
              </span>
              <span style={{ fontSize: 13, color: accentColor, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>›</span>
            </div>
          </div>
        </div>

        {/* Why / Edge (toujours visible) */}
        {(m.why_best || m.the_edge) && (
          <div style={{ marginTop: 7, paddingLeft: 42, fontSize: 10.5, color: '#6b6960', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {m.why_best || m.the_edge}
          </div>
        )}
      </div>

      {/* Accordion content */}
      {expanded && (
        <div style={{
          border:        '1px solid ' + accentColor + '25',
          borderTop:     'none',
          borderRadius:  '0 0 8px 8px',
          overflow:      'hidden'
        }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: accentColor, fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em', marginBottom: 8 }}>
                GENERATING OPTIMAL SETUP...
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: accentColor,
                    animation: `pulse 1.2s ${i * 0.2}s infinite`,
                    opacity: 0.6
                  }} />
                ))}
              </div>
            </div>
          ) : error ? (
            <div style={{ padding: '16px', background: '#0c0c0b' }}>
              <div style={{ fontSize: 10.5, color: '#e34948', fontFamily: 'Space Mono, monospace' }}>Error: {error}</div>
              <button
                onClick={(e) => { e.stopPropagation(); setError(null); setLoading(false); loadSetup() }}
                style={{ marginTop: 8, fontSize: 10, color: accentColor, background: 'transparent', border: '1px solid ' + accentColor + '40', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'Space Mono, monospace' }}
              >Retry</button>
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
// MONEY MAKING SECTION — composant principal
// ─────────────────────────────────────────────────────────────
export default function MoneyMakingSection({ marketData, dataLoading }: {
  marketData: Record<string, string>
  dataLoading: boolean
}) {
  const [mmTier, setMmTier] = useState('early')
  const currentTier = TIER_CONFIG.find(t => t.key === mmTier) || TIER_CONFIG[0]

  // Parse JSON depuis claude_analysis
  const tierKey  = 'money_making_' + mmTier
  const tierRaw  = marketData[tierKey] || ''
  let tierData: { active: ActiveMethod[]; vault: VaultMethod[] } = { active: [], vault: [] }
  try {
    if (tierRaw) tierData = JSON.parse(tierRaw)
  } catch {
    // Fallback si l'ancien format texte est encore en DB
    tierData = { active: [], vault: [] }
  }

  return (
    <div>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.4); opacity: 1; }
        }
      `}</style>

      {/* Tier selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {TIER_CONFIG.map(t => (
          <button
            key={t.key}
            onClick={() => setMmTier(t.key)}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 8, fontSize: 12,
              border: `1px solid ${mmTier === t.key ? t.color + '50' : 'rgba(255,255,255,0.06)'}`,
              background: mmTier === t.key ? t.color + '10' : '#111110',
              color: mmTier === t.key ? t.color : '#4a4a45',
              cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
              fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500
            }}
          >
            <div style={{ fontSize: 16, marginBottom: 2 }}>{t.emoji}</div>
            <div style={{ fontWeight: 600 }}>{t.label}</div>
            <div style={{ fontSize: 9, fontFamily: 'Space Mono, monospace', marginTop: 1, color: mmTier === t.key ? t.color + 'cc' : '#3a3a38' }}>{t.target}</div>
          </button>
        ))}
      </div>

      {/* Tier banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
        padding: '9px 14px',
        background: currentTier.color + '08',
        border: '1px solid ' + currentTier.color + '18',
        borderRadius: 8
      }}>
        <span style={{ fontSize: 18 }}>{currentTier.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: currentTier.color, fontFamily: 'Space Mono, monospace' }}>
            TARGET {currentTier.target} minimum
          </div>
          <div style={{ fontSize: 10, color: '#3a3a38', marginTop: 1 }}>
            Click any method to generate the full optimized setup
          </div>
        </div>
        <div style={{ fontSize: 9, fontFamily: 'Space Mono, monospace', color: '#3a3a38', padding: '3px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 5 }}>
          AI · 12h cycle
        </div>
      </div>

      {dataLoading ? (
        <div style={{ color: '#3a3a38', fontSize: 11, textAlign: 'center', padding: '3rem', fontFamily: 'Space Mono, monospace', letterSpacing: '0.08em' }}>
          LOADING AI ANALYSIS...
        </div>
      ) : tierData.active.length === 0 && tierData.vault.length === 0 ? (
        <div style={{ color: '#3a3a38', fontSize: 11, textAlign: 'center', padding: '3rem', fontFamily: 'Space Mono, monospace' }}>
          AI analysis running... check back in a moment
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* ACTIVE GRIND */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, padding: '0 2px' }}>
              <span style={{ fontSize: 14 }}>⚔️</span>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: currentTier.color, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Active Grind
              </span>
            </div>
            {tierData.active.length > 0 ? (
              tierData.active.slice(0, 3).map((m, i) => (
                <MethodCard key={i} method={m} tier={mmTier} accentColor={currentTier.color} type="active" />
              ))
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', background: '#111110', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 10, color: '#3a3a38', fontFamily: 'Space Mono, monospace' }}>Building data...</div>
              </div>
            )}
          </div>

          {/* VAULT EXCLUSIVE */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, padding: '0 2px' }}>
              <span style={{ fontSize: 14 }}>⚡</span>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: '#9b59b6', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Vault Exclusive
              </span>
            </div>
            {tierData.vault.length > 0 ? (
              tierData.vault.slice(0, 3).map((m, i) => (
                <MethodCard key={i} method={m} tier={mmTier} accentColor="#9b59b6" type="vault" />
              ))
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', background: '#111110', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 10, color: '#3a3a38', fontFamily: 'Space Mono, monospace' }}>Generating innovations...</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}