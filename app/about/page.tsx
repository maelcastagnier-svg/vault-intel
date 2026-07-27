import Link from 'next/link'
import SiteNav from '../../components/SiteNav'
import SiteFooter from '../../components/SiteFooter'

export const metadata = { title: 'About Vault — Hypixel Skyblock Intelligence' }

export default function About() {
  return (
    <>
      <SiteNav />
      <div className="page-wrap">
        <div className="page-eyebrow">ABOUT VAULT</div>
        <h1>Built for players who take Skyblock seriously</h1>
        <p className="page-updated">An independent, unofficial project — not affiliated with Hypixel Inc. or Mojang.</p>

        <p>
          Hypixel Skyblock&rsquo;s economy moves fast: Bazaar prices shift by the hour, Auction
          House opportunities disappear in minutes, and every patch reshuffles what&rsquo;s actually
          worth farming or flipping. Most players are left piecing it together from memory, scattered
          Discord tips, or YouTube guides that were already stale by the time they were uploaded.
        </p>
        <p>
          Vault exists to close that gap. It&rsquo;s a market intelligence platform built specifically
          for Skyblock&rsquo;s economy — continuously collecting real Bazaar and Auction House data
          (including NBT-variant pricing, not just flat item averages), then using AI analysis to turn
          that raw data into concrete, actionable recommendations instead of a wall of numbers you have
          to interpret yourself.
        </p>

        <h2>What we actually do</h2>
        <p>
          Every signal Vault surfaces — a flash alert, a money-making method, a patch impact
          breakdown — is generated from data Vault collected itself, not guesswork. The pipeline runs
          around the clock: Bazaar and Auction House snapshots, patch notes, item catalogs, and (for
          players who link their account) real profile progression. AI is used specifically to
          interpret and prioritize that data — never to invent a number Vault hasn&rsquo;t actually
          observed.
        </p>

        <h2>Why it&rsquo;s independent</h2>
        <p>
          Vault is not affiliated with, endorsed by, or connected to Hypixel Inc. or Mojang in any
          way. It&rsquo;s a third-party tool built by players, for players, using publicly available
          game data and the official Hypixel API. Access is intentionally capped per game
          (<strong>500 members maximum</strong>) to keep every signal meaningful instead of diluted
          across an unlimited audience.
        </p>

        <h2>Where it&rsquo;s going</h2>
        <p>
          Vault is under active, continuous development — new tracked data sources, deeper
          per-player progression features (Evolve), and expanded market coverage ship regularly as
          the game itself evolves. Nothing here is ever treated as &ldquo;finished&rdquo; if the game
          keeps changing underneath it.
        </p>

        <p style={{ marginTop: '2.5rem' }}>
          Curious what&rsquo;s actually inside the dashboard? <Link href="/features">See the full feature breakdown →</Link>
        </p>

        <Link href="/" className="page-back">← Back to home</Link>
      </div>
      <SiteFooter />
    </>
  )
}
