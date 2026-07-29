// app/dashboard/evolve/TierPath.tsx
// Lays out one tier's 100 buckets in a row along a connecting rail.
'use client'
import PathMarker from './PathMarker'
import { bucketizeTier, type MilestoneBucket } from '../../../lib/milestone-buckets'
import type { MilestoneTier } from './types'

export default function TierPath({ tier, accent, onSelectBucket }: {
  tier: MilestoneTier
  accent: string
  onSelectBucket: (bucket: MilestoneBucket, x: number, y: number) => void
}) {
  const buckets = bucketizeTier(tier)

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, padding: '40px 24px' }}>
      <div style={{ position: 'absolute', left: 24, right: 24, top: '50%', height: 2, background: `${accent}25`, zIndex: 0 }} />
      {buckets.map(bucket => (
        <div key={bucket.index} style={{ position: 'relative', zIndex: 1 }}>
          <PathMarker bucket={bucket} accent={accent} onClick={(x, y) => onSelectBucket(bucket, x, y)} />
        </div>
      ))}
    </div>
  )
}
