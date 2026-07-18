// components/MoneyMakingSection.tsx
// Visuel 100% construit par React — Claude fournit uniquement du texte
// Rendu défensif sur tous les champs — zero crash possible
'use client'
import { useState } from 'react'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type AnyMethod = Record<string, any>

type Setup = Record<string, any>

const TIERS = [
  { key: 'early', label: 'Early', emoji: '🌱', target: '10M/h',  color: '#1baf7a' },
  { key: 'mid',   label: 'Mid',   emoji: '⚔️', target: '25M/h',  color: '#c9a84c' },
  { key: 'end',   label: 'End',   emoji: '🔥', target: '50M/h',  color: '#e34948' },
  { key: 'late',  label: 'Late',  emoji: '👑', target: '70M+/h', color: '#9b59b6' },
]

const SKILL_ICONS: Record<string, string> = {
  combat: '⚔️', mining: '⛏️', farming: '🌾', fishing: '🎣', foraging: '🌲'
}

const CONF_COLORS: Record<string, string> = {
  HIGH: '#1baf7a', MED: '#c9a84c', LOW: '#e34948'
}

// Helpers défensifs
const str  = (v: any) => (typeof v === 'string' ? v : '') 
const num  = (v: any) => (typeof v === 'number' ? v : 0)
const bool = (v: any) => (typeof v === 'boolean' ? v : false)
const arr  = (v: any): string[] => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : [])

// ─────────────────────────────────────────────────────────────
// ATOMS
// ─────────────────────────────────────────────────────────────
function Stars({ n }: { n: number }) {
  const count = Math.min(Math.max(num(n), 0), 7)
  if (!count) return null
  return <span style={{ color: '#c9a84c', fontSize: 10, marginLeft: 4 }}>{'⭐'.repeat(count)}</span>
}

