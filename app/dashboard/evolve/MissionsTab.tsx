'use client'
import { useState, useEffect } from 'react'
import { MissionsResponse, MissionRow } from './types'

const ACTIVITY_ICONS: Record<string, string> = {
  SKILL: '📊', COLLECTION: '📦', FAIRY_SOULS: '🧚', OTHER: '🎯',
}

function MissionCard({ mission }: { mission: MissionRow }) {
  const pct = mission.progress_target > 0 ? Math.min(100, Math.round((mission.progress / mission.progress_target) * 100)) : 0
  return (
    <div style={{ background: '#111110', border: '1px solid rgba(201,168,76,0.25)', boxShadow: '0 0 14px rgba(201,168,76,0.06)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e6df' }}>
          {ACTIVITY_ICONS[mission.activity] || '🎯'} {mission.title}
        </div>
        <span style={{
          fontSize: 9, fontFamily: 'Space Mono, monospace', color: '#6b6960',
          border: '1px solid rgba(107,105,96,0.4)', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap',
        }}>
          {mission.difficulty}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: '#9b9b8f', marginBottom: 8 }}>{mission.description}</div>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(201,168,76,0.12)', borderRadius: 8, height: 8, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #c9a84c, #1baf7a)', boxShadow: '0 0 10px rgba(27,175,122,0.5)', transition: 'width 0.4s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'Space Mono, monospace', color: '#9b9b8f' }}>
        <span>{mission.progress}/{mission.progress_target} {mission.progress_unit}</span>
        {mission.carried_over && <span style={{ color: '#c9a84c' }}>carried over from yesterday</span>}
      </div>
    </div>
  )
}

export default function MissionsTab({ profileId }: { profileId: string }) {
  const [data, setData] = useState<MissionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/player/missions?profile_id=${profileId}`)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) { setError(json.error || 'Failed to load Daily Missions'); setData(null) }
        else setData(json)
      } catch {
        if (!cancelled) setError('Connection failed')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [profileId])

  if (loading) return <div style={{ color: '#6b6960', fontSize: 12, padding: '2rem', textAlign: 'center', fontFamily: 'Space Mono, monospace' }}>Loading Daily Missions...</div>
  if (error) return <div style={{ color: '#6b6960', fontSize: 12.5, padding: '2rem', textAlign: 'center' }}>⚠️ {error}</div>
  if (!data) return null

  return (
    <div>
      <div className="section-label" style={{ color: '#1baf7a' }}>✅ Today's missions — picked from your current Milestones tier</div>
      {data.missions.length > 0 ? (
        data.missions.map(m => <MissionCard key={m.mission_id} mission={m} />)
      ) : (
        <div style={{ fontSize: 12.5, color: '#6b6960', padding: '1rem 0' }}>
          {data.message || 'No missions available right now.'}
        </div>
      )}
    </div>
  )
}
