import Link from 'next/link'
import SiteNav from '../../components/SiteNav'
import SiteFooter from '../../components/SiteFooter'

export const metadata = { title: 'Features — Vault Dashboard' }

// Matches the real 5 dashboard tabs exactly (app/dashboard/page.tsx TABS array) —
// there is no separate "AH Sniper" channel, that idea was absorbed into Radar.
const FEATURES = [
  {
    name: '⚡ Flash Alerts',
    tier: 'Alert+ (Top 5 preview only on Free)',
    desc: 'Live-ranked Bazaar and Auction House opportunities, switchable between the two. Full Top 25 Bazaar flip feed, plus Top 25 per AH category, refreshed continuously as prices move — not a delayed daily digest.',
  },
  {
    name: '💰 Money Making',
    tier: 'Pro+ (Vault Exclusive on Elite)',
    desc: 'Two categories per net worth tier — Early (0-50M, 10M/h target), Mid (50-500M, 25M/h), End (500M-5B, 50M/h), Late (5B+, 70M+/h). Active Grind: the best verified skill-based methods for that tier, each with a concrete gear setup (enchants, armor, reforges). Vault Exclusive (Elite only): non-obvious method innovations discovered by AI, not published anywhere else.',
  },
  {
    name: '🔧 Patch Analysis',
    tier: 'Alert+ (live summary only on Free)',
    desc: 'Every patch — both live releases and alpha/PTL previews — broken down for its direct economic impact: which items were buffed or nerfed, which money-making methods it affects, and what that shifts for you before the wider playerbase reacts.',
  },
  {
    name: '📡 Market Radar',
    tier: 'Pro+',
    desc: 'A price explorer covering 4,781 items across Bazaar and Auction House, up to 3 years of history — sell price, buy price, volume. Alongside it, daily AI intelligence in two columns: Top Opportunities and Risk Items, each with its reasoning (patch changes, supply shocks, event demand, trend direction), a confidence rating, a timeframe, and a price target.',
  },
]

const EVOLVE = [
  {
    name: '📊 Skills & 🗺️ Milestones',
    tier: 'Pro+',
    desc: 'Link your Hypixel account and Vault reads your real progression — skills, slayers, dungeons, collections, and currently equipped gear — instead of guessing. Shows exactly where you stand against the full Skyblock completion guide, tier by tier, and what to work on next.',
  },
  {
    name: '✅ Daily Missions',
    tier: 'Elite+',
    desc: 'A daily set of concrete, achievable objectives generated from your own remaining Milestones gaps — never a generic checklist, always grounded in what you personally still have left to complete.',
  },
]

export default function Features() {
  return (
    <>
      <SiteNav />
      <div className="page-wrap">
        <div className="page-eyebrow">DASHBOARD FEATURES</div>
        <h1>Everything inside the Vault dashboard</h1>
        <p className="page-updated">
          The exact 5 tabs of the real dashboard, tier by tier — nothing here is aspirational or planned, this is what exists today.
        </p>

        <p>
          Vault isn&rsquo;t one generic feed — it&rsquo;s a set of purpose-built tabs, each reading
          from Vault&rsquo;s own continuously-collected market data (Bazaar, Auction House,
          NBT-priced item variants, patch notes) and, for Evolve, your own linked Hypixel profile.
          Here&rsquo;s exactly what each one covers.
        </p>

        <h2>Market intelligence</h2>
        <div style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
          {FEATURES.map((f) => (
            <div key={f.name} className="vault-card" style={{ padding: '1.5rem' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.4rem' }}>{f.name}</div>
              <div className="pixel" style={{ fontSize: '0.55rem', color: 'var(--gold-dim)', marginBottom: '0.8rem' }}>{f.tier}</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <h2>Evolve — personal progression</h2>
        <p style={{ marginBottom: '1rem' }}>
          Unlike the market tabs above, Evolve is personal: it reads your actual linked Hypixel
          Skyblock profile, never a generic benchmark.
        </p>
        <div style={{ display: 'grid', gap: '1rem' }}>
          {EVOLVE.map((f) => (
            <div key={f.name} className="vault-card" style={{ padding: '1.5rem' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.4rem' }}>{f.name}</div>
              <div className="pixel" style={{ fontSize: '0.55rem', color: 'var(--gold-dim)', marginBottom: '0.8rem' }}>{f.tier}</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <p style={{ marginTop: '2.5rem' }}>
          Ready to see it live? <Link href="/hypixel-skyblock#pricing">Check pricing and get started →</Link>
        </p>

        <Link href="/" className="page-back">← Back to home</Link>
      </div>
      <SiteFooter />
    </>
  )
}
