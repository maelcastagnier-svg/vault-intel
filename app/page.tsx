'use client'
import Link from "next/link";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";

export default function Home() {
  return (
    <>
      <style>{`
        /* Brand hub, not a product page -- no photographic hero (that imagery belongs
           to the Hypixel Skyblock page it is built for), a quiet typographic ground
           instead so this reads as the entry point above the games, not a duplicate
           of the product page one click away. */
        .hub-hero {
          position: relative;
          min-height: clamp(420px, 58vh, 620px);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center;
          background:
            radial-gradient(ellipse 60% 50% at 50% 0%, rgba(232,192,99,0.09), transparent 70%),
            var(--black);
          border-bottom: 1px solid var(--border);
          overflow: hidden;
        }
        .hub-hero::before {
          content: '';
          position: absolute; left: 50%; top: 8%; width: 1px; height: 40%;
          background: linear-gradient(to bottom, transparent, rgba(232,192,99,0.35), transparent);
        }
        .hub-mark {
          width: 46px; height: 46px; margin-bottom: 1.75rem;
          border: 1.5px solid var(--gold);
          border-radius: 3px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 24px rgba(232,192,99,0.18);
          position: relative; z-index: 1;
        }
        .hub-mark::after {
          content: ''; width: 14px; height: 14px; border-radius: 50%;
          border: 1.5px solid var(--gold-bright);
        }
        .hub-eyebrow {
          font-family: 'Press Start 2P', monospace; font-size: 0.6rem; letter-spacing: 0.15em;
          color: var(--gold-bright); margin-bottom: 1.25rem; position: relative; z-index: 1;
        }
        .hub-hero h1 {
          font-size: clamp(2rem, 4.4vw, 3.2rem); font-weight: 700; line-height: 1.14;
          color: var(--white); margin-bottom: 1.1rem; letter-spacing: -0.02em; max-width: 700px;
          position: relative; z-index: 1;
        }
        .hub-hero h1 em { font-style: normal; color: var(--gold-bright); }
        .hub-sub {
          font-size: 1.02rem; color: var(--muted); max-width: 540px; line-height: 1.7;
          position: relative; z-index: 1;
        }

        .games-section { padding-top: 3.5rem; padding-bottom: 1rem; }
        .games-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; margin-top: 2rem; }
        .game-card {
          position: relative; padding: 1.75rem; text-decoration: none; display: block;
          transition: border-color 0.2s, transform 0.2s;
        }
        .game-card:hover { border-color: var(--gold); transform: translateY(-2px); }
        .game-live-badge {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: 'Space Mono', monospace; font-size: 0.65rem; letter-spacing: 0.06em;
          color: #2ecc8f; margin-bottom: 1rem; text-transform: uppercase;
        }
        .game-live-badge::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%; background: #2ecc8f;
          box-shadow: 0 0 8px #2ecc8f;
        }
        .game-name { font-size: 1.25rem; font-weight: 700; color: var(--white); margin-bottom: 0.5rem; }
        .game-desc { font-size: 0.85rem; color: var(--muted); line-height: 1.6; margin-bottom: 1.25rem; }
        .game-enter { font-size: 0.85rem; font-weight: 600; color: var(--gold); }
        .game-card:hover .game-enter { color: var(--gold-bright); }

        .game-card-soon {
          padding: 1.75rem; opacity: 0.55; border-style: dashed;
        }
        .game-soon-badge {
          font-family: 'Space Mono', monospace; font-size: 0.65rem; letter-spacing: 0.06em;
          color: var(--muted); margin-bottom: 1rem; text-transform: uppercase;
        }

        .hub-note { text-align: center; font-size: 0.8rem; color: var(--muted); margin-top: 2.5rem; }
      `}</style>

      <SiteNav />

      <section className="hub-hero">
        <div className="hub-mark" />
        <span className="hub-eyebrow">Vault Intelligence</span>
        <h1>Real-time economic intelligence, <em>one game at a time</em></h1>
        <p className="hub-sub">
          Vault runs a continuous data pipeline — live market prices, patch analysis, AI-driven strategy —
          purpose-built per game rather than bolted on as an afterthought. Pick a game below to enter its dashboard.
        </p>
      </section>

      <section className="section games-section">
        <div className="section-label">Games</div>
        <h2>Where Vault runs today</h2>
        <div className="games-grid">
          <Link href="/hypixel-skyblock" className="game-card vault-card">
            <div className="game-live-badge">Live</div>
            <div className="game-name">Hypixel Skyblock</div>
            <p className="game-desc">
              Real-time Bazaar and Auction House intelligence, patch analysis, market radar, and
              AI-driven money-making strategy — refreshed around the clock.
            </p>
            <div className="game-enter">Enter Hypixel Skyblock →</div>
          </Link>

          <div className="game-card-soon vault-card">
            <div className="game-soon-badge">In development</div>
            <div className="game-name">More games</div>
            <p className="game-desc">
              Hypixel Skyblock is where Vault started. The same data-driven approach is built to extend
              to other games over time.
            </p>
          </div>
        </div>
        <p className="hub-note">
          Already have an account? <Link href="/login" style={{ color: 'var(--gold)' }}>Sign in →</Link>
        </p>
      </section>

      <SiteFooter />
    </>
  );
}
