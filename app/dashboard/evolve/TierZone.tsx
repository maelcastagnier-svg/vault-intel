// app/dashboard/evolve/TierZone.tsx
// One themed tier segment of the horizontal route.
'use client'
import TierPath from './TierPath'
import { TIER_THEME, DEFAULT_THEME } from './milestone-theme'
import type { MilestoneTier } from './types'
import type { MilestoneBucket } from '../../../lib/milestone-buckets'

export default function TierZone({ tier, onSelectBucket }: {
  tier: MilestoneTier
  onSelectBucket: (bucket: MilestoneBucket, x: number, y: number) => void
}) {
  const theme = TIER_THEME[tier.tier] || DEFAULT_THEME
  const pct = tier.tasks_computable > 0 ? Math.round((tier.tasks_completed / tier.tasks_computable) * 100) : 0
  const incomplete = tier.tasks_announced != null && tier.tasks_known < tier.tasks_announced

  return (
    <div
      data-tier={tier.tier}
      style={{
        background: theme.bg, borderRight: `1px solid ${theme.accent}20`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        scrollSnapAlign: 'start', flexShrink: 0, minHeight: 320,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>{theme.icon}</div>
        <div style={{
          fontSize: 13, fontWeight: 700, color: theme.accent, fontFamily: "'Press Start 2P', monospace",
          letterSpacing: '0.04em', textShadow: `0 0 12px ${theme.accent}50`,
        }}>
          {tier.tier.toUpperCase()}
        </div>
        <div style={{ fontSize: 11, color: '#9b9b8f', marginTop: 6, fontFamily: 'Space Mono, monospace' }}>
          {tier.tasks_completed}/{tier.tasks_computable} trackable complete ({pct}%)
        </div>
        {incomplete && (
          <div style={{ fontSize: 9.5, color: '#4a4a45', marginTop: 3 }}>
            {tier.tasks_known} known / ~{tier.tasks_announced} announced by the wiki
          </div>
        )}
      </div>

      <TierPath tier={tier} accent={theme.accent} onSelectBucket={onSelectBucket} />
    </div>
  )
}
