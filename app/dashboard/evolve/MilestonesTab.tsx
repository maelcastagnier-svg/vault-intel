'use client'
import { useState, useEffect } from 'react'
import { MilestonesResponse, MilestoneTier, EvaluatedTask } from './types'

function TaskRow({ task }: { task: EvaluatedTask }) {
  if (!task.data_available) return null // les non-trackables sont resumees, pas listees une par une
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 10px', borderRadius: 6, background: task.met ? 'rgba(27,175,122,0.06)' : '#0d0d0c',
      border: `0.5px solid ${task.met ? 'rgba(27,175,122,0.2)' : 'rgba(201,168,76,0.05)'}`, marginBottom: 4,
    }}>
      <span style={{ fontSize: 12, color: task.met ? '#1baf7a' : '#e8e6df' }}>
        {task.met ? '✓ ' : ''}{task.label}
      </span>
      <span style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', color: task.met ? '#1baf7a' : '#9b9b8f' }}>
        {task.current}/{task.target}
      </span>
    </div>
  )
}

function TierPanel({ tier }: { tier: MilestoneTier }) {
  const allTasks = [...tier.wiki_tasks, ...tier.vault_tasks]
  const computableTasks = allTasks.filter(t => t.data_available)
  const uncomputableCount = allTasks.length - computableTasks.length
  const pct = tier.tasks_computable > 0 ? Math.round((tier.tasks_completed / tier.tasks_computable) * 100) : 0
  const incomplete = tier.tasks_announced != null && tier.tasks_known < tier.tasks_announced

  return (
    <div>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, height: 8, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #c9a84c, #1baf7a)', boxShadow: '0 0 10px rgba(27,175,122,0.5)', transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontSize: 11.5, color: '#9b9b8f', marginBottom: 12 }}>
        {tier.tasks_completed}/{tier.tasks_computable} trackable tasks complete
        {incomplete && (
          <span style={{ marginLeft: 8, color: '#6b6960' }}>
            · {tier.tasks_known} known / ~{tier.tasks_announced} announced by the wiki (source incomplete for this tier)
          </span>
        )}
      </div>

      {computableTasks.length > 0 ? (
        computableTasks.map((t, i) => <TaskRow key={i} task={t} />)
      ) : (
        <div style={{ fontSize: 11.5, color: '#6b6960' }}>No trackable tasks for this tier yet.</div>
      )}

      {uncomputableCount > 0 && (
        <div style={{ fontSize: 11, color: '#6b6960', marginTop: 8, fontStyle: 'italic' }}>
          +{uncomputableCount} more tasks in the full guide (museum, essence, minions, accessories...) not trackable yet — waiting on future data collection.
        </div>
      )}
    </div>
  )
}

export default function MilestonesTab({ profileId }: { profileId: string }) {
  const [data, setData] = useState<MilestonesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedTier, setExpandedTier] = useState<string | null>(null)

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
        else {
          setData(json)
          // Ouvre par defaut le premier tier unlocked pas encore fini (jamais un tier locked)
          const current = json.tiers.find((t: MilestoneTier) => t.unlocked && t.tasks_computable > 0 && t.tasks_completed < t.tasks_computable)
          setExpandedTier((current || json.tiers.find((t: MilestoneTier) => t.unlocked) || json.tiers[0])?.tier || null)
        }
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
      {data.tiers.map((tier, i) => {
        const isOpen = tier.unlocked && expandedTier === tier.tier
        const prevPct = i > 0 ? Math.round(data.tiers[i - 1].completion_pct * 100) : null
        return (
          <div key={tier.tier} style={{ background: '#111110', border: `1px solid rgba(201,168,76,${isOpen?0.4:0.15})`, boxShadow: isOpen?'0 0 20px rgba(201,168,76,0.1)':'none', borderRadius: 10, padding: 14, marginBottom: 10, transition:'all 0.2s', opacity: tier.unlocked ? 1 : 0.5 }}>
            <div
              onClick={() => tier.unlocked && setExpandedTier(isOpen ? null : tier.tier)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: tier.unlocked ? 'pointer' : 'default' }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: '#e8e6df', fontFamily: "'Press Start 2P', monospace", letterSpacing: '0.02em', textShadow: isOpen?'0 0 10px rgba(201,168,76,0.35)':'none' }}>
                {tier.unlocked ? '' : '🔒 '}{tier.tier.toUpperCase()}
              </span>
              <span style={{ fontSize: 11, color: '#6b6960' }}>{tier.unlocked ? (isOpen ? '▲' : '▼') : ''}</span>
            </div>
            {!tier.unlocked && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#6b6960' }}>
                Locked — complete 70% of the previous tier to unlock ({prevPct}% done so far).
              </div>
            )}
            {isOpen && <div style={{ marginTop: 12 }}><TierPanel tier={tier} /></div>}
          </div>
        )
      })}
    </div>
  )
}
