'use client'
import { useState, useEffect } from 'react'
import SkillCard from './SkillCard'
import SkillBar from './SkillBar'
import SkillProgressOverlay from './SkillProgressOverlay'
import { SkillsResponse, SkillCardData } from './types'
import { DEFAULT_SKIN_URL } from '../../../lib/skin-uv-map'

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
  const [openSkill, setOpenSkill] = useState<SkillCardData | null>(null)

  // Same skin resolution as SetupOverlay (crafatar -> mojang session server ->
  // local placeholder, the last one appended internally by SkinArmorRender) --
  // fetched once here and shared by every SkillBar's overlay rather than
  // re-fetched per skill.
  const [skinUrls, setSkinUrls] = useState<string[]>([DEFAULT_SKIN_URL])

  useEffect(() => {
    let cancelled = false
    fetch('/api/player/status')
      .then(r => { if (!r.ok) throw new Error('status ' + r.status); return r.json() })
      .then(d => {
        if (cancelled) return
        if (d?.linked && d?.hypixel_uuid) {
          const urls = [`https://crafatar.com/skins/${d.hypixel_uuid}`]
          if (d.mojang_skin_url) urls.push(d.mojang_skin_url)
          setSkinUrls(urls)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

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
        <SkillBar
          key={card.skill_key}
          label={card.label}
          icon={SKILL_ICONS[card.skill_key]}
          progress={card.progress}
          unlocked={card.unlocked}
          onClick={() => setOpenSkill(card)}
        />
      ))}

      {openSkill && (
        <SkillProgressOverlay
          label={openSkill.label}
          icon={SKILL_ICONS[openSkill.skill_key]}
          current={openSkill.current}
          target={openSkill.target}
          skinUrls={skinUrls}
          onClose={() => setOpenSkill(null)}
        />
      )}

      {slayerCard && (
        <div>
          <div
            onClick={() => setExpandedSlayer(v => !v)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
              background: '#111110', border: `1px solid rgba(201,168,76,${expandedSlayer?0.4:0.25})`, boxShadow: expandedSlayer?'0 0 20px rgba(201,168,76,0.1)':'none', borderRadius: 10, padding: '10px 14px', marginBottom: expandedSlayer ? 10 : 12, transition:'all 0.2s',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#e8e6df', fontFamily: "'Press Start 2P', monospace", letterSpacing: '0.02em' }}>{SKILL_ICONS.slayer} SLAYER — 6 BOSSES</span>
            <span style={{ fontSize: 11, color: '#6b6960' }}>{expandedSlayer ? '▲ collapse' : '▼ expand'}</span>
          </div>
          {data.stale_slayer_data && (
            <div style={{ fontSize: 11, color: '#d6a02a', background: 'rgba(214,160,42,0.08)', border: '1px solid rgba(214,160,42,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
              ⚠️ This Slayer card was generated before a max-tier data fix — hit "Sync now" above to refresh it.
            </div>
          )}
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
