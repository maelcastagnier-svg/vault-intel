'use client'
import Link from "next/link";
import { useEffect, useState } from "react";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";

const PRICES = {
  alert: 'price_1TqXC5BmtpUo4AHWVzbSPY0e',
  pro: 'price_1TxkeXBmtpUo4AHWAlz7jGFt',
  elite: 'price_1TxkeXBmtpUo4AHW48EymVji',
}

const PLANS = [
  {
    key: 'free', name: 'Free', price: '€0', period: '',
    desc: 'A taste of Vault intelligence before you commit',
    features: ['Flash Alerts — top 5 preview', 'Patch Analysis — live summary only', 'No Hypixel account link'],
    // No-payment signup flow doesn't exist yet (account creation today only happens
    // post-checkout via /setup-account?session_id=...) -- that's its own dedicated
    // build, not something to improvise here. Disabled placeholder until then.
    cta: 'Coming soon', featured: false, priceId: null, comingSoon: true,
  },
  {
    key: 'alert', name: 'Alert', price: '€4.99', period: '/month',
    desc: 'For active traders who want real-time signals',
    features: ['Full Flash Alerts (Bazaar + AH)', 'Full Patch Analysis', 'Real-time price anomalies'],
    cta: 'Get started', featured: false, priceId: PRICES.alert, comingSoon: false,
  },
  {
    key: 'pro', name: 'Pro', price: '€19.99', period: '/month',
    desc: 'Full intelligence suite for serious players',
    features: ['Everything in Alert', 'Market Radar', 'Money Making — Active Grind', 'Evolve: Skills & Milestones'],
    cta: 'Get started', featured: true, badge: 'Most popular', priceId: PRICES.pro, comingSoon: false,
  },
  {
    key: 'elite', name: 'Elite', price: '€39.99', period: '/month',
    desc: 'The full Vault experience with exclusive AI insights',
    features: ['Everything in Pro', 'Money Making — Vault Exclusive', 'Evolve: Daily Missions', 'Early access to new features'],
    cta: 'Get started', featured: false, priceId: PRICES.elite, comingSoon: false,
  },
]

async function handleCheckout(priceId: string) {
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId })
    })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      alert('Error: ' + (data.error || 'Unknown error'))
    }
  } catch (err) {
    alert('Connection error — please try again')
  }
}