function Tag({ text, color = '#c9a84c' }: { text: string; color?: string }) {
  if (!text) return null
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, padding: '1px 6px', borderRadius: 3,
      background: color + '15', border: '1px solid ' + color + '28',
      color, margin: '2px 3px 2px 0', fontFamily: 'Space Mono, monospace', whiteSpace: 'nowrap'
    }}>{text}</span>
  )
}

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 13, width: 22, textAlign: 'center', flexShrink: 0, paddingTop: 1 }}>{icon}</span>
      <span style={{ fontSize: 8.5, fontFamily: 'Space Mono, monospace', color: '#4a4a45', textTransform: 'uppercase', letterSpacing: '0.1em', width: 72, flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <div style={{ flex: 1, fontSize: 11, color: '#cac8c0', lineHeight: 1.55 }}>{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SETUP PANEL — 100% défensif, visuel par nous, texte par Claude
// ─────────────────────────────────────────────────────────────
function SetupPanel({ setup }: { setup: Setup }) {
  const s = setup || {}

  const armorSet    = str(s.armor_set)
  const armorStars  = num(s.armor_stars)
  const armorRecomb = bool(s.armor_recomb)
  const armorStats  = str(s.armor_stats)
  const armorBonus  = str(s.armor_bonus)

  const weaponName   = str(s.weapon_name)
  const weaponStars  = num(s.weapon_stars)
  const weaponRecomb = bool(s.weapon_recomb)
  const weaponStats  = str(s.weapon_stats)
  const weaponAbility= str(s.weapon_ability)

  const petName   = str(s.pet_name)
  const petLevel  = num(s.pet_level) || 100
  const petRarity = str(s.pet_rarity) || 'LEGENDARY'
  const petBonus  = str(s.pet_bonus)
  const petAlt    = str(s.pet_alt)

  const mpTarget   = num(s.mp_target) || 900
  const powerStone = str(s.power_stone)
  const accessories= arr(s.accessories)

  const enchWeapon = arr(s.enchants_weapon)
  const enchArmor  = arr(s.enchants_armor)
  const enchTool   = arr(s.enchants_tool)
  const enchRod    = arr(s.enchants_rod)

  return (
    <div style={{ background: '#0b0b0a', padding: '14px 16px 12px' }}>

      {/* HOW TO */}
      {(str(s.how_to) || str(s.why_best)) && (
        <div style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.1)', borderRadius: 8, padding: '10px 13px', marginBottom: 12 }}>
          <div style={{ fontSize: 8.5, color: '#c9a84c', fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em', marginBottom: 5 }}>HOW TO</div>
          {str(s.how_to) && <div style={{ fontSize: 11.5, color: '#d8d6cf', lineHeight: 1.7 }}>{str(s.how_to)}</div>}
          {str(s.why_best) && <div style={{ fontSize: 10, color: '#6b6960', marginTop: 6, fontStyle: 'italic' }}>→ {str(s.why_best)}</div>}
        </div>
      )}

      {/* ARMOR */}
      {armorSet && (
        <Row icon="🛡" label="Armor">
          <div>
            <strong style={{ color: '#e8e6df' }}>{armorSet}</strong>
            <Stars n={armorStars} />
            {armorRecomb && <Tag text="RECOMB" color="#9b59b6" />}
          </div>
          {armorStats && <div style={{ fontSize: 10, color: '#6b6960', marginTop: 2 }}>{armorStats}</div>}
          {armorBonus && <div style={{ fontSize: 10, color: '#9b59b6', marginTop: 1 }}>{armorBonus}</div>}
        </Row>
      )}

      {/* WEAPON */}
      {weaponName && (
        <Row icon="⚔️" label="Weapon">
          <div>
            <strong style={{ color: '#e8e6df' }}>{weaponName}</strong>
            <Stars n={weaponStars} />
            {weaponRecomb && <Tag text="RECOMB" color="#9b59b6" />}
          </div>
          {weaponStats   && <div style={{ fontSize: 10, color: '#6b6960', marginTop: 2 }}>{weaponStats}</div>}
          {weaponAbility && <div style={{ fontSize: 10, color: '#2a78d6', marginTop: 1 }}>{weaponAbility}</div>}
        </Row>
      )}

      {/* TOOL (mining) */}
      {str(s.tool) && (
        <Row icon="⛏️" label="Drill"><span style={{ color: '#e8e6df' }}>{str(s.tool)}</span></Row>
      )}

      {/* ROD (fishing) */}
      {str(s.rod) && (
        <Row icon="🎣" label="Rod"><span style={{ color: '#e8e6df' }}>{str(s.rod)}</span></Row>
      )}

      {/* PET */}
      {petName && (
        <Row icon="🐾" label="Pet">
          <div>
            <strong style={{ color: '#e8e6df' }}>{petName}</strong>
            <Tag text={'L' + petLevel} color="#1baf7a" />
            {petRarity && <Tag text={petRarity.slice(0, 3).toUpperCase()} color="#9b59b6" />}
          </div>
          {petBonus && <div style={{ fontSize: 10, color: '#1baf7a', marginTop: 2 }}>{petBonus}</div>}
          {petAlt   && <div style={{ fontSize: 10, color: '#4a4a45', marginTop: 1 }}>Alt: {petAlt}</div>}
        </Row>
      )}

      {/* ACCESSORIES */}
      {(accessories.length > 0 || powerStone) && (
        <Row icon="💍" label="Access.">
          <div style={{ marginBottom: 4 }}>
            <Tag text={'MP ' + mpTarget + '+'} color="#c9a84c" />
            {powerStone && <Tag text={powerStone} color="#9b59b6" />}
          </div>
          {accessories.length > 0 && (
            <div>{accessories.map((a, i) => <Tag key={i} text={a} />)}</div>
          )}
        </Row>
      )}

      {/* ENCHANTS */}
      {(enchWeapon.length > 0 || enchArmor.length > 0 || enchTool.length > 0 || enchRod.length > 0) && (
        <Row icon="✨" label="Enchants">
          {enchWeapon.length > 0 && (
            <div style={{ marginBottom: 3 }}>
              <span style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginRight: 4 }}>Weapon:</span>
              {enchWeapon.map((e, i) => <Tag key={i} text={e} color="#2a78d6" />)}
            </div>
          )}
          {enchArmor.length > 0 && (
            <div style={{ marginBottom: 3 }}>
              <span style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginRight: 4 }}>Armor:</span>
              {enchArmor.map((e, i) => <Tag key={i} text={e} color="#2a78d6" />)}
            </div>
          )}
          {enchTool.length > 0 && (
            <div style={{ marginBottom: 3 }}>
              <span style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginRight: 4 }}>Drill:</span>
              {enchTool.map((e, i) => <Tag key={i} text={e} color="#2a78d6" />)}
            </div>
          )}
          {enchRod.length > 0 && (
            <div>
              <span style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginRight: 4 }}>Rod:</span>
              {enchRod.map((e, i) => <Tag key={i} text={e} color="#2a78d6" />)}
            </div>
          )}
        </Row>
      )}

      {str(s.gemstones) && (
        <Row icon="💎" label="Gems"><span style={{ color: '#e8e6df' }}>{str(s.gemstones)}</span></Row>
      )}

      {str(s.reforges) && (
        <Row icon="🔮" label="Reforges"><span style={{ color: '#e8e6df' }}>{str(s.reforges)}</span></Row>
      )}

      {str(s.target_stats) && (
        <Row icon="🎯" label="Stats">
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#1baf7a', fontWeight: 700 }}>
            {str(s.target_stats)}
          </span>
        </Row>
      )}

      {str(s.requirements) && (
        <Row icon="📋" label="Reqs"><span style={{ color: '#9b9b8f' }}>{str(s.requirements)}</span></Row>
      )}

      {(str(s.cost_budget) || str(s.cost_optimal) || str(s.cost_endgame)) && (
        <Row icon="💰" label="Cost">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {str(s.cost_budget)  && <div><Tag text="Budget"  color="#1baf7a" /><span style={{ fontSize: 10, color: '#9b9b8f' }}>{str(s.cost_budget)}</span></div>}
            {str(s.cost_optimal) && <div><Tag text="Optimal" color="#c9a84c" /><span style={{ fontSize: 10, color: '#9b9b8f' }}>{str(s.cost_optimal)}</span></div>}
            {str(s.cost_endgame) && <div><Tag text="BiS"     color="#9b59b6" /><span style={{ fontSize: 10, color: '#9b9b8f' }}>{str(s.cost_endgame)}</span></div>}
          </div>
        </Row>
      )}

      {str(s.location) && (
        <Row icon="🗺️" label="Location"><span style={{ color: '#e8e6df' }}>{str(s.location)}</span></Row>
      )}

      {str(s.strategy) && (
        <Row icon="👹" label="Strategy"><span style={{ color: '#e8e6df', lineHeight: 1.6 }}>{str(s.strategy)}</span></Row>
      )}

      {str(s.team_config) && (
        <Row icon="🏰" label="Team"><span style={{ color: '#e8e6df', lineHeight: 1.6 }}>{str(s.team_config)}</span></Row>
      )}

      {str(s.hotm_perks) && (
        <Row icon="⛏️" label="HotM"><span style={{ color: '#e8e6df' }}>{str(s.hotm_perks)}</span></Row>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// METHOD CARD
// ─────────────────────────────────────────────────────────────
function MethodCard({ method, tier, accentColor, type }: {
  method: AnyMethod; tier: string; accentColor: string; type: 'active' | 'vault'
}) {
  const [expanded, setExpanded] = useState(false)
  const [setup,    setSetup]    = useState<Setup | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [notReady, setNotReady] = useState(false)

  const skill     = type === 'active' ? str(method.skill) : arr(method.skills_combined).join('+')
  const skillIcon = SKILL_ICONS[str(method.skill)] || SKILL_ICONS[arr(method.skills_combined)[0]] || '⚡'
  const confColor = CONF_COLORS[str(method.confidence)] || '#c9a84c'
  const coins     = str(method.coins_display)
  const name      = str(method.method)
  const preview   = str(method.why_best) || str(method.the_edge)

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
      if (data.not_ready || data.error) setNotReady(true)
      else if (data.setup) setSetup(data.setup)
      else setNotReady(true)
    } catch { setNotReady(true) }
    finally  { setLoading(false) }
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={toggle}
        style={{
          background:   expanded ? accentColor + '0d' : '#0e0e0d',
          border:       `1px solid ${expanded ? accentColor + '38' : accentColor + '14'}`,
          borderLeft:   `3px solid ${accentColor}`,
          borderRadius: expanded ? '8px 8px 0 0' : 8,
          padding:      '10px 13px', cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 6, flexShrink: 0, background: accentColor + '12', border: '1px solid ' + accentColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
            {skillIcon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#e8e6df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            {skill && <div style={{ fontSize: 9, color: accentColor + 'bb', fontFamily: 'Space Mono, monospace', marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{skill.replace(/_/g, ' ')}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            {coins && <div style={{ fontSize: 12, fontWeight: 700, color: accentColor, fontFamily: 'Space Mono, monospace' }}>{coins}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 7.5, color: confColor, background: confColor + '13', border: '1px solid ' + confColor + '20', padding: '1px 5px', borderRadius: 3, fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>
                {str(method.confidence) || 'MED'}
              </span>
              <span style={{ fontSize: 13, color: accentColor, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>›</span>
            </div>
          </div>
        </div>
        {!expanded && preview && (
          <div style={{ marginTop: 5, paddingLeft: 39, fontSize: 10, color: '#4a4a45', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
            {preview}
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ border: '1px solid ' + accentColor + '20', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', background: '#0b0b0a' }}>
              <div style={{ fontSize: 9.5, color: accentColor, fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em', marginBottom: 10 }}>LOADING SETUP...</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 5 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: accentColor, animation: `mm_pulse 1.2s ${i*0.2}s infinite`, opacity: 0.7 }} />)}
              </div>
            </div>
          ) : notReady ? (
            <div style={{ padding: '16px', background: '#0b0b0a', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginBottom: 4 }}>⏳ Setup not yet generated</div>
              <div style={{ fontSize: 9.5, color: '#3a3a38', fontFamily: 'Space Mono, monospace' }}>Available after Monday 7h UTC</div>
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
// MAIN SECTION
// ─────────────────────────────────────────────────────────────
export default function MoneyMakingSection({ marketData, dataLoading }: {
  marketData: Record<string, string>; dataLoading: boolean
}) {
  const [mmTier, setMmTier] = useState('early')
  const tier = TIERS.find(t => t.key === mmTier) || TIERS[0]

  let active: AnyMethod[] = []
  let vault:  AnyMethod[] = []
  try {
    const raw = marketData['money_making_' + mmTier] || ''
    if (raw) {
      const parsed = JSON.parse(raw)
      active = Array.isArray(parsed.active) ? parsed.active : []
      vault  = Array.isArray(parsed.vault)  ? parsed.vault  : []
    }
  } catch {}

  return (
    <div>
      <style>{`@keyframes mm_pulse{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.5);opacity:1}}`}</style>

      {/* Tier selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {TIERS.map(t => (
          <button key={t.key} onClick={() => setMmTier(t.key)} style={{
            flex: 1, padding: '9px 8px', borderRadius: 8,
            border: `1px solid ${mmTier === t.key ? t.color + '45' : 'rgba(255,255,255,0.05)'}`,
            background: mmTier === t.key ? t.color + '0d' : '#111110',
            color: mmTier === t.key ? t.color : '#4a4a45',
            cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
            fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: 11
          }}>
            <div style={{ fontSize: 15, marginBottom: 1 }}>{t.emoji}</div>
            <div style={{ fontWeight: 600 }}>{t.label}</div>
            <div style={{ fontSize: 8.5, fontFamily: 'Space Mono, monospace', marginTop: 1, color: mmTier === t.key ? t.color + 'bb' : '#2a2a28' }}>{t.target}</div>
          </button>
        ))}
      </div>

      {/* Banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '8px 13px', background: tier.color + '07', border: '1px solid ' + tier.color + '15', borderRadius: 7 }}>
        <span style={{ fontSize: 16 }}>{tier.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: tier.color, fontFamily: 'Space Mono, monospace' }}>TARGET {tier.target} minimum</div>
          <div style={{ fontSize: 9.5, color: '#3a3a38', marginTop: 1 }}>Click any method to see the full gear setup</div>
        </div>
        <div style={{ fontSize: 8.5, fontFamily: 'Space Mono, monospace', color: '#3a3a38', padding: '2px 7px', background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>Weekly AI</div>
      </div>

      {/* Content */}
      {dataLoading ? (
        <div style={{ color: '#2a2a28', fontSize: 10.5, textAlign: 'center', padding: '3rem', fontFamily: 'Space Mono, monospace', letterSpacing: '0.08em' }}>LOADING AI ANALYSIS...</div>
      ) : active.length === 0 && vault.length === 0 ? (
        <div style={{ color: '#2a2a28', fontSize: 10.5, textAlign: 'center', padding: '3rem', fontFamily: 'Space Mono, monospace' }}>AI analysis available after Monday 6h UTC</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 13 }}>⚔️</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: tier.color, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Active Grind</span>
            </div>
            {active.slice(0, 3).map((m, i) => (
              <MethodCard key={mmTier + '_a_' + (str(m.id) || i)} method={m} tier={mmTier} accentColor={tier.color} type="active" />
            ))}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 13 }}>⚡</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: '#9b59b6', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Vault Exclusive</span>
            </div>
            {vault.slice(0, 3).map((m, i) => (
              <MethodCard key={mmTier + '_v_' + (str(m.id) || i)} method={m} tier={mmTier} accentColor="#9b59b6" type="vault" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}