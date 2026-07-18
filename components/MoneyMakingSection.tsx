// components/MoneyMakingSection.tsx
// Visuel 100% React — Claude fournit uniquement du texte
// Feedback communautaire ✅/❌ avec commentaire optionnel
'use client'
import { useState, useEffect, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────
type AnyMethod = Record<string, any>
type Setup     = Record<string, any>

type FeedbackData = {
  positive:     number
  negative:     number
  total:        number
  approval_pct: number | null
}

// ─── Config ──────────────────────────────────────────────────
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

// ─── Helpers défensifs ───────────────────────────────────────
const s = (v: any) => typeof v === 'string' ? v : ''
const n = (v: any) => typeof v === 'number' ? v : 0
const b = (v: any) => typeof v === 'boolean' ? v : false
const a = (v: any): string[] => Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
const methodKey = (m: any) =>
  (s(m.id) || s(m.method)).toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 80)

// ─── Atoms ───────────────────────────────────────────────────
function Stars({ count }: { count: number }) {
  const c = Math.min(Math.max(n(count), 0), 7)
  return c ? <span style={{ color: '#c9a84c', fontSize: 10, marginLeft: 4 }}>{'⭐'.repeat(c)}</span> : null
}

function Tag({ text, color = '#c9a84c' }: { text: string; color?: string }) {
  if (!text) return null
  return (
    <span style={{ display: 'inline-block', fontSize: 9, padding: '1px 6px', borderRadius: 3, background: color + '15', border: '1px solid ' + color + '28', color, margin: '2px 3px 2px 0', fontFamily: 'Space Mono, monospace', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 13, width: 22, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 8.5, fontFamily: 'Space Mono, monospace', color: '#4a4a45', textTransform: 'uppercase', letterSpacing: '0.1em', width: 72, flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <div style={{ flex: 1, fontSize: 11, color: '#cac8c0', lineHeight: 1.55 }}>{children}</div>
    </div>
  )
}

// ─── Setup Panel ─────────────────────────────────────────────
function SetupPanel({ setup }: { setup: Setup }) {
  const enchWeapon = a(setup.enchants_weapon)
  const enchArmor  = a(setup.enchants_armor)
  const enchTool   = a(setup.enchants_tool)
  const enchRod    = a(setup.enchants_rod)

  return (
    <div style={{ background: '#0b0b0a', padding: '14px 16px 12px' }}>
      {(s(setup.how_to) || s(setup.why_best)) && (
        <div style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.1)', borderRadius: 8, padding: '10px 13px', marginBottom: 12 }}>
          <div style={{ fontSize: 8.5, color: '#c9a84c', fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em', marginBottom: 5 }}>HOW TO</div>
          {s(setup.how_to)   && <div style={{ fontSize: 11.5, color: '#d8d6cf', lineHeight: 1.7 }}>{s(setup.how_to)}</div>}
          {s(setup.why_best) && <div style={{ fontSize: 10, color: '#6b6960', marginTop: 6, fontStyle: 'italic' }}>→ {s(setup.why_best)}</div>}
        </div>
      )}
      {s(setup.armor_set) && (
        <Row icon="🛡" label="Armor">
          <div><strong style={{ color: '#e8e6df' }}>{s(setup.armor_set)}</strong><Stars count={n(setup.armor_stars)} />{b(setup.armor_recomb) && <Tag text="RECOMB" color="#9b59b6" />}</div>
          {s(setup.armor_stats) && <div style={{ fontSize: 10, color: '#6b6960', marginTop: 2 }}>{s(setup.armor_stats)}</div>}
          {s(setup.armor_bonus) && <div style={{ fontSize: 10, color: '#9b59b6', marginTop: 1 }}>{s(setup.armor_bonus)}</div>}
        </Row>
      )}
      {s(setup.weapon_name) && (
        <Row icon="⚔️" label="Weapon">
          <div><strong style={{ color: '#e8e6df' }}>{s(setup.weapon_name)}</strong><Stars count={n(setup.weapon_stars)} />{b(setup.weapon_recomb) && <Tag text="RECOMB" color="#9b59b6" />}</div>
          {s(setup.weapon_stats)   && <div style={{ fontSize: 10, color: '#6b6960', marginTop: 2 }}>{s(setup.weapon_stats)}</div>}
          {s(setup.weapon_ability) && <div style={{ fontSize: 10, color: '#2a78d6', marginTop: 1 }}>{s(setup.weapon_ability)}</div>}
        </Row>
      )}
      {s(setup.tool) && <Row icon="⛏️" label="Drill"><span style={{ color: '#e8e6df' }}>{s(setup.tool)}</span></Row>}
      {s(setup.rod)  && <Row icon="🎣" label="Rod"><span style={{ color: '#e8e6df' }}>{s(setup.rod)}</span></Row>}
      {s(setup.pet_name) && (
        <Row icon="🐾" label="Pet">
          <div><strong style={{ color: '#e8e6df' }}>{s(setup.pet_name)}</strong><Tag text={'L' + (n(setup.pet_level) || 100)} color="#1baf7a" /><Tag text={(s(setup.pet_rarity) || 'LEG').slice(0,3)} color="#9b59b6" /></div>
          {s(setup.pet_bonus) && <div style={{ fontSize: 10, color: '#1baf7a', marginTop: 2 }}>{s(setup.pet_bonus)}</div>}
          {s(setup.pet_alt)   && <div style={{ fontSize: 10, color: '#4a4a45', marginTop: 1 }}>Alt: {s(setup.pet_alt)}</div>}
        </Row>
      )}
      {(a(setup.accessories).length > 0 || s(setup.power_stone) || n(setup.mp_target)) && (
        <Row icon="💍" label="Access.">
          <div style={{ marginBottom: 4 }}><Tag text={'MP ' + (n(setup.mp_target) || 900) + '+'} color="#c9a84c" />{s(setup.power_stone) && <Tag text={s(setup.power_stone)} color="#9b59b6" />}</div>
          {a(setup.accessories).length > 0 && <div>{a(setup.accessories).map((x, i) => <Tag key={i} text={x} />)}</div>}
        </Row>
      )}
      {(enchWeapon.length > 0 || enchArmor.length > 0 || enchTool.length > 0 || enchRod.length > 0) && (
        <Row icon="✨" label="Enchants">
          {enchWeapon.length > 0 && <div style={{ marginBottom: 3 }}><span style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginRight: 4 }}>Weapon:</span>{enchWeapon.map((e, i) => <Tag key={i} text={e} color="#2a78d6" />)}</div>}
          {enchArmor.length  > 0 && <div style={{ marginBottom: 3 }}><span style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginRight: 4 }}>Armor:</span>{enchArmor.map((e, i) => <Tag key={i} text={e} color="#2a78d6" />)}</div>}
          {enchTool.length   > 0 && <div style={{ marginBottom: 3 }}><span style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginRight: 4 }}>Drill:</span>{enchTool.map((e, i) => <Tag key={i} text={e} color="#2a78d6" />)}</div>}
          {enchRod.length    > 0 && <div><span style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginRight: 4 }}>Rod:</span>{enchRod.map((e, i) => <Tag key={i} text={e} color="#2a78d6" />)}</div>}
        </Row>
      )}
      {s(setup.gemstones)    && <Row icon="💎" label="Gems"><span style={{ color: '#e8e6df' }}>{s(setup.gemstones)}</span></Row>}
      {s(setup.reforges)     && <Row icon="🔮" label="Reforges"><span style={{ color: '#e8e6df' }}>{s(setup.reforges)}</span></Row>}
      {s(setup.target_stats) && <Row icon="🎯" label="Stats"><span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#1baf7a', fontWeight: 700 }}>{s(setup.target_stats)}</span></Row>}
      {s(setup.requirements) && <Row icon="📋" label="Reqs"><span style={{ color: '#9b9b8f' }}>{s(setup.requirements)}</span></Row>}
      {(s(setup.cost_budget) || s(setup.cost_optimal) || s(setup.cost_endgame)) && (
        <Row icon="💰" label="Cost">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {s(setup.cost_budget)  && <div><Tag text="Budget"  color="#1baf7a" /><span style={{ fontSize: 10, color: '#9b9b8f' }}>{s(setup.cost_budget)}</span></div>}
            {s(setup.cost_optimal) && <div><Tag text="Optimal" color="#c9a84c" /><span style={{ fontSize: 10, color: '#9b9b8f' }}>{s(setup.cost_optimal)}</span></div>}
            {s(setup.cost_endgame) && <div><Tag text="BiS"     color="#9b59b6" /><span style={{ fontSize: 10, color: '#9b9b8f' }}>{s(setup.cost_endgame)}</span></div>}
          </div>
        </Row>
      )}
      {s(setup.location)    && <Row icon="🗺️" label="Location"><span style={{ color: '#e8e6df' }}>{s(setup.location)}</span></Row>}
      {s(setup.strategy)    && <Row icon="👹" label="Strategy"><span style={{ color: '#e8e6df', lineHeight: 1.6 }}>{s(setup.strategy)}</span></Row>}
      {s(setup.team_config) && <Row icon="🏰" label="Team"><span style={{ color: '#e8e6df', lineHeight: 1.6 }}>{s(setup.team_config)}</span></Row>}
      {s(setup.hotm_perks)  && <Row icon="⛏️" label="HotM"><span style={{ color: '#e8e6df' }}>{s(setup.hotm_perks)}</span></Row>}
    </div>
  )
}

