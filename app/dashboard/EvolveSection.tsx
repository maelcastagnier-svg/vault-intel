'use client'
import { useState, useEffect } from 'react'

const STAGE_COLORS: Record<string, string> = { early: '#1baf7a', mid: '#c9a84c', end: '#e34948', late: '#9b59b6' }
const STAGE_LABELS: Record<string, string> = { early: '🌱 Early Game', mid: '⚔️ Mid Game', end: '🔥 End Game', late: '👑 Late Game' }
const NEXT_TIER_LABELS: Record<string, string> = { mid: 'Mid Game', end: 'End Game', late: 'Late Game' }

function fmtCoins(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}

export default function EvolveSection({ plan, userId }: { plan: string, userId: string }) {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [initialLoad, setInitialLoad] = useState(true)
  const [showManualInput, setShowManualInput] = useState(false)
  const [username, setUsername] = useState('')

  useEffect(() => {
    async function loadExisting() {
      if (!userId) { setInitialLoad(false); return }
      try {
        const res = await fetch('/api/evolve?userId=' + userId)
        const data = await res.json()
        if (data.profile) {
          setProfile(data.profile)
        } else {
          setShowManualInput(true)
        }
      } catch (e) {
        setShowManualInput(true)
      }
      setInitialLoad(false)
    }
    loadExisting()
  }, [userId])

  async function handleSync(overrideUsername?: string) {
    const nameToUse = overrideUsername || username || profile?.hypixel_username
    if (!nameToUse?.trim()) { setError('Enter your Hypixel username'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username: nameToUse.trim(), plan })
      })
      const data = await res.json()
      if (data.error) { setError(data.error) } else { setProfile(data.profile); setShowManualInput(false) }
    } catch (e) {
      setError('Connection failed — try again')
    }
    setLoading(false)
  }

  if (initialLoad) {
    return <div style={{ color: '#6b6960', fontSize: 13, textAlign: 'center', padding: '3rem', fontFamily: 'Space Mono, monospace' }}>Loading Evolve...</div>
  }

  return (
    <div>
      {/* Connected state header — no re-typing needed */}
      {profile && !showManualInput && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(155,89,182,0.06)', border: '1px solid rgba(155,89,182,0.2)', borderRadius: 10, padding: '0.75rem 1.1rem', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🧬</span>
            <span style={{ fontSize: 12.5, color: '#e8e6df' }}>Connected as <b style={{ color: '#9b59b6' }}>{profile.hypixel_username}</b></span>
          </div>
          <button
            onClick={() => handleSync()}
            disabled={loading}
            style={{ background: 'transparent', border: '1px solid rgba(155,89,182,0.3)', color: '#9b59b6', padding: '0.35rem 0.8rem', borderRadius: 5, fontSize: 11, cursor: loading ? 'wait' : 'pointer', fontFamily: 'Space Mono, monospace' }}
          >
            {loading ? 'Syncing...' : '↻ Re-sync'}
          </button>
        </div>
      )}

      {/* Manual input — only shown if no profile exists yet (fallback) */}
      {showManualInput && (
        <div style={{ background: 'rgba(155,89,182,0.06)', border: '1px solid rgba(155,89,182,0.2)', borderRadius: 12, padding: '1.5rem', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 24 }}>🧬</span>
            <div>
              <div className="gold-title" style={{ fontSize: 15 }}>Evolve — Personal AI Coach</div>
              <div style={{ fontSize: 11, color: '#6b6960' }}>No Hypixel account linked yet — connect it below</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Hypixel username"
              style={{ flex: 1, background: '#0a0a0a', border: '1px solid rgba(155,89,182,0.3)', borderRadius: 6, padding: '0.6rem 0.9rem', color: '#e8e6df', fontSize: 13, fontFamily: 'Space Grotesk, sans-serif' }}
            />
            <button
              onClick={() => handleSync()}
              disabled={loading}
              style={{ background: '#9b59b6', color: '#fff', border: 'none', padding: '0.6rem 1.2rem', borderRadius: 6, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', fontSize: 13, opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Syncing...' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ color: '#e34948', fontSize: 12, marginBottom: 14 }}>⚠️ {error}</div>}

      {profile && (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
          {/* LEFT — Skin render + Networth */}
          <div>
            <div style={{ background: '#111110', border: '0.5px solid rgba(201,168,76,0.15)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
              {profile.skin_url && (
                <img src={profile.skin_url} alt={profile.hypixel_username} style={{ width: '100%', maxWidth: 160, imageRendering: 'pixelated', margin: '0 auto', display: 'block' }} />
              )}
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e6df', marginTop: 10 }}>{profile.hypixel_username}</div>
              {profile.game_stage && (
                <div style={{
                  display: 'inline-block', marginTop: 8, fontSize: 10, padding: '4px 10px', borderRadius: 5,
                  background: (STAGE_COLORS[profile.game_stage] || '#6b6960') + '18',
                  color: STAGE_COLORS[profile.game_stage] || '#6b6960',
                  border: '1px solid ' + (STAGE_COLORS[profile.game_stage] || '#6b6960') + '40',
                  fontFamily: 'Space Mono, monospace', fontWeight: 700
                }}>
                  {STAGE_LABELS[profile.game_stage] || profile.game_stage}
                </div>
              )}
            </div>

            <div style={{ background: '#111110', border: '0.5px solid rgba(201,168,76,0.15)', borderRadius: 10, padding: 16, marginTop: 12 }}>
              <div style={{ fontSize: 10, color: '#c9a84c', fontFamily: 'Space Mono, monospace', textTransform: 'uppercase', marginBottom: 6 }}>Networth (est.)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#f0d68a' }}>{fmtCoins(profile.networth || 0)}</div>
              <div style={{ fontSize: 9.5, color: '#6b6960', marginTop: 4 }}>Purse + Bank — full item value coming soon</div>
            </div>

            {profile.next_tier && (
              <div style={{ background: '#111110', border: '0.5px solid rgba(201,168,76,0.15)', borderRadius: 10, padding: 16, marginTop: 12 }}>
                <div style={{ fontSize: 10, color: '#c9a84c', fontFamily: 'Space Mono, monospace', textTransform: 'uppercase', marginBottom: 6 }}>
                  Progress to {NEXT_TIER_LABELS[profile.next_tier] || profile.next_tier}
                </div>
                <div style={{ background: '#0a0a0a', borderRadius: 6, height: 8, overflow: 'hidden', marginTop: 8 }}>
                  <div style={{ width: (profile.next_tier_progress || 0) + '%', height: '100%', background: 'linear-gradient(90deg, #c9a84c, #9b59b6)' }} />
                </div>
                <div style={{ fontSize: 11, color: '#9b9b8f', marginTop: 6 }}>{profile.next_tier_progress || 0}%</div>
              </div>
            )}
          </div>

          {/* RIGHT — Summary + Priority Actions + Route */}
          <div>
            {profile.evolve_summary && (
              <div style={{ background: '#111110', border: '0.5px solid rgba(201,168,76,0.15)', borderLeft: '3px solid #9b59b6', borderRadius: 8, padding: '14px 16px', marginBottom: 14, fontSize: 13, color: '#e8e6df', lineHeight: 1.6 }}>
                {profile.evolve_summary}
              </div>
            )}

            <div className="section-label" style={{ color: '#9b59b6' }}>⚡ Priority Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
              {(profile.priority_actions || []).map((action: any, i: number) => (
                <div key={i} style={{ background: '#0d0d0c', border: '0.5px solid rgba(155,89,182,0.2)', borderLeft: '2px solid #9b59b6', borderRadius: 6, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e6df' }}>{action.title}</div>
                    {action.impact && (
                      <span style={{ fontSize: 10, color: '#9b59b6', fontFamily: 'Space Mono, monospace', whiteSpace: 'nowrap' }}>{action.impact}</span>
                    )}
                  </div>
                  {action.reason && <div style={{ fontSize: 11.5, color: '#9b9b8f', marginTop: 4, lineHeight: 1.5 }}>{action.reason}</div>}
                </div>
              ))}
              {(!profile.priority_actions || profile.priority_actions.length === 0) && (
                <div style={{ color: '#6b6960', fontSize: 12 }}>No recommendations yet — try re-syncing.</div>
              )}
            </div>

            {profile.next_tier_route && profile.next_tier_route.length > 0 && (
              <>
                <div className="section-label" style={{ color: '#c9a84c' }}>🗺️ Route to {NEXT_TIER_LABELS[profile.next_tier] || 'Next Tier'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {profile.next_tier_route.map((step: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#c9a84c', fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, color: '#e8e6df' }}>{step.step}</div>
                        {step.target && <div style={{ fontSize: 10.5, color: '#c9a84c', fontFamily: 'Space Mono, monospace', marginTop: 2 }}>{step.target}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {plan !== 'elite' && (
              <div style={{ marginTop: 16, background: 'rgba(155,89,182,0.06)', border: '1px solid rgba(155,89,182,0.2)', borderRadius: 8, padding: '0.85rem 1rem', fontSize: 11.5, color: '#9b9b8f' }}>
                🔒 <b style={{ color: '#9b59b6' }}>Elite unlocks:</b> exact gear setups cross-referenced with live Vault market data, full item networth calculation, and progress history tracking.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}