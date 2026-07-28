// app/dashboard/evolve/SkillBar.tsx
// Horizontal XP bar for one of the 8 non-Slayer/non-Dungeoneering-accordion
// skill cards. Replaces the old full CurrentPanel/TargetPanel SkillCard for
// these 8 -- click opens SkillProgressOverlay instead of showing the two
// panels inline. Slayer keeps its existing SkillCard-based accordion
// untouched (see SkillsTab.tsx), converting it is a separate future pass.
'use client'
import type { SkillProgress } from './types'

const ACCENT = '#c9a84c'

function fmtXp(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

export default function SkillBar({ label, icon, progress, unlocked, onClick }: {
  label: string
  icon?: string
  progress?: SkillProgress
  unlocked?: boolean
  onClick: () => void
}) {
  const locked = unlocked === false
  // Dungeoneering has no comparable XP-to-level curve captured in player_data
  // (see lib/skill-xp.ts) -- render an honest "no numeric progress" state
  // rather than fabricate a level or a fill percentage.
  const hasProgress = !!progress
  const maxLevel = hasProgress && progress!.xpForNextLevel === null
  const fillPct = hasProgress && !maxLevel
    ? Math.min(100, (progress!.xpIntoLevel / (progress!.xpForNextLevel as number)) * 100)
    : maxLevel ? 100 : 0

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        background: '#111110', border: `1px solid rgba(201,168,76,${locked ? 0.12 : 0.25})`,
        borderRadius: 8, padding: '10px 14px', marginBottom: 8, cursor: 'pointer',
        textAlign: 'left', opacity: locked ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: 'center' }}>{icon}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#e8e6df', fontFamily: "'Press Start 2P', monospace", letterSpacing: '0.02em' }}>
            {label}
          </span>
          {locked ? (
            <span style={{ fontSize: 9, fontFamily: 'Space Mono, monospace', color: '#6b6960' }}>NOT STARTED</span>
          ) : hasProgress ? (
            <span style={{ fontSize: 9.5, fontFamily: 'Space Mono, monospace', color: ACCENT }}>
              Lv {progress!.level}{maxLevel ? ' · MAX' : ''}
            </span>
          ) : (
            <span style={{ fontSize: 9, fontFamily: 'Space Mono, monospace', color: '#6b6960' }}>tap for details</span>
          )}
        </div>

        <div style={{ position: 'relative', height: 6, borderRadius: 3, background: '#0a0a09', border: '1px solid rgba(201,168,76,0.1)', overflow: 'hidden' }}>
          {hasProgress ? (
            <div style={{ position: 'absolute', inset: 0, width: `${fillPct}%`, background: `linear-gradient(90deg, ${ACCENT}80, ${ACCENT})`, borderRadius: 3 }} />
          ) : (
            // Indeterminate striped fill -- signals "no numeric data" rather
            // than a fake 0% or 100%.
            <div style={{
              position: 'absolute', inset: 0,
              background: `repeating-linear-gradient(45deg, rgba(201,168,76,0.15) 0 6px, transparent 6px 12px)`,
            }} />
          )}
        </div>

        {hasProgress && !maxLevel && (
          <div style={{ fontSize: 8.5, fontFamily: 'Space Mono, monospace', color: '#4a4a45', marginTop: 3, textAlign: 'right' }}>
            {fmtXp(progress!.xpIntoLevel)} / {fmtXp(progress!.xpForNextLevel as number)} XP
          </div>
        )}
      </div>
    </button>
  )
}