type Stats = { itemsTracked: number; priceDataPoints: number; variantDataPoints: number }

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch('/api/homepage-stats')
      .then((r) => r.json())
      .then((d) => { if (!d.error) setStats(d) })
      .catch(() => {})
  }, [])

  return (
    <>
      <style>{`
        /* Hero: locked background scene (public/images/hero-background.jpg). Text sits
           directly over the scene, no boxed panel -- just strong per-element text-shadow
           for legibility -- and is pulled up into the archway zone above the light beam
           so it never covers the floating key or the chest below it. */
        .hero {
          position: relative; overflow: hidden;
          min-height: clamp(560px, 82vh, 820px);
          display: flex; flex-direction: column; align-items: center;
        }
        .hero-bg {
          position: absolute; inset: 0; z-index: 0;
          background-image: url('/images/hero-background.jpg');
          /* bottom-biased on purpose: the VAULT wordmark baked into the image sits at
             ~78-91% down the source (1376x768), so cropping needs to favor the TOP
             (empty archway ceiling, low cost to lose) over the bottom -- position 22%
             was doing the opposite and could crop VAULT off on wide/short viewports. */
          background-size: cover; background-position: center 85%;
          background-color: var(--black);
        }
        .hero-bg::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(to bottom, rgba(10,10,10,0.62) 0%, rgba(10,10,10,0.1) 30%, rgba(10,10,10,0.05) 68%, rgba(10,10,10,0.32) 100%);
        }
        .hero-copy {
          position: relative; z-index: 2;
          max-width: 620px; margin: 46px auto 0; text-align: center;
          padding: 0 1.5rem;
        }
        .eyebrow {
          display: inline-block; font-family: 'Press Start 2P', monospace; font-size: 0.6rem; letter-spacing: 0.15em;
          color: var(--gold-bright); margin-bottom: 1.5rem;
          text-shadow: 0 0 12px rgba(232,192,99,0.5), 0 2px 6px rgba(0,0,0,0.8);
        }
        .hero-copy h1 {
          font-size: clamp(2rem, 4.6vw, 3.4rem); font-weight: 700; line-height: 1.12; color: var(--white); margin-bottom: 1.25rem; letter-spacing: -0.02em;
          text-shadow: 0 2px 4px rgba(0,0,0,0.9), 0 8px 30px rgba(0,0,0,0.85);
        }
        .hero-copy h1 em { font-style: normal; color: var(--gold-bright); }
        .hero-sub {
          font-size: 1.05rem; color: var(--text); max-width: 560px; margin: 0 auto 2.2rem; line-height: 1.7;
          text-shadow: 0 2px 4px rgba(0,0,0,0.9), 0 6px 20px rgba(0,0,0,0.8);
        }
        .cta-group { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }

        .proof-bar { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 1.5rem 2.5rem; display: flex; justify-content: center; gap: 3rem; flex-wrap: wrap; }
        .proof-item { text-align: center; }
        .proof-num { font-family: 'Space Mono', monospace; font-size: 1.4rem; font-weight: 700; color: var(--gold); }
        .proof-label { font-family: 'Press Start 2P', monospace; font-size: 0.55rem; color: var(--muted); letter-spacing: 0.05em; margin-top: 6px; }

        .channels-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 2.5rem; }
        .channel { padding: 1.25rem; }
        .channel-name { font-family: 'Press Start 2P', monospace; font-size: 0.65rem; color: var(--gold); margin-bottom: 0.75rem; }
        .channel-desc { font-size: 0.8rem; color: var(--muted); line-height: 1.5; }

        .pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem; margin-top: 3rem; }
        .plan { padding: 1.75rem; }
        .plan.featured { border-color: var(--gold); background: var(--surface2); }
        .plan-badge { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); background: var(--gold); color: var(--black); font-size: 0.65rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.2rem 0.75rem; border-radius: 2px; white-space: nowrap; }
        .plan-name { font-family: 'Press Start 2P', monospace; font-size: 0.65rem; letter-spacing: 0.05em; color: var(--gold); margin-bottom: 0.9rem; }
        .plan-price { font-size: 2rem; font-weight: 700; color: var(--white); margin-bottom: 0.25rem; }
        .plan-price span { font-size: 0.9rem; font-weight: 400; color: var(--muted); }
        .plan-desc { font-size: 0.8rem; color: var(--muted); margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
        .plan-features { list-style: none; margin-bottom: 1.75rem; }
        .plan-features li { font-size: 0.85rem; color: var(--text); padding: 0.35rem 0; display: flex; gap: 0.6rem; }
        .plan-features li::before { content: '→'; color: var(--gold); flex-shrink: 0; }
        .plan-cta { display: block; width: 100%; text-align: center; padding: 0.7rem; border-radius: 4px; font-size: 0.875rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border); color: var(--text); background: transparent; font-family: 'Space Grotesk', sans-serif; transition: all 0.2s; text-decoration: none; }
        .plan.featured .plan-cta { background: var(--gold); color: var(--black); border-color: var(--gold); }
        .plan-cta:hover { opacity: 0.85; }
        .plan-cta-disabled { opacity: 0.5; cursor: default; }
        .plan-cta-disabled:hover { opacity: 0.5; }
        .cap-note { text-align: center; font-size: 0.8rem; color: var(--muted); margin-top: 1.5rem; }
        .cap-note strong { color: var(--gold); }
      `}</style>

      <SiteNav />

      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-copy">
          <span className="eyebrow">Hypixel Skyblock Intelligence</span>
          <h1>Unlock the vault of your <em>Skyblock economy</em></h1>
          <p className="hero-sub">
            Real-time market intelligence, patch analysis, and AI-driven strategy for Hypixel Skyblock — refreshed around the clock so you&rsquo;re never trading on stale data.
          </p>
          <div className="cta-group">
            <Link href="/login" className="btn-primary">Sign in</Link>
            <a href="#pricing" className="btn-ghost">View pricing</a>
          </div>
        </div>
      </section>

      <div className="proof-bar">
        <div className="proof-item">
          <div className="proof-num">{stats ? stats.itemsTracked.toLocaleString() : '—'}</div>
          <div className="proof-label">Items tracked</div>
        </div>
        <div className="proof-item">
          <div className="proof-num">{stats ? stats.priceDataPoints.toLocaleString() : '—'}</div>
          <div className="proof-label">Price data points</div>
        </div>
        <div className="proof-item">
          <div className="proof-num">{stats ? stats.variantDataPoints.toLocaleString() : '—'}</div>
          <div className="proof-label">NBT variants priced</div>
        </div>
        <div className="proof-item">
          <div className="proof-num">24/7</div>
          <div className="proof-label">AI monitoring</div>
        </div>
      </div>

      <section className="section" id="how-it-works">
        <div className="section-label">What you get</div>
        <h2>Intelligence that acts before the market does</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '2rem' }}>
          Every one of the 5 real tabs inside the dashboard, in order. Live recordings of the dashboard in
          action are coming soon — the icon panels below are illustrative, not screenshots.
        </p>

        <div style={{ display: 'grid', gap: '2.5rem' }}>
          {[
            {
              icon: '⚡', name: '#flash-alerts', tier: 'Alert+ (Top 5 preview on Free)',
              desc: 'Live-ranked Bazaar and Auction House opportunities, switchable between the two. Full Top 25 Bazaar flip feed, plus Top 25 per AH category, refreshed continuously as prices move — never a delayed daily digest.',
            },
            {
              icon: '💰', name: '#money-making', tier: 'Pro+ (Vault Exclusive on Elite)',
              desc: 'Two categories per net worth tier — Early (0-50M, 10M/h target), Mid (50-500M, 25M/h), End (500M-5B, 50M/h), Late (5B+, 70M+/h): Active Grind (the best verified skill-based methods for that tier, each with a real gear setup) and Vault Exclusive (non-obvious method innovations discovered by AI, Elite only).',
            },
            {
              icon: '🔧', name: '#patch-analysis', tier: 'Alert+ (live summary only on Free)',
              desc: 'Every patch — live releases and alpha/PTL previews alike — broken down for its direct economic impact: which items were buffed or nerfed, which money-making methods it affects, and what that shifts before the wider playerbase reacts.',
            },
            {
              icon: '📡', name: '#radar', tier: 'Pro+',
              desc: 'A price explorer covering 4,781 items across Bazaar and AH, up to 3 years of history, plus daily AI intelligence: Top Opportunities and Risk Items, each with reasoning, a confidence rating, timeframe, and price target.',
            },
            {
              icon: '🧬', name: '#evolve', tier: 'Pro+ (Daily Missions on Elite)',
              desc: 'Link your Hypixel account and Vault reads your actual profile — skills, slayers, dungeons, collections, equipped gear — instead of guessing. Skills & Milestones show exactly where you stand against the full completion guide, tier by tier. Elite adds Daily Missions: objectives generated from your own remaining gaps.',
            },
          ].map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '1.75rem', alignItems: 'stretch' }} className="feature-row">
              <div className="vault-card" style={{ padding: '1.5rem' }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.35rem' }}>{c.name}</div>
                <div className="pixel" style={{ fontSize: '0.55rem', color: 'var(--gold-dim)', marginBottom: '0.8rem' }}>{c.tier}</div>
                <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.65 }}>{c.desc}</p>
              </div>
              <div className="vault-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1rem' }}>
                <div style={{ fontSize: '2.4rem' }}>{c.icon}</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.4 }}>Live preview<br />coming soon</div>
              </div>
            </div>
          ))}
        </div>

        <style>{`
          @media (max-width: 640px) {
            .feature-row { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <p className="cap-note" style={{ textAlign: 'left', marginTop: '2.5rem' }}>
          Want the same breakdown on its own page? <Link href="/features">See the full feature list →</Link>
        </p>
      </section>

      <section className="section" id="pricing">
        <div className="section-label">Pricing</div>
        <h2>Pick your edge</h2>
        <div className="pricing-grid">
          {PLANS.map((plan) => (
            <div key={plan.key} className={`plan vault-card${plan.featured ? ' featured' : ''}`}>
              {plan.badge && <div className="plan-badge">{plan.badge}</div>}
              <div className="plan-name">{plan.name}</div>
              <div className="plan-price">{plan.price}<span>{plan.period}</span></div>
              <div className="plan-desc">{plan.desc}</div>
              <ul className="plan-features">
                {plan.features.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
              {plan.priceId ? (
                <button className="plan-cta" onClick={() => handleCheckout(plan.priceId!)}>{plan.cta}</button>
              ) : plan.comingSoon ? (
                <span className="plan-cta plan-cta-disabled">{plan.cta}</span>
              ) : (
                <Link href="/login" className="plan-cta">{plan.cta}</Link>
              )}
            </div>
          ))}
        </div>
        <p className="cap-note">
          Capped per game to preserve the competitive edge of every analysis: <strong>1,000</strong> Alert seats,{' '}
          <strong>500</strong> Pro seats, <strong>250</strong> Elite seats — <strong>1,750</strong> premium seats total.
        </p>
      </section>

      <SiteFooter />
    </>
  );
}
