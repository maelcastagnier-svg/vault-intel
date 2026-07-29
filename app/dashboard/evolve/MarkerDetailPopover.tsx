// app/dashboard/evolve/MarkerDetailPopover.tsx
// Click-triggered detail panel for one bucket's real tasks -- same info the
// old vertical TaskRow showed, just reached via the route instead of a
// scrolled list. Positioned near the clicked marker, clamped to viewport.
'use client'
import { useEffect, useRef } from 'react'
import type { MilestoneBucket } from '../../../lib/milestone-buckets'

export default function MarkerDetailPopover({ bucket, x, y, accent, onClose }: {
  bucket: MilestoneBucket
  x: number
  y: number
  accent: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onClose])

  const width = 260
  const left = Math.min(Math.max(x - width / 2, 12), (typeof window !== 'undefined' ? window.innerWidth : 1200) - width - 12)

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', left, top: y + 16, width, zIndex: 600,
        background: '#111110', border: `1px solid ${accent}55`, borderRadius: 8,
        boxShadow: `0 10px 30px rgba(0,0,0,0.6), 0 0 14px ${accent}20`, padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: accent, fontFamily: "'Press Start 2P', monospace", letterSpacing: '0.03em' }}>
          {bucket.tasks.length} TASK{bucket.tasks.length > 1 ? 'S' : ''}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b6960', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>
      </div>

      {bucket.tasks.map((task, i) => (
        <div key={i} style={{
          padding: '6px 8px', borderRadius: 6, marginBottom: 4,
          background: task.met ? 'rgba(27,175,122,0.06)' : '#0d0d0c',
          border: `0.5px solid ${task.met ? 'rgba(27,175,122,0.25)' : `${accent}15`}`,
        }}>
          <div style={{ fontSize: 11.5, color: task.met ? '#1baf7a' : '#e8e6df', marginBottom: task.data_available ? 2 : 0 }}>
            {task.met ? '✓ ' : ''}{task.label}
          </div>
          {task.data_available ? (
            <div style={{ fontSize: 10, fontFamily: 'Space Mono, monospace', color: task.met ? '#1baf7a' : '#9b9b8f' }}>
              {task.current}/{task.target}
            </div>
          ) : (
            <div style={{ fontSize: 9.5, color: '#4a4a45', fontStyle: 'italic' }}>Not trackable yet</div>
          )}
        </div>
      ))}
    </div>
  )
}
