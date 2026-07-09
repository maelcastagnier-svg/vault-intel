'use client'
import { useState, useEffect } from 'react'

const STAGE_COLORS: Record<string, string> = { early: '#1baf7a', mid: '#c9a84c', end: '#e34948', late: '#9b59b6' }
const STAGE_LABELS: Record<string, string> = { early: '🌱 Early Game', mid: '⚔️ Mid Game', end: '🔥 End Game', late: '👑 Late Game' }
const NEXT_TIER_LABELS: Record<string, string> = { mid: 'Mid Game', end: 'End Game', late: 'Late Game' }

const ALL_SKILLS = [
  { key: 'farming', label: 'Farming', icon: '🌾', cap: 60 },
  { key: 'mining', label: 'Mining', icon: '⛏️', cap: 60 },
  { key: 'combat', label: 'Combat', icon: '⚔️', cap: 50 },
  { key: 'foraging', label: 'Foraging', icon: '🌳', cap: 50 },
  { key: 'fishing', label: 'Fishing', icon: '🎣', cap: 60 },
  { key: 'enchanting', label: 'Enchanting', icon: '📖', cap: 50 },
  { key: 'alchemy', label: 'Alchemy', icon: '🧪', cap: 50 },
  { key: 'carpentry', label: 'Carpentry', icon: '🔨', cap: 50 },
  { key: 'runecrafting', label: 'Runecrafting', icon: '🔮', cap: 25 },
  { key: 'taming', label: 'Taming', icon: '🐾', cap: 50 },
  { key: 'social', label: 'Social', icon: '💬', cap: 25 },
]

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
  const [subTab, setSubTab] = useState(0)
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [selectedMoney, setSelectedMoney] = useState<any | null>(null)
  const [hoveredMilestone, setHoveredMilestone] = useState<number | null>(null)

  useEffect(() => {
    async function loadExisting() {
      if (!userId) { setInitialLoad(false); return }
      try {
        const res = await fetch('/api/evolve?userId=' + userId)
        const data = await res.json()
        if (data.profile) setProfile(data.profile)
        else setShowManualInput(true)
      } catch (e) { setShowManualInput(true) }
      setInitialLoad(false)
    }
    loadExisting()
  }, [userId])

  async function handleSync(overrideUsername?: string, forceRefresh = false) {
    const nameToUse = overrideUsername || username || profile?.hypixel_username
    if (!nameToUse?.trim()) { setError('Enter your Hypixel username'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username: nameToUse.trim(), plan, force: forceRefresh })
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else { setProfile(data.profile); setShowManualInput(false) }
    } catch (e) { setError('Connection failed — try again') }
    setLoading(false)
  }

  if (initialLoad) {
    return <div style={{ color: '#6b6960', fontSize: 13, textAlign: 'center', padding: '3rem', fontFamily: 'Space Mono, monospace' }}>Loading Evolve...</div>
  }

  const rawProfile = profile?.raw_profile || {}
  const skillsDetailed = rawProfile.skills_detailed || {}
  const personalizedMoney = rawProfile.personalized_money_making || []
  const setupRoute = rawProfile.setup_route || []
  const priorityActions = profile?.priority_actions || []
  const nextTierRoute = profile?.next_tier_route || []

  const SUB_TABS = [
    { label: '⚡ Improvement', key: 'improvement' },
    { label: '🗺️ Route', key: 'route' },
    { label: '📊 Skills', key: 'skills' },
    { label: '💰 Money', key: 'money' },
  ]

  return (
    <div>
      {profile && !showManualInput && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(155,89,182,0.06)', border: '1px solid rgba(155,89,182,0.2)', borderRadius: 10, padding: '0.75rem 1.1rem', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {profile.skin_url && <img src={profile.skin_url} style={{ width: 28, height: 28, objectFit: 'cover', imageRendering: 'pixelated', borderRadius: 4 }} />}
            <span style={{ fontSize: 12.5, color: '#e8e6df' }}>
              <b style={{ color: '#9b59b6' }}>{profile.hypixel_username}</b>
              {profile.game_stage && (
                <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 7px', borderRadius: 4, background: (STAGE_COLORS[profile.game_stage]||'#6b6960')+'18', color: STAGE_COLORS[profile.game_stage]||'#6b6960', fontFamily: 'Space Mono, monospace' }}>
                  {STAGE_LABELS[profile.game_stage] || profile.game_stage}
                </span>
              )}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f0d68a' }}>{fmtCoins(profile.networth || 0)}</span>
            <button onClick={() => handleSync(undefined, true)} disabled={loading}
              style={{ background: 'transparent', border: '1px solid rgba(155,89,182,0.3)', color: '#9b59b6', padding: '0.35rem 0.8rem', borderRadius: 5, fontSize: 11, cursor: loading ? 'wait' : 'pointer', fontFamily: 'Space Mono, monospace' }}>
              {loading ? 'Syncing...' : '↻ Re-sync'}
            </button>
          </div>
        </div>
      )}

      {showManualInput && (
        <div style={{ background: 'rgba(155,89,182,0.06)', border: '1px solid rgba(155,89,182,0.2)', borderRadius: 12, padding: '1.5rem', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 24 }}>🧬</span>
            <div>
              <div className="gold-title" style={{ fontSize: 15 }}>Evolve — Personal AI Coach</div>
              <div style={{ fontSize: 11, color: '#6b6960' }}>Connect your Hypixel account below</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Hypixel username"
              style={{ flex: 1, background: '#0a0a0a', border: '1px solid rgba(155,89,182,0.3)', borderRadius: 6, padding: '0.6rem 0.9rem', color: '#e8e6df', fontSize: 13 }} />
            <button onClick={() => handleSync()} disabled={loading}
              style={{ background: '#9b59b6', color: '#fff', border: 'none', padding: '0.6rem 1.2rem', borderRadius: 6, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', fontSize: 13, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Syncing...' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ color: '#e34948', fontSize: 12, marginBottom: 14 }}>⚠️ {error}</div>}

      {profile && (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20, alignItems: 'flex-start' }}>
          {/* LEFT — persistent character frame */}
          <div style={{ position: 'sticky', top: 16 }}>
            <div style={{ background: '#111110', border: '0.5px solid rgba(201,168,76,0.15)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
              {profile.skin_url && (
                <img src={profile.skin_url} alt={profile.hypixel_username} style={{ width: '100%', maxWidth: 150, imageRendering: 'pixelated', margin: '0 auto', display: 'block' }} />
              )}
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e6df', marginTop: 10 }}>{profile.hypixel_username}</div>
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

            <div style={{ background: '#111110', border: '0.5px solid rgba(201,168,76,0.15)', borderRadius: 10, padding: 14, marginTop: 10 }}>
              <div style={{ fontSize: 9.5, color: '#c9a84c', fontFamily: 'Space Mono, monospace', textTransform: 'uppercase', marginBottom: 4 }}>Networth (est.)</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f0d68a' }}>{fmtCoins(profile.networth || 0)}</div>
            </div>

            <button onClick={() => handleSync(undefined, true)} disabled={loading}
              style={{ width: '100%', marginTop: 10, background: 'transparent', border: '1px solid rgba(155,89,182,0.3)', color: '#9b59b6', padding: '0.5rem', borderRadius: 6, fontSize: 11, cursor: loading ? 'wait' : 'pointer', fontFamily: 'Space Mono, monospace' }}>
              {loading ? 'Syncing...' : '↻ Re-sync'}
            </button>
          </div>

          {/* RIGHT — sub-tabs and content */}
          <div>
          <div style={{ display: 'flex', gap: 3, marginBottom: 16, flexWrap: 'wrap' }}>
            {SUB_TABS.map((t, i) => (
              <button key={i} onClick={() => setSubTab(i)}
                style={{
                  padding: '0.4rem 0.9rem', borderRadius: 5, fontSize: 12.5, border: '1px solid rgba(155,89,182,0.15)',
                  background: subTab === i ? 'rgba(155,89,182,0.1)' : '#0f0f0e',
                  color: subTab === i ? '#9b59b6' : '#6b6960',
                  borderColor: subTab === i ? '#9b59b6' : 'rgba(155,89,182,0.15)',
                  cursor: 'pointer', fontWeight: subTab === i ? 600 : 400
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* IMPROVEMENT */}
          {subTab === 0 && (
            <div>
              {profile.evolve_summary && (
                <div style={{ background: '#111110', border: '0.5px solid rgba(201,168,76,0.15)', borderLeft: '3px solid #9b59b6', borderRadius: 8, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: '#e8e6df', lineHeight: 1.6 }}>
                  {profile.evolve_summary}
                </div>
              )}
              <div className="section-label" style={{ color: '#9b59b6' }}>⚡ Do This Now</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {priorityActions.length > 0 ? priorityActions.map((action: any, i: number) => (
                  <div key={i} style={{ background: '#0d0d0c', border: '0.5px solid rgba(155,89,182,0.2)', borderLeft: '2px solid #9b59b6', borderRadius: 6, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#e8e6df' }}>{i+1}. {action.title}</div>
                      {action.impact && <span style={{ fontSize: 10, color: '#9b59b6', fontFamily: 'Space Mono, monospace', whiteSpace: 'nowrap' }}>{action.impact}</span>}
                    </div>
                    {action.reason && <div style={{ fontSize: 12, color: '#9b9b8f', marginTop: 6, lineHeight: 1.5 }}>{action.reason}</div>}
                  </div>
                )) : <div style={{ color: '#6b6960', fontSize: 12 }}>No recommendations yet — try re-syncing.</div>}
              </div>
            </div>
          )}

          {/* ROUTE — visual timeline with hover milestones */}
          {subTab === 1 && (
            <div>
              <div className="section-label" style={{ color: '#c9a84c' }}>
                🗺️ Progress to {NEXT_TIER_LABELS[profile.next_tier] || 'Next Tier'}
              </div>
              {profile.next_tier && (
                <div style={{ marginBottom: 28 }}>
                  <div style={{ background: '#0a0a0a', borderRadius: 8, height: 10, overflow: 'hidden' }}>
                    <div style={{ width: (profile.next_tier_progress || 0) + '%', height: '100%', background: 'linear-gradient(90deg, #c9a84c, #9b59b6)', transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#9b9b8f', marginTop: 6 }}>{profile.next_tier_progress || 0}% complete</div>
                </div>
              )}

              {nextTierRoute.length > 0 ? (
                <div style={{ position: 'relative', paddingLeft: 4 }}>
                  <div style={{ position: 'absolute', left: 15, top: 20, bottom: 20, width: 2, background: 'linear-gradient(180deg, #c9a84c, rgba(201,168,76,0.15))' }} />
                  {nextTierRoute.map((step: any, i: number) => (
                    <div key={i}
                      onMouseEnter={() => setHoveredMilestone(i)}
                      onMouseLeave={() => setHoveredMilestone(null)}
                      style={{ position: 'relative', display: 'flex', gap: 16, paddingBottom: i < nextTierRoute.length - 1 ? 24 : 0, cursor: 'pointer' }}>
                      <div style={{
                        flexShrink: 0, width: 32, height: 32, borderRadius: '50%', zIndex: 1,
                        background: hoveredMilestone === i ? '#c9a84c' : 'rgba(201,168,76,0.15)',
                        border: '2px solid #c9a84c', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, color: hoveredMilestone === i ? '#0a0a0a' : '#c9a84c', fontFamily: 'Space Mono, monospace', fontWeight: 700,
                        transition: 'all 0.2s'
                      }}>{i + 1}</div>
                      <div style={{ flex: 1, background: hoveredMilestone === i ? 'rgba(201,168,76,0.06)' : 'transparent', borderRadius: 8, padding: hoveredMilestone === i ? '10px 14px' : '4px 0', transition: 'all 0.2s' }}>
                        <div style={{ fontSize: 13.5, color: '#e8e6df', fontWeight: 600 }}>{step.step}</div>
                        {step.target && <div style={{ fontSize: 11.5, color: '#c9a84c', fontFamily: 'Space Mono, monospace', marginTop: 3 }}>🎯 {step.target}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: '#6b6960', fontSize: 12 }}>No route data yet — try re-syncing.</div>}
            </div>
          )}

          {/* SKILLS — click opens modal detail instead of inline panel */}
          {subTab === 2 && (
            <div>
              <div className="section-label" style={{ color: '#2a78d6' }}>📊 All Skills — click for details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ALL_SKILLS.map(s => {
                  const detail = skillsDetailed[s.key]
                  const level = detail?.level ?? profile.skills?.[s.key] ?? 0
                  return (
                    <div key={s.key} onClick={() => setSelectedSkill(s.key)}
                      style={{ background: '#0d0d0c', border: '0.5px solid rgba(201,168,76,0.12)', borderRadius: 8, padding: '10px 14px', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(42,120,214,0.4)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(201,168,76,0.12)')}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: '#e8e6df' }}>{s.icon} {s.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#2a78d6', fontFamily: 'Space Mono, monospace' }}>Lvl {level}<span style={{ color: '#6b6960', fontWeight: 400 }}>/{s.cap}</span></span>
                      </div>
                      <div style={{ background: '#0a0a0a', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: Math.min(100, (level / s.cap) * 100) + '%', height: '100%', background: '#2a78d6' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* MONEY — click opens modal detail */}
          {subTab === 3 && (
            <div>
              <div className="section-label" style={{ color: '#1baf7a' }}>💰 Personalized For You — click for setup</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {personalizedMoney.length > 0 ? personalizedMoney.map((m: any, i: number) => (
                  <div key={i} onClick={() => setSelectedMoney(m)}
                    style={{ background: '#0d0d0c', border: '0.5px solid rgba(27,175,122,0.2)', borderLeft: '2px solid #1baf7a', borderRadius: 6, padding: '14px 16px', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(27,175,122,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#0d0d0c')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#e8e6df' }}>{m.method}</div>
                      {m.coins_per_hour && <span style={{ fontSize: 11, color: '#1baf7a', fontFamily: 'Space Mono, monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{m.coins_per_hour}</span>}
                    </div>
                    {m.why_now && <div style={{ fontSize: 12, color: '#9b9b8f', marginTop: 6, lineHeight: 1.5 }}>{m.why_now}</div>}
                  </div>
                )) : <div style={{ color: '#6b6960', fontSize: 12 }}>No personalized methods yet — try re-syncing.</div>}
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {plan !== 'elite' && profile && (
        <div style={{ marginTop: 20, background: 'rgba(155,89,182,0.06)', border: '1px solid rgba(155,89,182,0.2)', borderRadius: 8, padding: '0.85rem 1rem', fontSize: 11.5, color: '#9b9b8f' }}>
          🔒 <b style={{ color: '#9b59b6' }}>Elite unlocks:</b> live inventory/wardrobe comparison, exact gear setups cross-referenced with market data, and progress history tracking.
        </div>
      )}
    </div>
  )
}