// ─── Vote Modal ───────────────────────────────────────────────
function VoteModal({
  method, tier, onClose, onVoted
}: {
  method: AnyMethod; tier: string
  onClose: () => void
  onVoted: (vote: 'works' | 'doesnt_work', comment: string) => void
}) {
  const [vote,    setVote]    = useState<'works' | 'doesnt_work' | null>(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!vote) return
    setLoading(true)
    try {
      await fetch('/api/method/vote', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ method_id: methodKey(method), tier, vote, comment: comment.trim() || null })
      })
      onVoted(vote, comment)
    } catch {}
    setLoading(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(6px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0f0f0e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '22px', maxWidth: 400, width: '100%' }}>
        <div style={{ fontSize: 9, color: '#c9a84c', fontFamily: 'Space Mono, monospace', letterSpacing: '0.12em', marginBottom: 8 }}>COMMUNITY FEEDBACK</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e6df', marginBottom: 16, lineHeight: 1.3 }}>
          Did this work for you?
          <div style={{ fontSize: 11, color: '#6b6960', fontWeight: 400, marginTop: 3 }}>{s(method.method)}</div>
        </div>

        {/* Vote buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button onClick={() => setVote('works')} style={{
            flex: 1, padding: '12px', borderRadius: 8, cursor: 'pointer',
            border: `1px solid ${vote === 'works' ? '#1baf7a' : 'rgba(255,255,255,0.08)'}`,
            background: vote === 'works' ? '#1baf7a15' : 'transparent',
            color: vote === 'works' ? '#1baf7a' : '#6b6960',
            fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13, transition: 'all 0.15s'
          }}>
            ✅ Yes, it works!
          </button>
          <button onClick={() => setVote('doesnt_work')} style={{
            flex: 1, padding: '12px', borderRadius: 8, cursor: 'pointer',
            border: `1px solid ${vote === 'doesnt_work' ? '#e34948' : 'rgba(255,255,255,0.08)'}`,
            background: vote === 'doesnt_work' ? '#e3494815' : 'transparent',
            color: vote === 'doesnt_work' ? '#e34948' : '#6b6960',
            fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13, transition: 'all 0.15s'
          }}>
            ❌ Didn't work
          </button>
        </div>

        {/* Commentaire optionnel */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace', marginBottom: 6 }}>
            COMMENT (optional) — helps Vault improve
          </div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={vote === 'doesnt_work'
              ? "What was wrong? (wrong coins/h, gear too expensive, info incorrect...)"
              : "Any tips or additional info for other players?"}
            maxLength={500}
            rows={3}
            style={{
              width: '100%', background: '#111110', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '10px 12px', color: '#e8e6df',
              fontFamily: 'Space Grotesk, sans-serif', fontSize: 11.5, lineHeight: 1.5,
              resize: 'none', outline: 'none', boxSizing: 'border-box'
            }}
          />
          <div style={{ fontSize: 9, color: '#3a3a38', textAlign: 'right', marginTop: 3 }}>{comment.length}/500</div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.07)', background: 'transparent', color: '#4a4a45', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontSize: 12 }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!vote || loading}
            style={{
              flex: 2, padding: '10px', borderRadius: 7, border: 'none',
              background: !vote ? '#1a1a18' : vote === 'works' ? '#1baf7a' : '#e34948',
              color: !vote ? '#3a3a38' : '#fff',
              cursor: !vote ? 'not-allowed' : 'pointer',
              fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 12,
              transition: 'all 0.15s'
            }}
          >
            {loading ? 'Sending...' : 'Submit feedback'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Feedback Badge ───────────────────────────────────────────
function FeedbackBadge({ feedback }: { feedback: FeedbackData | null }) {
  if (!feedback || feedback.total === 0) return null
  const pct   = feedback.approval_pct ?? 0
  const color = pct >= 70 ? '#1baf7a' : pct >= 40 ? '#c9a84c' : '#e34948'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontFamily: 'Space Mono, monospace', color }}>
      <span style={{ color: '#1baf7a' }}>✅{feedback.positive}</span>
      <span style={{ color: '#3a3a38' }}>·</span>
      <span style={{ color: '#e34948' }}>❌{feedback.negative}</span>
      {feedback.approval_pct !== null && <span style={{ color, marginLeft: 2 }}>({pct}%)</span>}
    </div>
  )
}

