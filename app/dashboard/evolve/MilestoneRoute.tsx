// app/dashboard/evolve/MilestoneRoute.tsx
// Horizontal scroll container: 7 TierZone side by side, scroll-snap, a nav
// strip to jump directly to a tier, and the single MarkerDetailPopover
// shared across every zone (only one open at a time).
'use client'
import { useEffect, useRef, useState } from 'react'
import TierZone from './TierZone'
import MilestoneNav from './MilestoneNav'
import MarkerDetailPopover from './MarkerDetailPopover'
import { TIER_THEME, DEFAULT_THEME } from './milestone-theme'
import type { MilestoneTier } from './types'
import type { MilestoneBucket } from '../../../lib/milestone-buckets'

type Selection = { tier: string; bucket: MilestoneBucket; x: number; y: number }

export default function MilestoneRoute({ tiers }: { tiers: MilestoneTier[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeTier, setActiveTier] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)

  // Auto-scroll to the player's current tier on load -- same rule Daily
  // Missions/the old accordion already used: first tier with at least one
  // computable, incomplete task.
  useEffect(() => {
    const current = tiers.find(t => t.tasks_computable > 0 && t.tasks_completed < t.tasks_computable)
    const target = current || tiers[0]
    if (!target) return
    setActiveTier(target.tier)
    const el = scrollRef.current?.querySelector(`[data-tier="${target.tier}"]`)
    el?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, inline: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleScroll() {
    const container = scrollRef.current
    if (!container) return
    const containerCenter = container.getBoundingClientRect().left + container.clientWidth / 2
    let closest: string | null = null
    let closestDist = Infinity
    for (const zone of Array.from(container.querySelectorAll<HTMLElement>('[data-tier]'))) {
      const rect = zone.getBoundingClientRect()
      const dist = Math.abs(rect.left + rect.width / 2 - containerCenter)
      if (dist < closestDist) { closestDist = dist; closest = zone.dataset.tier || null }
    }
    if (closest) setActiveTier(closest)
  }

  function navigateTo(tierKey: string) {
    const el = scrollRef.current?.querySelector(`[data-tier="${tierKey}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'start' })
  }

  const selectedTheme = selection ? (TIER_THEME[selection.tier] || DEFAULT_THEME) : null

  return (
    <div>
      <MilestoneNav tiers={tiers} activeTier={activeTier} onNavigate={navigateTo} />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          display: 'flex', overflowX: 'auto', overflowY: 'hidden',
          scrollSnapType: 'x proximity', borderRadius: 10,
          border: '1px solid rgba(201,168,76,0.15)',
        }}
      >
        {tiers.map(tier => (
          <TierZone
            key={tier.tier}
            tier={tier}
            onSelectBucket={(bucket, x, y) => setSelection({ tier: tier.tier, bucket, x, y })}
          />
        ))}
      </div>

      {selection && selectedTheme && (
        <MarkerDetailPopover
          bucket={selection.bucket}
          x={selection.x}
          y={selection.y}
          accent={selectedTheme.accent}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  )
}
