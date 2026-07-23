'use client'
import { useState, useEffect } from 'react'
import SkillCard from './SkillCard'
import { SkillsResponse, SkillCardData } from './types'

const SKILL_ICONS: Record<string, string> = {
  farming: '🌾', mining: '⛏️', combat: '⚔️', foraging: '🌳', fishing: '🎣',
  alchemy: '🧪', enchanting: '📖', dungeoneering: '🗡️', slayer: '👹',
}
const BOSS_ICONS: Record<string, string> = {
  zombie: '🧟', spider: '🕷️', wolf: '🐺', enderman: '👁️', blaze: '🔥', vampire: '🩸',
}

export default function SkillsTab({ profileId }: { profileId: string }) {
  const [data, setData] = useState<SkillsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedSlayer, setExpandedSlayer] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/player/skills?profile_id=${profileId}`)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) { setError(json.error || 'Failed to load Skills'); setData(null) }
        else setData(json)
      } catch {
        if (!cancelled) setError('Connection failed')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [profileId])

  if (loading) return <div style={{ color: '#6b6960', fontSize: 12, padding: '2rem', textAlign: 'center', fontFamily: 'Space Mono, monospace' }}>Loading Skills...</div>

  if (error) {
    return (
      <div style={{ color: '#6b6960', fontSize: 12.5, padding: '2rem', textAlign: 'center' }}>
        {error === 'Skills not generated yet — sync your account first'
          ? '🔄 Skills cards haven\'t been generated yet — hit "Sync now" above to build them from your real profile.'
          : `⚠️ ${error}`}
      </div>
    )
  }

  if (!data) return null

  const slayerCard = data.cards.find(c => c.skill_key === 'slayer')
  const otherCards = data.cards.filter(c => c.skill_key !== 'slayer')

  return (
    <div>
      <div className="section-label" style={{ color: '#2a78d6' }}>📊 Skills — current setup vs. next step</div>
      {otherCards.map(card => (
        <SkillCard
          key={card.skill_key}
          label={card.label}
          icon={SKILL_ICONS[card.skill_key]}
          current={card.current}
          target={card.target}
          unlocked={card.unlocked}
        />
      ))}

      {slayerCard && (
        <div>
          <div
            onClick={() => setExpandedSlayer(v => !v)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
              background: '#111110', border: '0.5px solid rgba(201,168,76,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: expandedSlayer ? 10 : 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e8e6df' }}>{SKILL_ICONS.slayer} Slayer — 6 bosses</span>
            <span style={{ fontSize: 11, color: '#6b6960' }}>{expandedSlayer ? '▲ collapse' : '▼ expand'}</span>
          </div>
          {expandedSlayer && (slayerCard.bosses || []).map(b => (
            <SkillCard
              key={b.boss}
              label={b.boss.charAt(0).toUpperCase() + b.boss.slice(1)}
              icon={BOSS_ICONS[b.boss]}
              current={b.current}
              target={b.target}
            />
          ))}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: '#4a4a45', marginTop: 4 }}>
        Generated {new Date(data.generated_at).toLocaleString()} · {data.model}
      </div>
    </div>
  )
}
