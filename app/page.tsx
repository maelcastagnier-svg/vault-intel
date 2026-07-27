'use client'
import Link from "next/link";
import { useEffect, useState } from "react";

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
    cta: 'Get started free', featured: false, priceId: null,
  },
  {
    key: 'alert', name: 'Alert', price: '€4.99', period: '/month',
    desc: 'For active traders who want real-time signals',
    features: ['Full Flash Alerts (Bazaar + AH)', 'Full Patch Analysis', 'Real-time price anomalies'],
    cta: 'Get started', featured: false, priceId: PRICES.alert,
  },
  {
    key: 'pro', name: 'Pro', price: '€19.99', period: '/month',
    desc: 'Full intelligence suite for serious players',
    features: ['Everything in Alert', 'Investment Radar', 'Money Making — Active tiers', 'Evolve: Skills & Milestones'],
    cta: 'Get started', featured: true, badge: 'Most popular', priceId: PRICES.pro,
  },
  {
    key: 'elite', name: 'Elite', price: '€39.99', period: '/month',
    desc: 'The full Vault experience with exclusive AI insights',
    features: ['Everything in Pro', 'Money Making — Vault Exclusive', 'Evolve: Daily Missions', 'Early access to new features'],
    cta: 'Get started', featured: false, priceId: PRICES.elite,
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
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        :root {
          --black: #0a0a0a; --white: #f5f4f0; --gold: #c9a84c;
          --gold-bright: #e8c063; --gold-dim: #8a6e2f; --surface: #111110; --surface2: #1a1917;
          --border: rgba(201,168,76,0.18); --muted: #6b6960; --text: #e8e6df;
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--black); color: var(--text); font-family: 'Space Grotesk', sans-serif; overflow-x: hidden; }
        .pixel { font-family: 'Press Start 2P', monospace; }
        nav { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem 2.5rem; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: rgba(10,10,10,0.92); backdrop-filter: blur(12px); z-index: 100; }
        .logo { font-family: 'Press Start 2P', monospace; font-size: 0.9rem; color: var(--gold); letter-spacing: 0.08em; text-shadow: 0 0 12px rgba(232,192,99,0.35); }
        .logo span { color: var(--white); }
        nav a { color: var(--muted); text-decoration: none; font-size: 0.875rem; transition: color 0.2s; }
        nav a:hover { color: var(--gold); }
        .nav-cta { background: var(--gold) !important; color: var(--black) !important; padding: 0.45rem 1.1rem; border-radius: 4px; font-weight: 600; font-size: 0.825rem; }
        .nav-links { display: flex; gap: 2rem; align-items: center; }

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
          background-size: cover; background-position: center 22%;
          background-color: var(--black);
        }
        .hero-bg::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(to bottom, rgba(10,10,10,0.62) 0%, rgba(10,10,10,0.1) 30%, rgba(10,10,10,0.05) 68%, rgba(10,10,10,0.5) 100%);
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
        h1 {
          font-size: clamp(2rem, 4.6vw, 3.4rem); font-weight: 700; line-height: 1.12; color: var(--white); margin-bottom: 1.25rem; letter-spacing: -0.02em;
          text-shadow: 0 2px 4px rgba(0,0,0,0.9), 0 8px 30px rgba(0,0,0,0.85);
        }
        h1 em { font-style: normal; color: var(--gold-bright); }
        .hero-sub {
          font-size: 1.05rem; color: var(--text); max-width: 560px; margin: 0 auto 2.2rem; line-height: 1.7;
          text-shadow: 0 2px 4px rgba(0,0,0,0.9), 0 6px 20px rgba(0,0,0,0.8);
        }
        .cta-group { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
        .btn-primary { background: var(--gold); color: var(--black); padding: 0.85rem 2rem; border-radius: 4px; font-weight: 700; font-size: 0.95rem; text-decoration: none; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        .btn-ghost { border: 1px solid rgba(232,192,99,0.55); background: rgba(10,9,7,0.4); backdrop-filter: blur(4px); color: var(--white); padding: 0.85rem 2rem; border-radius: 4px; font-size: 0.95rem; text-decoration: none; }

        .proof-bar { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 1.5rem 2.5rem; display: flex; justify-content: center; gap: 3rem; flex-wrap: wrap; }
        .proof-item { text-align: center; }
        .proof-num { font-family: 'Space Mono', monospace; font-size: 1.4rem; font-weight: 700; color: var(--gold); }
        .proof-label { font-family: 'Press Start 2P', monospace; font-size: 0.55rem; color: var(--muted); letter-spacing: 0.05em; margin-top: 6px; }

        .section { padding: 5rem 2.5rem; max-width: 960px; margin: 0 auto; }
        .section-label { font-family: 'Press Start 2P', monospace; font-size: 0.55rem; letter-spacing: 0.15em; color: var(--gold-dim); margin-bottom: 1.25rem; }
        h2 { font-size: clamp(1.6rem, 3.5vw, 2.4rem); font-weight: 700; color: var(--white); line-height: 1.2; margin-bottom: 1.25rem; letter-spacing: -0.02em; }

        /* shared "vault UI panel" treatment: thin gold border + 4 gold corner-bracket
           accents (CSS-only, via layered background gradients -- no extra markup) --
           this is the DA language carried from the hero image into the rest of the page. */
        .vault-card {
          position: relative;
          background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
          background-image:
            linear-gradient(var(--gold-bright), var(--gold-bright)), linear-gradient(var(--gold-bright), var(--gold-bright)),
            linear-gradient(var(--gold-bright), var(--gold-bright)), linear-gradient(var(--gold-bright), var(--gold-bright)),
            linear-gradient(var(--gold-bright), var(--gold-bright)), linear-gradient(var(--gold-bright), var(--gold-bright)),
            linear-gradient(var(--gold-bright), var(--gold-bright)), linear-gradient(var(--gold-bright), var(--gold-bright));
          background-repeat: no-repeat;
          background-size: 2px 14px, 14px 2px, 2px 14px, 14px 2px, 2px 14px, 14px 2px, 2px 14px, 14px 2px;
          background-position: 0 0, 0 0, 100% 0, 100% 0, 0 100%, 0 100%, 100% 100%, 100% 100%;
        }

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
        .cap-note { text-align: center; font-size: 0.8rem; color: var(--muted); margin-top: 1.5rem; }
        .cap-note strong { color: var(--gold); }

        .channels-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 2.5rem; }
        .channel { padding: 1.25rem; }
        .channel-name { font-family: 'Press Start 2P', monospace; font-size: 0.65rem; color: var(--gold); margin-bottom: 0.75rem; }
        .channel-desc { font-size: 0.8rem; color: var(--muted); line-height: 1.5; }

        footer { border-top: 1px solid var(--border); padding: 2rem 2.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
        footer p { font-size: 0.8rem; color: var(--muted); }
        footer a { color: var(--muted); text-decoration: none; }
        footer a:hover { color: #c9a84c; }
      `}</style>

      <nav>
        <div className="logo">VAULT<span>.</span></div>
        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <Link href="/login" className="nav-cta">Access Dashboard</Link>
        </div>
      </nav>

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
        <div className="channels-grid">
          {[
            { name: "#flash-alerts", desc: "Real-time Bazaar + AH price anomalies. Top 3 trades to execute right now." },
            { name: "#money-making", desc: "4 tier tables (Early/Mid/End/Late game) with Bazaar flips, AH flips, farming methods and Vault exclusive opportunities." },
            { name: "#patch-analysis", desc: "Every patch analyzed for economic impact — items affected, meta shifts, investment windows." },
            { name: "#investment-radar", desc: "Mid and long term positions. What to accumulate now, what to sell before the market moves." },
            { name: "#ah-sniper", desc: "AH opportunities detected in real-time. Items listed below market value with buy/relist targets." },
          ].map((c, i) => (
            <div key={i} className="channel vault-card">
              <div className="channel-name">{c.name}</div>
              <div className="channel-desc">{c.desc}</div>
            </div>
          ))}
        </div>
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
              ) : (
                <Link href="/login" className="plan-cta">{plan.cta}</Link>
              )}
            </div>
          ))}
        </div>
        <p className="cap-note">Maximum <strong>500 members</strong> per game to preserve the competitive edge of every analysis.</p>
      </section>

      <footer>
        <p>© 2026 Vault Intelligence. All rights reserved.</p>
        <p>Not affiliated with Hypixel or Mojang. <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
      </footer>
    </>
  );
}
