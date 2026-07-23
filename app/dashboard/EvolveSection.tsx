'use client'
import { useState, useEffect } from 'react'
import LinkPrompt from './evolve/LinkPrompt'
import SkillsTab from './evolve/SkillsTab'
import MilestonesTab from './evolve/MilestonesTab'
import MissionsTab from './evolve/MissionsTab'

type Status = {
  linked: boolean
  hypixel_username?: string | null
  profile_id?: string | null
  last_synced?: string | null
}

const SUB_TABS = [
  { label: '📊 Skills', key: 'skills' },
  { label: '🗺️ Milestones', key: 'milestones' },
  { label: '✅ Daily Missions', key: 'missions' },
]

export default function EvolveSection() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [subTab, setSubTab] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)

  async function loadStatus() {
    const res = await fetch('/api/player/status')
    const json = await res.json()
    setStatus(json)
    setLoading(false)
  }

  useEffect(() => { loadStatus() }, [])

  async function handleSync() {
    setSyncing(true)
    setSyncError('')
    try {
      const res = await fetch('/api/player/sync')
      const json = await res.json()
      if (!res.ok) { setSyncError(json.error || 'Sync failed'); setSyncing(false); return }
      await loadStatus()
      setReloadKey(k => k + 1) // force les sous-tabs a refetch avec les donnees fraiches
    } catch {
      setSyncError('Connection failed')
    }
    setSyncing(false)
  }

  if (loading) {
    return <div style={{ color: '#6b6960', fontSize: 13, textAlign: 'center', padding: '3rem', fontFamily: 'Space Mono, monospace' }}>Loading Evolve...</div>
  }

  if (!status?.linked) {
    return <LinkPrompt />
  }

  const profileId = status.profile_id

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(155,89,182,0.06)', border: '1px solid rgba(155,89,182,0.2)',
        borderRadius: 10, padding: '0.75rem 1.1rem', marginBottom: 16,
      }}>
        <span style={{ fontSize: 12.5, color: '#e8e6df' }}>
          <b style={{ color: '#9b59b6' }}>{status.hypixel_username}</b>
          {status.last_synced && (
            <span style={{ marginLeft: 10, fontSize: 10.5, color: '#6b6960' }}>
              last synced {new Date(status.last_synced).toLocaleString()}
            </span>
          )}
        </span>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            background: 'transparent', border: '1px solid rgba(155,89,182,0.3)', color: '#9b59b6',
            padding: '0.35rem 0.8rem', borderRadius: 5, fontSize: 11, cursor: syncing ? 'wait' : 'pointer',
            fontFamily: 'Space Mono, monospace',
          }}
        >
          {syncing ? 'Syncing... (can take a minute)' : '↻ Sync now'}
        </button>
      </div>

      {syncError && <div style={{ color: '#e34948', fontSize: 12, marginBottom: 14 }}>⚠️ {syncError}</div>}

      {!profileId ? (
        <div style={{ background: '#111110', border: '0.5px solid rgba(201,168,76,0.15)', borderRadius: 10, padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: 12.5, color: '#9b9b8f', marginBottom: 12 }}>
            Your account is linked but hasn't been synced yet — hit "Sync now" above to pull your real SkyBlock data.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 3, marginBottom: 16, flexWrap: 'wrap' }}>
            {SUB_TABS.map((t, i) => (
              <button
                key={i}
                onClick={() => setSubTab(i)}
                style={{
                  padding: '0.4rem 0.9rem', borderRadius: 5, fontSize: 12.5, border: '1px solid rgba(155,89,182,0.15)',
                  background: subTab === i ? 'rgba(155,89,182,0.1)' : '#0f0f0e',
                  color: subTab === i ? '#9b59b6' : '#6b6960',
                  borderColor: subTab === i ? '#9b59b6' : 'rgba(155,89,182,0.15)',
                  cursor: 'pointer', fontWeight: subTab === i ? 600 : 400,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {subTab === 0 && <SkillsTab key={`skills-${reloadKey}`} profileId={profileId} />}
          {subTab === 1 && <MilestonesTab key={`milestones-${reloadKey}`} profileId={profileId} />}
          {subTab === 2 && <MissionsTab key={`missions-${reloadKey}`} profileId={profileId} />}
        </>
      )}
    </div>
  )
}