// ─── Method Card ─────────────────────────────────────────────
function MethodCard({ method, tier, accentColor, type }: {
  method: AnyMethod; tier: string; accentColor: string; type: 'active' | 'vault'
}) {
  const [expanded,    setExpanded]    = useState(false)
  const [setup,       setSetup]       = useState<Setup | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [notReady,    setNotReady]    = useState(false)
  const [showVote,    setShowVote]    = useState(false)
  const [userVote,    setUserVote]    = useState<'works' | 'doesnt_work' | null>(null)
  const [feedback,    setFeedback]    = useState<FeedbackData | null>(null)
  const [feedLoaded,  setFeedLoaded]  = useState(false)

  const key       = methodKey(method)
  const skill     = type === 'active' ? s(method.skill) : a(method.skills_combined).join('+')
  const skillIcon = SKILL_ICONS[s(method.skill)] || SKILL_ICONS[a(method.skills_combined)[0]] || '⚡'
  const confColor = CONF_COLORS[s(method.confidence)] || '#c9a84c'

  // Charge le feedback une fois à l'expansion
  const loadFeedback = useCallback(async () => {
    if (feedLoaded) return
    try {
      const res  = await fetch(`/api/method/vote?method_id=${encodeURIComponent(key)}&tier=${tier}`)
      const data = await res.json()
      setFeedback(data)
    } catch {}
    setFeedLoaded(true)
  }, [key, tier, feedLoaded])

  async function toggle() {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    loadFeedback()
    if (setup || notReady) return
    setLoading(true)
    try {
      const res  = await fetch('/api/setup/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ method, tier })
      })
      const data = await res.json()
      if (data.not_ready || data.error) setNotReady(true)
      else if (data.setup) setSetup(data.setup)
      else setNotReady(true)
    } catch { setNotReady(true) }
    finally   { setLoading(false) }
  }

  function onVoted(vote: 'works' | 'doesnt_work') {
    setUserVote(vote)
    setShowVote(false)
    // Optimistic update
    setFeedback(prev => prev ? {
      ...prev,
      positive: vote === 'works'        ? prev.positive + 1 : prev.positive,
      negative: vote === 'doesnt_work'  ? prev.negative + 1 : prev.negative,
      total:    prev.total + 1,
      approval_pct: Math.round((vote === 'works' ? prev.positive + 1 : prev.positive) / (prev.total + 1) * 100)
    } : { positive: vote === 'works' ? 1 : 0, negative: vote === 'doesnt_work' ? 1 : 0, total: 1, approval_pct: vote === 'works' ? 100 : 0 })
  }

  return (
    <>
      <div style={{ marginBottom: 8 }}>
        {/* Header */}
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
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#e8e6df', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s(method.method)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 1 }}>
                {skill && <span style={{ fontSize: 9, color: accentColor + 'bb', fontFamily: 'Space Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{skill.replace(/_/g, ' ')}</span>}
                {feedback && <FeedbackBadge feedback={feedback} />}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: accentColor, fontFamily: 'Space Mono, monospace' }}>{s(method.coins_display)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 7.5, color: confColor, background: confColor + '13', border: '1px solid ' + confColor + '20', padding: '1px 5px', borderRadius: 3, fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>
                  {s(method.confidence) || 'MED'}
                </span>
                <span style={{ fontSize: 13, color: accentColor, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>›</span>
              </div>
            </div>
          </div>
          {!expanded && (s(method.why_best) || s(method.the_edge)) && (
            <div style={{ marginTop: 5, paddingLeft: 39, fontSize: 10, color: '#4a4a45', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
              {s(method.why_best) || s(method.the_edge)}
            </div>
          )}
        </div>

        {/* Accordion */}
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

            {/* Zone feedback */}
            <div style={{ padding: '12px 14px', background: '#0d0d0c', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                {feedback && feedback.total > 0 ? (
                  <div style={{ fontSize: 10, color: '#6b6960', fontFamily: 'Space Mono, monospace' }}>
                    <span style={{ color: '#1baf7a' }}>✅ {feedback.positive}</span>
                    {' · '}
                    <span style={{ color: '#e34948' }}>❌ {feedback.negative}</span>
                    {' · '}
                    <span>{feedback.total} players rated this</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: '#3a3a38', fontFamily: 'Space Mono, monospace' }}>No feedback yet — be the first!</div>
                )}
              </div>

              {userVote ? (
                <div style={{ fontSize: 10, color: userVote === 'works' ? '#1baf7a' : '#e34948', fontFamily: 'Space Mono, monospace' }}>
                  {userVote === 'works' ? '✅ You voted: works' : '❌ You voted: issue'}
                </div>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setShowVote(true) }}
                  style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.2)', background: 'rgba(201,168,76,0.06)', color: '#c9a84c', fontSize: 10, fontFamily: 'Space Mono, monospace', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 }}
                >
                  Rate this method
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showVote && (
        <VoteModal
          method={method}
          tier={tier}
          onClose={() => setShowVote(false)}
          onVoted={onVoted}
        />
      )}
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function MoneyMakingSection({ marketData, dataLoading }: {
  marketData: Record<string, string>; dataLoading: boolean
}) {
  const [mmTier, setMmTier] = useState('early')
  const tier = TIERS.find(t => t.key === mmTier) || TIERS[0]

  let active: AnyMethod[] = []
  let vault:  AnyMethod[] = []
  let summary = ''
  try {
    const raw = marketData['money_making_' + mmTier] || ''
    if (raw) {
      const parsed = JSON.parse(raw)
      active  = Array.isArray(parsed.active) ? parsed.active : []
      vault   = Array.isArray(parsed.vault)  ? parsed.vault  : []
      summary = typeof parsed.comparison_summary === 'string' ? parsed.comparison_summary : ''
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

      {/* Banner + comparison summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: summary ? 8 : 14, padding: '8px 13px', background: tier.color + '07', border: '1px solid ' + tier.color + '15', borderRadius: 7 }}>
        <span style={{ fontSize: 16 }}>{tier.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: tier.color, fontFamily: 'Space Mono, monospace' }}>TARGET {tier.target} minimum</div>
          <div style={{ fontSize: 9.5, color: '#3a3a38', marginTop: 1 }}>Click any method → full gear setup + community feedback</div>
        </div>
        <div style={{ fontSize: 8.5, fontFamily: 'Space Mono, monospace', color: '#3a3a38', padding: '2px 7px', background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>Weekly AI</div>
      </div>

      {summary && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#111110', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 7 }}>
          <div style={{ fontSize: 9, color: '#4a4a45', fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em', marginBottom: 4 }}>THIS WEEK'S ANALYSIS</div>
          <div style={{ fontSize: 11, color: '#9b9b8f', lineHeight: 1.6 }}>{summary}</div>
        </div>
      )}

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
              <MethodCard key={mmTier + '_a_' + (s(m.id) || i)} method={m} tier={mmTier} accentColor={tier.color} type="active" />
            ))}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 13 }}>⚡</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: '#9b59b6', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Vault Exclusive</span>
            </div>
            {vault.slice(0, 3).map((m, i) => (
              <MethodCard key={mmTier + '_v_' + (s(m.id) || i)} method={m} tier={mmTier} accentColor="#9b59b6" type="vault" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}