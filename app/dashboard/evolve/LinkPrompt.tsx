'use client'
import Link from 'next/link'

export default function LinkPrompt() {
  return (
    <div style={{ background: 'rgba(155,89,182,0.06)', border: '1px solid rgba(155,89,182,0.2)', borderRadius: 12, padding: '1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: 24, marginBottom: 10 }}>🧬</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e6df', marginBottom: 6 }}>Connect your Hypixel account</div>
      <div style={{ fontSize: 12, color: '#9b9b8f', marginBottom: 16 }}>
        Skills, Milestones and Daily Missions are personalized from your real SkyBlock profile — link your Hypixel account to get started.
      </div>
      <Link
        href="/link-hypixel"
        style={{
          display: 'inline-block', background: '#9b59b6', color: '#fff', padding: '0.6rem 1.4rem',
          borderRadius: 6, fontWeight: 700, fontSize: 13, textDecoration: 'none',
        }}
      >
        Link Hypixel account
      </Link>
    </div>
  )
}
