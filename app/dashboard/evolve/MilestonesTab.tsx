'use client'
import { useState, useEffect } from 'react'
import MilestoneRoute from './MilestoneRoute'
import { MilestonesResponse } from './types'

export default function MilestonesTab({ profileId }: { profileId: string }) {
  const [data, setData] = useState<MilestonesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/player/milestones?profile_id=${profileId}`)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) { setError(json.error || 'Failed to load Milestones'); setData(null) }
        else setData(json)
      } catch {
        if (!cancelled) setError('Connection failed')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [profileId])

  if (loading) return <div style={{ color: '#6b6960', fontSize: 12, padding: '2rem', textAlign: 'center', fontFamily: 'Space Mono, monospace' }}>Loading Milestones...</div>
  if (error) return <div style={{ color: '#6b6960', fontSize: 12.5, padding: '2rem', textAlign: 'center' }}>⚠️ {error}</div>
  if (!data) return null

  return (
    <div>
      <div className="section-label" style={{ color: '#c9a84c' }}>🗺️ Milestones — the 7-tier completion guide</div>
      <MilestoneRoute tiers={data.tiers} />
    </div>
  )
}
