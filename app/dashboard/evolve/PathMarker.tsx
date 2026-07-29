// app/dashboard/evolve/PathMarker.tsx
// One bucket on the horizontal route. Size is fixed by position (big every
// 10 buckets, medium every 5, small otherwise) -- identical for every
// player. Fill/color is the only thing that reflects THIS player's real
// progress (state comes from lib/milestone-buckets.ts, computed from real
// task.met values, nothing invented).
'use client'
import type { MilestoneBucket } from '../../../lib/milestone-buckets'

const SIZE_PX: Record<MilestoneBucket['sizeClass'], number> = { big: 26, medium: 15, small: 8 }

const STATE_STYLE: Record<MilestoneBucket['state'], { fill: string; border: string; glow: string }> = {
  complete:     { fill: '#1baf7a', border: '#1baf7a', glow: '0 0 8px rgba(27,175,122,0.6)' },
  partial:      { fill: 'transparent', border: '#c9a84c', glow: '0 0 6px rgba(201,168,76,0.35)' },
  not_started:  { fill: 'transparent', border: 'rgba(201,168,76,0.35)', glow: 'none' },
  untrackable:  { fill: 'transparent', border: 'rgba(107,105,96,0.35)', glow: 'none' },
  no_tasks:     { fill: 'transparent', border: 'rgba(107,105,96,0.12)', glow: 'none' },
}

export default function PathMarker({ bucket, accent, onClick }: {
  bucket: MilestoneBucket
  accent: string
  onClick: (x: number, y: number) => void
}) {
  const size = SIZE_PX[bucket.sizeClass]
  const style = STATE_STYLE[bucket.state]
  const clickable = bucket.tasks.length > 0
  const isPartial = bucket.state === 'partial'

  return (
    <button
      onClick={clickable ? e => {
        const rect = e.currentTarget.getBoundingClientRect()
        onClick(rect.left + rect.width / 2, rect.top)
      } : undefined}
      disabled={!clickable}
      title={clickable ? `${bucket.tasks.length} task${bucket.tasks.length > 1 ? 's' : ''}` : undefined}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: bucket.state === 'complete' ? style.fill : (bucket.sizeClass !== 'small' ? '#0a0a09' : 'transparent'),
        border: `${bucket.sizeClass === 'big' ? 2 : 1.5}px solid ${style.border}`,
        boxShadow: style.glow,
        cursor: clickable ? 'pointer' : 'default',
        padding: 0, position: 'relative',
      }}
    >
      {isPartial && (
        <span style={{
          position: 'absolute', inset: 2, borderRadius: '50%',
          background: `conic-gradient(${accent} ${partialFraction(bucket) * 360}deg, transparent 0deg)`,
        }} />
      )}
    </button>
  )
}

function partialFraction(bucket: MilestoneBucket): number {
  const trackable = bucket.tasks.filter(t => t.data_available)
  if (trackable.length === 0) return 0
  return trackable.filter(t => t.met).length / trackable.length
}
