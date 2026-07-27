'use client'
import { SkillState, SkillTarget, TargetType } from './types'

const TARGET_STYLE: Record<TargetType, { label: string; color: string; bg: string }> = {
  free_swap:     { label: '✓ FREE SWAP — already owned', color: '#1baf7a', bg: 'rgba(27,175,122,0.08)' },
  upgrade:       { label: '↑ UPGRADE — purchase needed', color: '#c9a84c', bg: 'rgba(201,168,76,0.08)' },
  unlock_access: { label: '🔓 UNLOCK — not started yet', color: '#9b59b6', bg: 'rgba(155,89,182,0.08)' },
}

const CONFIDENCE_COLOR: Record<string, string> = { HIGH: '#1baf7a', MED: '#c9a84c', LOW: '#6b6960' }

function fmtCoins(n: number): string {
  if (!n) return '0'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}

function CurrentPanel({ state }: { state: SkillState }) {
  return (
    <div style={{ background: '#0d0d0c', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 9.5, color: '#6b6960', fontFamily: 'Space Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        Current
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e6df', marginBottom: 4 }}>{state.coins_display || '—'}</div>
      {state.method && <div style={{ fontSize: 12, color: '#9b9b8f', marginBottom: 6 }}>{state.method}</div>}
      {state.setup_items.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 11.5, color: '#9b9b8f' }}>
          {state.setup_items.map((item, i) => <li key={i} style={{ marginBottom: 2 }}>{item}</li>)}
        </ul>
      )}
      <span style={{
        display: 'inline-block', marginTop: 8, fontSize: 9, fontFamily: 'Space Mono, monospace',
        color: CONFIDENCE_COLOR[state.confidence] || '#6b6960', border: `1px solid ${CONFIDENCE_COLOR[state.confidence] || '#6b6960'}40`,
        borderRadius: 4, padding: '1px 6px',
      }}>
        {state.confidence} CONFIDENCE
      </span>
    </div>
  )
}

function TargetPanel({ target }: { target: SkillTarget }) {
  const style = TARGET_STYLE[target.type] || TARGET_STYLE.upgrade
  return (
    <div style={{ background: style.bg, border: `1px solid ${style.color}45`, boxShadow: `0 0 16px ${style.color}15`, borderRadius: 8, padding: '12px 14px' }}>
      <span style={{
        display: 'inline-block', fontSize: 10, fontFamily: 'Space Mono, monospace', fontWeight: 700,
        color: style.color, marginBottom: 6,
      }}>
        {style.label}
      </span>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#e8e6df', marginBottom: 4 }}>{target.goal}</div>
      {target.requirements.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 11.5, color: '#9b9b8f' }}>
          {target.requirements.map((r, i) => <li key={i} style={{ marginBottom: 2 }}>{r}</li>)}
        </ul>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', color: style.color, fontWeight: 700 }}>
          {target.budget_estimate > 0 ? fmtCoins(target.budget_estimate) + ' coins' : 'Free'}
        </span>
        {target.expected_coins_display && (
          <span style={{ fontSize: 11, color: '#9b9b8f' }}>→ {target.expected_coins_display}</span>
        )}
      </div>
      {target.reasoning && (
        <div style={{ fontSize: 11, color: '#6b6960', marginTop: 6, fontStyle: 'italic', lineHeight: 1.5 }}>{target.reasoning}</div>
      )}
    </div>
  )
}

export default function SkillCard({
  label, icon, current, target, unlocked,
}: {
  label: string
  icon?: string
  current: SkillState
  target: SkillTarget
  unlocked?: boolean
}) {
  return (
    <div style={{ background: '#111110', border: '1px solid rgba(201,168,76,0.25)', boxShadow: '0 0 16px rgba(201,168,76,0.06)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#e8e6df', fontFamily: "'Press Start 2P', monospace", letterSpacing: '0.02em' }}>{icon ? `${icon} ` : ''}{label}</span>
        {unlocked === false && (
          <span style={{ fontSize: 9, fontFamily: 'Space Mono, monospace', color: '#6b6960', border: '1px solid rgba(107,105,96,0.4)', borderRadius: 4, padding: '1px 6px' }}>
            NOT STARTED
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <CurrentPanel state={current} />
        <TargetPanel target={target} />
      </div>
    </div>
  )
}
