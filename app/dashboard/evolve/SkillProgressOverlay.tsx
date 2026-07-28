// app/dashboard/evolve/SkillProgressOverlay.tsx
// Full-screen overlay opened by clicking a SkillBar: left = current setup
// (character + text, possibly bare skin if nothing is equipped for this
// skill), right = target setup (character + text). Same panel discipline as
// components/SetupOverlay.tsx -- blur/dim kept as a separate sibling layer,
// box-shadow not filter:drop-shadow, scroll scoped to the text sub-columns
// only -- all three exist because overflow/filter != default on an ancestor
// of SkinArmorRender's <Canvas> silently flattens the 3D render (see that
// component's own history for how this was found).
'use client'
import SetupCharacterPanel from './SetupCharacterPanel'
import { TARGET_TYPE_STYLE, CONFIDENCE_COLOR, fmtCoins } from './skill-display'
import type { SkillState, SkillTarget } from './types'

export default function SkillProgressOverlay({ label, icon, current, target, skinUrls, onClose }: {
  label: string
  icon?: string
  current: SkillState
  target: SkillTarget
  skinUrls: string[]
  onClose: () => void
}) {
  const accentColor = '#c9a84c'
  const targetStyle = TARGET_TYPE_STYLE[target.type] || TARGET_TYPE_STYLE.upgrade

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)' }} />
      <div onClick={onClose} style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
        <div
          onClick={e => e.stopPropagation()}
          className="vault-surface"
          style={{
            border: `1px solid ${accentColor}45`,
            boxShadow: `0 40px 90px rgba(0,0,0,0.85), 0 0 40px ${accentColor}20`,
            borderRadius: 14, maxWidth: 860, width: '100%',
          }}
        >
          {/* Header */}
          <div style={{ padding: '20px 26px 16px', borderBottom: `1px solid ${accentColor}20`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#e8e6df' }}>{icon ? `${icon} ` : ''}{label}</div>
            <button onClick={onClose} style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', color: '#9b9b8f', cursor: 'pointer', borderRadius: 8, padding: '6px 11px', fontSize: 14, flexShrink: 0 }}>✕</button>
          </div>

          {/* Body — 2 columns: current | target */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {/* LEFT — current */}
            <div style={{ padding: '22px 22px', borderRight: `1px solid ${accentColor}18` }}>
              <SetupCharacterPanel
                label="CURRENT"
                setup={current.render_setup}
                skinUrls={skinUrls}
                accentColor={accentColor}
                emptyMessage="Aucun équipement pour ce skill actuellement"
              />
              <div style={{ marginTop: 16, background: '#0d0d0c', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e6df', marginBottom: 4 }}>{current.coins_display || '—'}</div>
                {current.method && <div style={{ fontSize: 12, color: '#9b9b8f', marginBottom: 6 }}>{current.method}</div>}
                {current.setup_items.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 11.5, color: '#9b9b8f' }}>
                    {current.setup_items.map((item, i) => <li key={i} style={{ marginBottom: 2 }}>{item}</li>)}
                  </ul>
                )}
                <span style={{
                  display: 'inline-block', marginTop: 8, fontSize: 9, fontFamily: 'Space Mono, monospace',
                  color: CONFIDENCE_COLOR[current.confidence] || '#6b6960',
                  border: `1px solid ${CONFIDENCE_COLOR[current.confidence] || '#6b6960'}40`,
                  borderRadius: 4, padding: '1px 6px',
                }}>
                  {current.confidence} CONFIDENCE
                </span>
              </div>
            </div>

            {/* RIGHT — target */}
            <div style={{ padding: '22px 22px' }}>
              <SetupCharacterPanel
                label="TARGET"
                setup={target.render_setup}
                skinUrls={skinUrls}
                accentColor={accentColor}
                emptyMessage="Aucun équipement précis pour cet objectif"
              />
              <div style={{ marginTop: 16, background: targetStyle.bg, border: `1px solid ${targetStyle.color}45`, boxShadow: `0 0 16px ${targetStyle.color}15`, borderRadius: 8, padding: '12px 14px' }}>
                <span style={{ display: 'inline-block', fontSize: 10, fontFamily: 'Space Mono, monospace', fontWeight: 700, color: targetStyle.color, marginBottom: 6 }}>
                  {targetStyle.label}
                </span>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#e8e6df', marginBottom: 4 }}>{target.goal}</div>
                {target.gear_name && (
                  <div style={{ fontSize: 11.5, color: '#9b9b8f', marginBottom: 4 }}>
                    <span style={{ color: targetStyle.color, fontWeight: 700 }}>Gear: </span>{target.gear_name}
                  </div>
                )}
                {target.requirements.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 11.5, color: '#9b9b8f' }}>
                    {target.requirements.map((r, i) => <li key={i} style={{ marginBottom: 2 }}>{r}</li>)}
                  </ul>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', color: targetStyle.color, fontWeight: 700 }}>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
