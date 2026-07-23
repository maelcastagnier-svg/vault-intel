import Link from 'next/link'

export const metadata = { title: 'Terms of Service — Vault' }

export default function Terms() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; color: #e8e6df; font-family: 'Space Grotesk', sans-serif; }
        .wrap { max-width: 720px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }
        .logo { font-family: 'Space Mono', monospace; font-size: 1rem; font-weight: 700; color: #c9a84c; letter-spacing: 0.12em; text-decoration: none; }
        .updated { font-size: 0.8rem; color: #6b6960; margin: 0.5rem 0 2.5rem; }
        h1 { font-size: 1.6rem; margin: 2rem 0 0.5rem; }
        h2 { font-size: 1.05rem; color: #c9a84c; margin: 2rem 0 0.6rem; }
        p, li { font-size: 0.9rem; line-height: 1.65; color: #cfcdc4; }
        ul { margin: 0.5rem 0 0.5rem 1.2rem; }
        a { color: #c9a84c; }
        .back { display: inline-block; margin-top: 3rem; font-size: 0.85rem; color: #6b6960; text-decoration: none; }
      `}</style>
      <div className="wrap">
        <Link href="/" className="logo">VAULT.</Link>
        <h1>Terms of Service</h1>
        <p className="updated">Last updated: July 23, 2026</p>

        <h2>1. What Vault is</h2>
        <p>Vault Intelligence ("Vault", "we", "us") is a subscription dashboard that provides AI-generated
        economic intelligence for Hypixel Skyblock — market data, patch analysis, and (for your own linked
        Hypixel account) personalized progression suggestions. Vault is an independent, unofficial project
        and is <strong>not affiliated with, endorsed by, or connected to Hypixel Inc. or Mojang Studios</strong>.
        All Hypixel Skyblock trademarks and game data belong to their respective owners.</p>

        <h2>2. Accounts</h2>
        <p>You need a Vault account to use the service. You're responsible for keeping your login credentials
        confidential and for all activity under your account. Provide accurate information when you sign up.</p>

        <h2>3. Linking a Hypixel account</h2>
        <p>You may link one Hypixel/Minecraft account to your Vault account. A given Hypixel account can only
        be linked to one Vault account at a time (first claim). Your SkyBlock progress data is fetched from
        Hypixel's public API only when you explicitly trigger a sync.</p>

        <h2>4. Subscriptions & billing</h2>
        <p>Paid plans are billed through Stripe on a recurring basis. You can cancel anytime from your Profile
        page — cancellation stops future billing and you keep access until the end of the current billing
        period. Deleting your account cancels any active subscription immediately.</p>

        <h2>5. Acceptable use</h2>
        <ul>
          <li>Don't attempt to circumvent access controls or scrape the dashboard/API beyond normal use.</li>
          <li>Don't use the service to abuse or overload Hypixel's own API.</li>
          <li>Don't share your account credentials with others.</li>
        </ul>

        <h2>6. Data accuracy disclaimer</h2>
        <p>Market data, price estimates, and AI-generated analysis are provided "as is" for informational
        purposes only. Skyblock's game mechanics and economy change over time (patches, market shifts) —
        Vault does not guarantee accuracy, completeness, or any particular financial outcome from following
        its suggestions.</p>

        <h2>7. Termination</h2>
        <p>We may suspend or terminate accounts that violate these terms. You may delete your own account at
        any time from your <Link href="/profile">Profile</Link> page — see our <Link href="/privacy">Privacy
        Policy</Link> for exactly what that removes.</p>

        <h2>8. Changes to these terms</h2>
        <p>We may update these terms as the product evolves. Material changes will be reflected here with an
        updated date.</p>

        <h2>9. Contact</h2>
        <p>Questions about these terms: <a href="mailto:support@vault-intel.app">support@vault-intel.app</a>.</p>

        <Link href="/" className="back">← Back to Vault</Link>
      </div>
    </>
  )
}
