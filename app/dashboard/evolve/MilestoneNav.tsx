// app/dashboard/evolve/MilestoneNav.tsx
// Fixed strip of 7 tier pills above the route -- click to smooth-scroll,
// active pill highlighted by whichever zone is currently in view.
'use client'
import { TIER_THEME, DEFAULT_THEME } from './milestone-theme'
import type { MilestoneTier } from './types'

export default function MilestoneNav({ tiers, activeTier, onNavigate }: {
  tiers: MilestoneTier[]
  activeTier: string | null
  onNavigate: (tier: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '0 0 12px', overflowX: 'auto' }}>
      {tiers.map(tier => {
        const theme = TIER_THEME[tier.tier] || DEFAULT_THEME
        const pct = tier.tasks_computable > 0 ? Math.round((tier.tasks_completed / tier.tasks_computable) * 100) : 0
        const isActive = activeTier === tier.tier
        return (
          <button
            key={tier.tier}
            onClick={() => onNavigate(tier.tier)}
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
              background: isActive ? `${theme.accent}18` : 'transparent',
              border: `1px solid ${isActive ? theme.accent + '70' : 'rgba(201,168,76,0.15)'}`,
              boxShadow: isActive ? `0 0 10px ${theme.accent}25` : 'none',
            }}
          >
            <span style={{ fontSize: 13 }}>{theme.icon}</span>
            <span style={{ fontSize: 9, fontFamily: "'Press Start 2P', monospace", color: isActive ? theme.accent : '#9b9b8f', letterSpacing: '0.02em' }}>
              {tier.tier.toUpperCase()}
            </span>
            <span style={{ fontSize: 9.5, fontFamily: 'Space Mono, monospace', color: '#6b6960' }}>{pct}%</span>
          </button>
        )
      })}
    </div>
  )
}
