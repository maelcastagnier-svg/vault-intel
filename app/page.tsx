'use client'
import Link from "next/link";

async function handleCheckout(priceId: string) {
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId })
  })
  const { url } = await res.json()
  window.location.href = url
}

export default function Home() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        :root {
          --black: #0a0a0a; --white: #f5f4f0; --gold: #c9a84c;
          --gold-dim: #8a6e2f; --gold-glow: rgba(201,168,76,0.12);
          --surface: #111110; --surface2: #1a1917;
          --border: rgba(201,168,76,0.18); --muted: #6b6960; --text: #e8e6df;
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--black); color: var(--text); font-family: 'Space Grotesk', sans-serif; overflow-x: hidden; }
        nav { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem 2.5rem; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: rgba(10,10,10,0.92); backdrop-filter: blur(12px); z-index: 100; }
        .logo { font-family: 'Space Mono', monospace; font-size: 1.15rem; font-weight: 700; color: var(--gold); letter-spacing: 0.12em; text-transform: uppercase; }
        .logo span { color: var(--white); }
        nav a { color: var(--muted); text-decoration: none; font-size: 0.875rem; transition: color 0.2s; }
        nav a:hover { color: var(--gold); }
        .nav-cta { background: var(--gold) !important; color: var(--black) !important; padding: 0.45rem 1.1rem; border-radius: 4px; font-weight: 600; font-size: 0.825rem; }
        .nav-links { display: flex; gap: 2rem; align-items: center; }
        .hero { padding: 7rem 2.5rem 5rem; max-width: 900px; margin: 0 auto; text-align: center; }
        .eyebrow { display: inline-block; font-family: 'Space Mono', monospace; font-size: 0.7rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold); border: 1px solid var(--border); padding: 0.35rem 0.9rem; border-radius: 2px; margin-bottom: 2rem; }
        h1 { font-size: clamp(2.2rem, 5vw, 3.6rem); font-weight: 700; line-height: 1.1; color: var(--white); margin-bottom: 1.5rem; letter-spacing: -0.02em; }
        h1 em { font-style: normal; color: var(--gold); }
        .hero-sub { font-size: 1.1rem; color: var(--muted); max-width: 580px; margin: 0 auto 2.5rem; line-height: 1.7; }
        .hero-sub strong { color: var(--text); font-weight: 500; }
        .cta-group { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
        .btn-primary { background: var(--gold); color: var(--black); padding: 0.85rem 2rem; border-radius: 4px; font-weight: 700; font-size: 0.95rem; text-decoration: none; }
        .btn-ghost { border: 1px solid var(--border); color: var(--text); padding: 0.85rem 2rem; border-radius: 4px; font-size: 0.95rem; text-decoration: none; }
        .proof-bar { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 1.25rem 2.5rem; display: flex; justify-content: center; gap: 3rem; flex-wrap: wrap; }
        .proof-item { text-align: center; }
        .proof-num { font-family: 'Space Mono', monospace; font-size: 1.4rem; font-weight: 700; color: var(--gold); }
        .proof-label { font-size: 0.75rem; color: var(--muted); letter-spacing: 0.05em; text-transform: uppercase; margin-top: 2px; }
        .section { padding: 5rem 2.5rem; max-width: 900px; margin: 0 auto; }
        .section-label { font-family: 'Space Mono', monospace; font-size: 0.65rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold-dim); margin-bottom: 1.25rem; }
        h2 { font-size: clamp(1.6rem, 3.5vw, 2.4rem); font-weight: 700; color: var(--white); line-height: 1.2; margin-bottom: 1.25rem; letter-spacing: -0.02em; }
        .pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-top: 3rem; }
        .plan { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.75rem; position: relative; }
        .plan.featured { border-color: var(--gold); background: var(--surface2); }
        .plan-badge { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); background: var(--gold); color: var(--black); font-size: 0.65rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.2rem 0.75rem; border-radius: 2px; white-space: nowrap; }
        .plan-name { font-family: 'Space Mono', monospace; font-size: 0.7rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.75rem; }
        .plan-price { font-size: 2.2rem; font-weight: 700; color: var(--white); margin-bottom: 0.25rem; }
        .plan-price span { font-size: 0.9rem; font-weight: 400; color: var(--muted); }
        .plan-desc { font-size: 0.8rem; color: var(--muted); margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
        .plan-features { list-style: none; margin-bottom: 1.75rem; }
        .plan-features li { font-size: 0.85rem; color: var(--text); padding: 0.35rem 0; display: flex; gap: 0.6rem; }
        .plan-features li::before { content: '→'; color: var(--gold); flex-shrink: 0; }
        .plan-cta { display: block; width: 100%; text-align: center; padding: 0.7rem; border-radius: 4px; font-size: 0.875rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border); color: var(--text); background: transparent; font-family: 'Space Grotesk', sans-serif; transition: all 0.2s; }
        .plan.featured .plan-cta { background: var(--gold); color: var(--black); border-color: var(--gold); }
        .cap-note { text-align: center; font-size: 0.8rem; color: var(--muted); margin-top: 1.5rem; }
        .cap-note strong { color: var(--gold); }
        .channels-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 2.5rem; }
        .channel { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 1.25rem; }
        .channel-name { font-family: 'Space Mono', monospace; font-size: 0.75rem; color: var(--gold); margin-bottom: 0.5rem; }
        .channel-desc { font-size: 0.8rem; color: var(--muted); line-height: 1.5; }
        footer { border-top: 1px solid var(--border); padding: 2rem 2.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
        footer p { font-size: 0.8rem; color: var(--muted); }
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
        <span className="eyebrow">Hypixel Skyblock Intelligence</span>
        <h1>The edge <em>YouTube</em> will never give you</h1>
        <p className="hero-sub">
          Vault is an AI-powered economy agent that monitors the Bazaar, AH, patches and community signals 24/7 — and delivers <strong>actionable intelligence</strong> directly to you.
        </p>
        <div className="cta-group">
          <a href="#pricing" className="btn-primary">Get Access</a>
          <a href="#how-it-works" className="btn-ghost">See how it works</a>
        </div>
      </section>

      <div className="proof-bar">
        <div className="proof-item"><div className="proof-num">4,624</div><div className="proof-label">Items tracked</div></div>
        <div className="proof-item"><div className="proof-num">112K+</div><div className="proof-label">Price data points</div></div>
        <div className="proof-item"><div className="proof-num">8,412</div><div className="proof-label">Game items indexed</div></div>
        <div className="proof-item"><div className="proof-num">24/7</div><div className="proof-label">AI monitoring</div></div>
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
            <div key={i} className="channel">
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
          <div className="plan">
            <div className="plan-name">Alert</div>
            <div className="plan-price">$4.99<span>/month</span></div>
            <div className="plan-desc">For active traders who want real-time signals</div>
            <ul className="plan-features">
              <li>#flash-alerts (Bazaar + AH)</li>
              <li>#patch-analysis</li>
              <li>Real-time price anomalies</li>
            </ul>
            <button className="plan-cta" onClick={() => handleCheckout('price_1TqY7aBngq0kxKkEbZqcwFZu')}>Get started</button>
          </div>
          <div className="plan featured">
            <div className="plan-badge">Most popular</div>
            <div className="plan-name">Pro</div>
            <div className="plan-price">$9.99<span>/month</span></div>
            <div className="plan-desc">Full intelligence suite for serious players</div>
            <ul className="plan-features">
              <li>Everything in Alert</li>
              <li>#money-making (all 4 tiers)</li>
              <li>#investment-radar</li>
              <li>#ah-sniper</li>
            </ul>
            <button className="plan-cta" onClick={() => handleCheckout('price_1TqY7mBngq0kxKkE2SBQjygJ')}>Get started</button>
          </div>
          <div className="plan">
            <div className="plan-name">Elite</div>
            <div className="plan-price">$19.99<span>/month</span></div>
            <div className="plan-desc">The full Vault experience with exclusive AI insights</div>
            <ul className="plan-features">
              <li>Everything in Pro</li>
              <li>Vault Exclusive opportunities</li>
              <li>AI-generated unique methods</li>
              <li>Priority access to all games</li>
            </ul>
            <button className="plan-cta" onClick={() => handleCheckout('price_1TqY86Bngq0kxKkEdD00nNtx')}>Get started</button>
          </div>
        </div>
        <p className="cap-note">Maximum <strong>500 members</strong> per game to preserve the competitive edge of every analysis.</p>
      </section>

      <footer>
        <p>© 2026 Vault Intelligence. All rights reserved.</p>
        <p>Not affiliated with Hypixel or Mojang.</p>
      </footer>
    </>
  );
}