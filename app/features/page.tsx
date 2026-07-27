import Link from 'next/link'
import SiteNav from '../../components/SiteNav'
import SiteFooter from '../../components/SiteFooter'

export const metadata = { title: 'Features — Vault Dashboard' }

const FEATURES = [
  {
    name: '#flash-alerts',
    tier: 'Alert+ (degraded top-5 preview on Free)',
    desc: 'Real-time Bazaar and Auction House price anomaly detection. When an item spikes, crashes, or trades outside its normal range, Vault surfaces it immediately with the top trades to act on right now — not a delayed daily digest.',
  },
  {
    name: '#patch-analysis',
    tier: 'Alert+ (live summary only on Free)',
    desc: 'Every Hypixel Skyblock patch, broken down for its economic impact: which items got buffed or nerfed, where the meta is shifting, and what investment windows that opens or closes before the wider playerbase catches on.',
  },
  {
    name: '#money-making',
    tier: 'Active tiers on Pro, Vault Exclusive on Elite',
    desc: 'Four full tier tables — Early, Mid, End, and Late game — covering Bazaar flips, Auction House flips, and farming methods matched to your actual progression stage. Elite unlocks Vault Exclusive opportunities: AI-generated methods not published anywhere else.',
  },
  {
    name: '#investment-radar',
    tier: 'Pro+',
    desc: 'Mid and long-term market positioning. What to accumulate before demand catches up, and what to offload before a shift in the meta erodes its value — built for players thinking further ahead than the next flip.',
  },
  {
    name: '#ah-sniper',
    tier: 'Pro+',
    desc: 'Real-time detection of Auction House listings priced below market value, with buy and relist targets — surfaced the moment they appear.',
  },
]

const EVOLVE = [
  {
    name: 'Skills & Milestones',
    tier: 'Pro+',
    desc: 'Link your Hypixel account and Vault reads your real progression — skills, slayers, dungeons, collections, and currently equipped gear — to show exactly where you stand against the full Skyblock completion guide, tier by tier, and what to grind next.',
  },
  {
    name: 'Daily Missions',
    tier: 'Elite+',
    desc: 'A daily set of concrete, achievable objectives generated from your own Milestones progress — never a generic checklist, always grounded in what you personally still have left to complete.',
  },
]

export default function Features() {
  return (
    <>
      <SiteNav />
      <div className="page-wrap">
        <div className="page-eyebrow">DASHBOARD FEATURES</div>
        <h1>Everything inside the Vault dashboard</h1>
        <p className="page-updated">A tier-by-tier breakdown of what each part of Vault actually does.</p>

        <p>
          Vault isn&rsquo;t one generic feed — it&rsquo;s a set of purpose-built channels, each
          reading from Vault&rsquo;s own continuously-collected market data (Bazaar, Auction House,
          NBT-priced item variants, patch notes) and, where relevant, your own linked Hypixel profile.
          Here&rsquo;s exactly what each one covers.
        </p>

        <h2>Market intelligence</h2>
        <div style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
          {FEATURES.map((f) => (
            <div key={f.name} className="vault-card" style={{ padding: '1.5rem' }}>
              <div className="pixel" style={{ fontSize: '0.7rem', color: 'var(--gold)', marginBottom: '0.4rem' }}>{f.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gold-dim)', marginBottom: '0.6rem' }}>{f.tier}</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <h2>Evolve — personal progression</h2>
        <p style={{ marginBottom: '1rem' }}>
          Unlike the market channels above, Evolve is personal: it reads your actual linked Hypixel
          Skyblock profile, never a generic benchmark.
        </p>
        <div style={{ display: 'grid', gap: '1rem' }}>
          {EVOLVE.map((f) => (
            <div key={f.name} className="vault-card" style={{ padding: '1.5rem' }}>
              <div className="pixel" style={{ fontSize: '0.7rem', color: 'var(--gold)', marginBottom: '0.4rem' }}>{f.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gold-dim)', marginBottom: '0.6rem' }}>{f.tier}</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <p style={{ marginTop: '2.5rem' }}>
          Ready to see it live? <Link href="/#pricing">Check pricing and get started →</Link>
        </p>

        <Link href="/" className="page-back">← Back to home</Link>
      </div>
      <SiteFooter />
    </>
  )
}
