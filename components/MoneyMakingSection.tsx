// components/MoneyMakingSection.tsx
// Tout le visuel est construit par React
// Claude fournit uniquement du texte (how_to, gear names, stats en string)
'use client'
import { useState } from 'react'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type ActiveMethod = {
  id: string
  method: string
  skill: string
  coins_min: number
  coins_max: number
  coins_display: string
  key_drops: string
  why_best: string
  confidence: 'HIGH' | 'MED' | 'LOW'
}

type VaultMethod = {
  id: string
  method: string
  skills_combined: string[]
  coins_min: number
  coins_max: number
  coins_display: string
  the_edge: string
  data_source: string
  confidence: 'HIGH' | 'MED' | 'LOW'
}

// Setup = texte plat fourni par Claude, rendu par nos composants
type Setup = {
  how_to: string
  why_best: string
  armor_set: string
  armor_stars: number
  armor_recomb: boolean
  armor_stats: string
  armor_bonus: string
  weapon_name: string
  weapon_stars: number
  weapon_recomb: boolean
  weapon_stats: string
  weapon_ability: string
  tool?: string
  rod?: string
  pet_name: string
  pet_level: number
  pet_rarity: string
  pet_bonus: string
  pet_alt: string
  mp_target: number
  power_stone: string
  accessories: string[]
  enchants_weapon: string[]
  enchants_armor: string[]
  enchants_tool?: string[]
  enchants_rod?: string[]
  gemstones: string
  reforges: string
  target_stats: string
  requirements: string
  cost_budget: string
  cost_optimal: string
  cost_endgame: string
  location: string
  strategy?: string
  team_config?: string
  hotm_perks?: string
}

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const TIERS = [
  { key: 'early', label: 'Early', emoji: '🌱', target: '10M/h', color: '#1baf7a' },
  { key: 'mid',   label: 'Mid',   emoji: '⚔️', target: '25M/h', color: '#c9a84c' },
  { key: 'end',   label: 'End',   emoji: '🔥', target: '50M/h', color: '#e34948' },
  { key: 'late',  label: 'Late',  emoji: '👑', target: '70M+/h',color: '#9b59b6' },
]

const SKILL_ICONS: Record<string, string> = {
  combat: '⚔️', mining: '⛏️', farming: '🌾', fishing: '🎣', foraging: '🌲'
}

const CONF_COLORS: Record<string, string> = {
  HIGH: '#1baf7a', MED: '#c9a84c', LOW: '#e34948'
}

// ─────────────────────────────────────────────────────────────
// ATOMS VISUELS — tous construits par nous, pas par Claude
// ─────────────────────────────────────────────────────────────
function Stars({ n }: { n: number }) {
  const count = Math.min(n || 0, 7)
  if (!count) return null
  return <span style={{ color: '#c9a84c', fontSize: 10, marginLeft: 4 }}>{'⭐'.repeat(count)}</span>
}

function Tag({ text, color = '#c9a84c' }: { text: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, padding: '1px 6px', borderRadius: 3,
      background: color + '15', border: '1px solid ' + color + '28',
      color, margin: '2px 3px 2px 0',
      fontFamily: 'Space Mono, monospace', whiteSpace: 'nowrap'
    }}>
      {text}
    </span>
  )
}

function DataRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 13, width: 22, textAlign: 'center', flexShrink: 0, paddingTop: 1 }}>{icon}</span>
      <span style={{
        fontSize: 8.5, fontFamily: 'Space Mono, monospace', color: '#4a4a45',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        width: 72, flexShrink: 0, paddingTop: 2
      }}>{label}</span>
      <div style={{ flex: 1, fontSize: 11, color: '#cac8c0', lineHeight: 1.55 }}>{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SETUP PANEL — visuel construit par nous, données par Claude
// ─────────────────────────────────────────────────────────────
function SetupPanel({ setup }: { setup: Setup }) {
  return (
    <div style={{ background: '#0b0b0a', padding: '14px 16px 12px' }}>

      {/* HOW TO */}
      <div style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.1)', borderRadius: 8, padding: '10px 13px', marginBottom: 12 }}>
        <div style={{ fontSize: 8.5, color: '#c9a84c', fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em', marginBottom: 5 }}>
          HOW TO
        </div>
        <div style={{ fontSize: 11.5, color: '#d8d6cf', lineHeight: 1.7 }}>{setup.how_to}</div>
        {setup.why_best && (
          <div style={{ fontSize: 10, color: '#6b6960', marginTop: 6, fontStyle: 'italic' }}>→ {setup.why_best}</div>
        )}
      </div>

      {/* ARMOR */}
      <DataRow icon="🛡" label="Armor">
        <span>
          <strong style={{ color: '#e8e6df' }}>{setup.armor_set}</strong>
          <Stars n={setup.armor_stars} />
          {setup.armor_recomb && <Tag text="RECOMB" color="#9b59b6" />}
        </span>
        {setup.armor_stats && <div style={{ fontSize: 10, color: '#6b6960', marginTop: 2 }}>{setup.armor_stats}</div>}
        {setup.armor_bonus && <div style={{ fontSize: 10, color: '#9b59b6', marginTop: 1 }}>{setup.armor_bonus}</div>}
      </DataRow>

      {/* WEAPON */}
      <DataRow icon="⚔️" label="Weapon">
        <span>
          <strong style={{ color: '#e8e6df' }}>{setup.weapon_name}</strong>
          <Stars n={setup.weapon_stars} />
          {setup.weapon_recomb && <Tag text="RECOMB" color="#9b59b6" />}
        </span>
        {setup.weapon_stats   && <div style={{ fontSize: 10, color: '#6b6960', marginTop: 2 }}>{setup.weapon_stats}</div>}
        {setup.weapon_ability && <div style={{ fontSize: 10, color: '#2a78d6', marginTop: 1 }}>{setup.weapon_ability}</div>}
      </DataRow>

      {/* TOOL (mining) */}
      {setup.tool && <DataRow icon="⛏️" label="Drill"><span style={{ color: '#e8e6df' }}>{setup.tool}</span></DataRow>}

      {/* ROD (fishing) */}
      {setup.rod && <DataRow icon="🎣" label="Rod"><span style={{ color: '#e8e6df' }}>{setup.rod}</span></DataRow>}

      {/* PET */}
      <DataRow icon="🐾" label="Pet">
        <span>
          <strong style={{ color: '#e8e6df' }}>{setup.pet_name}</strong>
          <Tag text={'L' + (setup.pet_level || 100)} color="#1baf7a" />
          <Tag text={setup.pet_rarity || 'LEG'} color="#9b59b6" />
        </span>
        {setup.pet_bonus && <div style={{ fontSize: 10, color: '#1baf7a', marginTop: 2 }}>{setup.pet_bonus}</div>}
        {setup.pet_alt   && <div style={{ fontSize: 10, color: '#4a4a45', marginTop: 1 }}>Alt: {setup.pet_alt}</div>}
      </DataRow>

      {/* ACCESSORIES */}
      <DataRow icon="💍" label="Access.">
        <div style={{ marginBottom: 4 }}>
          <Tag text={'MP ' + (setup.mp_target || 900) + '+'} color="#c9a84c" />
          {setup.power_stone && <Tag text={setup.power_stone} color="#9b59b6" />}
        </div>
        <div>{(setup.accessories || []).map((a, i) => <Tag key={i} text={a} />)}</div>
      </DataRow>

      {/* ENCHANTS */}
      <DataRow icon="✨" label="Enchants">
        {setup.enchants_weapon?.length > 0 && (
          <div style={{ marginBottom: 3 }}>
            <span style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginRight: 4 }}>Weapon:</span>
            {setup.enchants_weapon.map((e, i) => <Tag key={i} text={e} color="#2a78d6" />)}
          </div>
        )}
        {setup.enchants_armor?.length > 0 && (
          <div style={{ marginBottom: 3 }}>
            <span style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginRight: 4 }}>Armor:</span>
            {setup.enchants_armor.map((e, i) => <Tag key={i} text={e} color="#2a78d6" />)}
          </div>
        )}
        {(setup.enchants_tool?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 3 }}>
            <span style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginRight: 4 }}>Drill:</span>
            {(setup.enchants_tool ?? []).map((e, i) => <Tag key={i} text={e} color="#2a78d6" />)}
          </div>
        )}
        {(setup.enchants_rod?.length ?? 0) > 0 && (
          <div>
            <span style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginRight: 4 }}>Rod:</span>
            {(setup.enchants_rod ?? []).map((e, i) => <Tag key={i} text={e} color="#2a78d6" />)}
          </div>
        )}
      </DataRow>

      {/* GEMSTONES */}
      {setup.gemstones && (
        <DataRow icon="💎" label="Gems"><span style={{ color: '#e8e6df' }}>{setup.gemstones}</span></DataRow>
      )}

      {/* REFORGES */}
      {setup.reforges && (
        <DataRow icon="🔮" label="Reforges"><span style={{ color: '#e8e6df' }}>{setup.reforges}</span></DataRow>
      )}

      {/* TARGET STATS */}
      {setup.target_stats && (
        <DataRow icon="🎯" label="Stats">
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#1baf7a', fontWeight: 700 }}>
            {setup.target_stats}
          </span>
        </DataRow>
      )}

      {/* REQUIREMENTS */}
      {setup.requirements && (
        <DataRow icon="📋" label="Reqs"><span style={{ color: '#9b9b8f' }}>{setup.requirements}</span></DataRow>
      )}

      {/* COST */}
      {(setup.cost_budget || setup.cost_optimal || setup.cost_endgame) && (
        <DataRow icon="💰" label="Cost">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {setup.cost_budget   && <div><Tag text="Budget"  color="#1baf7a" /><span style={{ fontSize: 10, color: '#9b9b8f' }}>{setup.cost_budget}</span></div>}
            {setup.cost_optimal  && <div><Tag text="Optimal" color="#c9a84c" /><span style={{ fontSize: 10, color: '#9b9b8f' }}>{setup.cost_optimal}</span></div>}
            {setup.cost_endgame  && <div><Tag text="BiS"     color="#9b59b6" /><span style={{ fontSize: 10, color: '#9b9b8f' }}>{setup.cost_endgame}</span></div>}
          </div>
        </DataRow>
      )}

      {/* LOCATION */}
      {setup.location && (
        <DataRow icon="🗺️" label="Location"><span style={{ color: '#e8e6df' }}>{setup.location}</span></DataRow>
      )}

      {/* STRATEGY (slayer) */}
      {setup.strategy && (
        <DataRow icon="👹" label="Strategy"><span style={{ color: '#e8e6df', lineHeight: 1.6 }}>{setup.strategy}</span></DataRow>
      )}

      {/* TEAM (dungeon/kuudra) */}
      {setup.team_config && (
        <DataRow icon="🏰" label="Team"><span style={{ color: '#e8e6df', lineHeight: 1.6 }}>{setup.team_config}</span></DataRow>
      )}

      {/* HOTM (mining) */}
      {setup.hotm_perks && (
        <DataRow icon="⛏️" label="HotM"><span style={{ color: '#e8e6df' }}>{setup.hotm_perks}</span></DataRow>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// METHOD CARD — accordion, setup lu depuis DB (pas de Claude)
// ─────────────────────────────────────────────────────────────
function MethodCard({
  method, tier, accentColor, type
}: {
  method: ActiveMethod | VaultMethod
  tier: string
  accentColor: string
  type: 'active' | 'vault'
}) {
  const [expanded, setExpanded] = useState(false)
  const [setup,    setSetup]    = useState<Setup | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [notReady, setNotReady] = useState(false)

  const m         = method as any
  const skill     = type === 'active' ? m.skill : (m.skills_combined || []).join('+')
  const skillIcon = SKILL_ICONS[m.skill] || SKILL_ICONS[m.skills_combined?.[0]] || '⚡'
  const confColor = CONF_COLORS[m.confidence] || '#c9a84c'

  async function toggle() {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (setup || notReady) return

    setLoading(true)
    try {
      const res  = await fetch('/api/setup/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ method, tier }),
      })
      const data = await res.json()

      if (data.not_ready) {
        setNotReady(true)
      } else if (data.setup) {
        setSetup(data.setup)
      }
    } catch {
      setNotReady(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Header cliquable */}
      <div
        onClick={toggle}
        style={{
          background:   expanded ? accentColor + '0d' : '#0e0e0d',
          border:       `1px solid ${expanded ? accentColor + '38' : accentColor + '14'}`,
          borderLeft:   `3px solid ${accentColor}`,
          borderRadius: expanded ? '8px 8px 0 0' : 8,
          padding:      '10px 13px',
          cursor:       'pointer',
          transition:   'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {/* Skill icon */}
          <div style={{
            width: 30, height: 30, borderRadius: 6, flexShrink: 0,
            background: accentColor + '12', border: '1px solid ' + accentColor + '22',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
          }}>{skillIcon}</div>

          {/* Nom + skill */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#e8e6df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.method}
            </div>
            <div style={{ fontSize: 9, color: accentColor + 'bb', fontFamily: 'Space Mono, monospace', marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {skill.replace(/_/g, ' ')}
            </div>
          </div>

          {/* Coins/h + confidence + chevron */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: accentColor, fontFamily: 'Space Mono, monospace' }}>
              {m.coins_display}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                fontSize: 7.5, color: confColor,
                background: confColor + '13', border: '1px solid ' + confColor + '20',
                padding: '1px 5px', borderRadius: 3,
                fontFamily: 'Space Mono, monospace', fontWeight: 700
              }}>{m.confidence}</span>
              <span style={{
                fontSize: 13, color: accentColor,
                transform: expanded ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.2s', display: 'inline-block'
              }}>›</span>
            </div>
          </div>
        </div>

        {/* Preview (why/edge) — visible seulement quand fermé */}
        {!expanded && (m.why_best || m.the_edge) && (
          <div style={{
            marginTop: 5, paddingLeft: 39, fontSize: 10, color: '#4a4a45', lineHeight: 1.4,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 1, WebkitBoxOrient: 'vertical'
          }}>
            {m.why_best || m.the_edge}
          </div>
        )}
      </div>

      {/* Contenu accordion */}
      {expanded && (
        <div style={{ border: '1px solid ' + accentColor + '20', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', background: '#0b0b0a' }}>
              <div style={{ fontSize: 9.5, color: accentColor, fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em', marginBottom: 10 }}>
                LOADING SETUP...
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 5 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 5, height: 5, borderRadius: '50%', background: accentColor,
                    animation: `mm_pulse 1.2s ${i * 0.2}s infinite`, opacity: 0.7
                  }} />
                ))}
              </div>
            </div>
          ) : notReady ? (
            <div style={{ padding: '16px', background: '#0b0b0a', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginBottom: 4 }}>
                ⏳ Setup not yet generated
              </div>
              <div style={{ fontSize: 9.5, color: '#3a3a38', fontFamily: 'Space Mono, monospace' }}>
                Available after Monday 7h UTC (weekly generation)
              </div>
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
export default function MoneyMakingSection({
  marketData, dataLoading
}: {
  marketData: Record<string, string>
  dataLoading: boolean
}) {
  const [mmTier, setMmTier] = useState('early')
  const currentTier = TIERS.find(t => t.key === mmTier) || TIERS[0]

  // Parse JSON depuis claude_analysis
  let tierData: { active: ActiveMethod[]; vault: VaultMethod[] } = { active: [], vault: [] }
  try {
    const raw = marketData['money_making_' + mmTier] || ''
    if (raw) tierData = JSON.parse(raw)
  } catch {}

  return (
    <div>
      <style>{`
        @keyframes mm_pulse {
          0%,100%{transform:scale(1);opacity:0.7}
          50%{transform:scale(1.5);opacity:1}
        }
      `}</style>

      {/* Tier selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {TIERS.map(t => (
          <button
            key={t.key}
            onClick={() => setMmTier(t.key)}
            style={{
              flex: 1, padding: '9px 8px', borderRadius: 8,
              border: `1px solid ${mmTier === t.key ? t.color + '45' : 'rgba(255,255,255,0.05)'}`,
              background: mmTier === t.key ? t.color + '0d' : '#111110',
              color: mmTier === t.key ? t.color : '#4a4a45',
              cursor: 'pointer', textAlign: 'center',
              transition: 'all 0.15s', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500
            }}
          >
            <div style={{ fontSize: 15, marginBottom: 1 }}>{t.emoji}</div>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{t.label}</div>
            <div style={{ fontSize: 8.5, fontFamily: 'Space Mono, monospace', marginTop: 1, color: mmTier === t.key ? t.color + 'bb' : '#2a2a28' }}>{t.target}</div>
          </button>
        ))}
      </div>

      {/* Banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
        padding: '8px 13px',
        background: currentTier.color + '07',
        border: '1px solid ' + currentTier.color + '15',
        borderRadius: 7
      }}>
        <span style={{ fontSize: 16 }}>{currentTier.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: currentTier.color, fontFamily: 'Space Mono, monospace' }}>
            TARGET {currentTier.target} minimum
          </div>
          <div style={{ fontSize: 9.5, color: '#3a3a38', marginTop: 1 }}>
            Click any method to see the full gear setup
          </div>
        </div>
        <div style={{ fontSize: 8.5, fontFamily: 'Space Mono, monospace', color: '#3a3a38', padding: '2px 7px', background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
          Weekly AI
        </div>
      </div>

      {/* Contenu */}
      {dataLoading ? (
        <div style={{ color: '#2a2a28', fontSize: 10.5, textAlign: 'center', padding: '3rem', fontFamily: 'Space Mono, monospace', letterSpacing: '0.08em' }}>
          LOADING AI ANALYSIS...
        </div>
      ) : tierData.active.length === 0 && tierData.vault.length === 0 ? (
        <div style={{ color: '#2a2a28', fontSize: 10.5, textAlign: 'center', padding: '3rem', fontFamily: 'Space Mono, monospace' }}>
          AI analysis running... available after Monday 6h UTC
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* ACTIVE GRIND */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 13 }}>⚔️</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: currentTier.color, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Active Grind
              </span>
            </div>
            {tierData.active.slice(0, 3).map((m, i) => (
              <MethodCard
                key={mmTier + '_a_' + (m.id || i)}
                method={m}
                tier={mmTier}
                accentColor={currentTier.color}
                type="active"
              />
            ))}
          </div>

          {/* VAULT EXCLUSIVE */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 13 }}>⚡</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: '#9b59b6', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Vault Exclusive
              </span>
            </div>
            {tierData.vault.slice(0, 3).map((m, i) => (
              <MethodCard
                key={mmTier + '_v_' + (m.id || i)}
                method={m}
                tier={mmTier}
                accentColor="#9b59b6"
                type="vault"
              />
            ))}
          </div>

        </div>
      )}
    </div>
  )
}