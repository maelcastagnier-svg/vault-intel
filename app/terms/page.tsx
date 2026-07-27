import Link from 'next/link'
import SiteNav from '../../components/SiteNav'
import SiteFooter from '../../components/SiteFooter'

export const metadata = { title: 'Terms of Service — Vault' }

export default function Terms() {
  return (
    <>
      <SiteNav />
      <div className="page-wrap">
        <div className="page-eyebrow">LEGAL</div>
        <h1>Terms of Service</h1>
        <p className="page-updated">Last updated: July 27, 2026</p>

        <h2>1. What Vault is</h2>
        <p>Vault Intelligence (&quot;Vault&quot;, &quot;we&quot;, &quot;us&quot;) is a subscription dashboard that provides AI-generated
        economic intelligence for Hypixel Skyblock — market data, patch analysis, and (for your own linked
        Hypixel account) personalized progression suggestions. Vault is an independent, unofficial project
        and is <strong>not affiliated with, endorsed by, or connected to Hypixel Inc. or Mojang Studios</strong>.
        All Hypixel Skyblock trademarks and game data belong to their respective owners.</p>

        <h2>2. Eligibility</h2>
        <p>You must be at least 13 years old to create a Vault account. By signing up, you confirm that you meet
        this age requirement and that any information you provide is accurate.</p>

        <h2>3. Accounts</h2>
        <p>You need a Vault account to use the service. You&rsquo;re responsible for keeping your login credentials
        confidential and for all activity under your account. Provide accurate information when you sign up.</p>

        <h2>4. Linking a Hypixel account</h2>
        <p>You may link one Hypixel/Minecraft account to your Vault account. A given Hypixel account can only
        be linked to one Vault account at a time (first claim). Your SkyBlock progress data is fetched from
        Hypixel&rsquo;s public API only when you explicitly trigger a sync.</p>

        <h2>5. Subscriptions & billing</h2>
        <p>Paid plans are billed through Stripe on a recurring basis. Each tier is seat-capped per game to keep
        every analysis meaningful: <strong>1,000</strong> Alert seats, <strong>500</strong> Pro seats,{' '}
        <strong>250</strong> Elite seats (<strong>1,750</strong> premium seats total). You can cancel anytime
        from your Profile page — cancellation stops future billing and you keep access until the end of the
        current billing period. Deleting your account cancels any active subscription immediately. Except
        where required by applicable law or described in Section 6 below, payments already made are
        non-refundable.</p>

        <h2>6. Right of withdrawal (EU/UK consumers)</h2>
        <p>If you are a consumer in the European Union or United Kingdom, you generally have the right to
        withdraw from an online purchase within <strong>14 days</strong> without giving a reason, under the EU
        Consumer Rights Directive (2011/83/EU) and equivalent UK law. Because Vault grants immediate access to
        digital content and services upon subscribing, by completing checkout you expressly request immediate
        access and acknowledge that <strong>your right of withdrawal is lost once the service has begun</strong>,
        consistent with the digital-content exception in that same directive. If you believe this does not
        apply to your situation, contact us at <a href="mailto:support@vault-intel.app">support@vault-intel.app</a>{' '}
        before subscribing and we will clarify your options.</p>

        <h2>7. Acceptable use</h2>
        <ul>
          <li>Don&rsquo;t attempt to circumvent access controls or scrape the dashboard/API beyond normal use.</li>
          <li>Don&rsquo;t use the service to abuse or overload Hypixel&rsquo;s own API.</li>
          <li>Don&rsquo;t share your account credentials with others.</li>
        </ul>

        <h2>8. Intellectual property</h2>
        <p>The Vault dashboard, its analysis, design, and underlying software are owned by Vault Intelligence.
        You may use them only as intended through the service itself — not copied, resold, or redistributed.
        Hypixel Skyblock, its trademarks, and its underlying game data belong to Hypixel Inc. and Mojang
        Studios; Vault claims no ownership over them and uses them only under fair use / by reference to
        describe the game the service analyzes.</p>

        <h2>9. Third-party services</h2>
        <p>Vault depends on third-party infrastructure — Hypixel&rsquo;s public API, Supabase, Stripe, Vercel, and
        Anthropic — to operate. We are not responsible for outages, data inaccuracies, or service interruptions
        originating from these third parties, including temporary unavailability of the Hypixel API itself.</p>

        <h2>10. Data accuracy disclaimer</h2>
        <p>Market data, price estimates, and AI-generated analysis are provided &quot;as is&quot; for informational
        purposes only. Skyblock&rsquo;s game mechanics and economy change over time (patches, market shifts) —
        Vault does not guarantee accuracy, completeness, or any particular financial outcome from following
        its suggestions.</p>

        <h2>11. Disclaimer of warranties</h2>
        <p>The service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, express or
        implied, including merchantability, fitness for a particular purpose, or non-infringement. We do not
        warrant that the service will be uninterrupted, error-free, or fully secure.</p>

        <h2>12. Limitation of liability</h2>
        <p>To the maximum extent permitted by law, Vault Intelligence will not be liable for any indirect,
        incidental, or consequential damages arising from your use of the service, including losses related to
        in-game or real-world financial decisions made based on Vault&rsquo;s analysis. Our total liability for
        any claim relating to the service is limited to the amount you paid us in the 12 months preceding the
        claim. Nothing in these terms limits liability that cannot be limited under applicable law (for
        example, liability for fraud or gross negligence where required by your local consumer protection law).</p>

        <h2>13. Termination</h2>
        <p>We may suspend or terminate accounts that violate these terms. You may delete your own account at
        any time from your <Link href="/profile">Profile</Link> page — see our <Link href="/privacy">Privacy
        Policy</Link> for exactly what that removes.</p>

        <h2>14. Governing law</h2>
        <p>These terms are governed by the laws applicable to Vault Intelligence&rsquo;s place of operation,
        without regard to conflict-of-law principles. <em>(Specific jurisdiction to be finalized.)</em> If you
        are a consumer, this does not deprive you of any mandatory consumer-protection rights granted by the
        law of your own country of residence.</p>

        <h2>15. Force majeure</h2>
        <p>We are not liable for delays or failures in performance resulting from causes beyond our reasonable
        control, including outages of third-party infrastructure we depend on (Section 9) or the Hypixel API
        itself.</p>

        <h2>16. Severability & entire agreement</h2>
        <p>If any provision of these terms is found unenforceable, the remaining provisions stay in effect.
        These terms, together with our <Link href="/privacy">Privacy Policy</Link>, are the entire agreement
        between you and Vault regarding the service.</p>

        <h2>17. Changes to these terms</h2>
        <p>We may update these terms as the product evolves. Material changes will be reflected here with an
        updated date.</p>

        <h2>18. Contact</h2>
        <p>Questions about these terms: <a href="mailto:support@vault-intel.app">support@vault-intel.app</a>.</p>

        <Link href="/" className="page-back">← Back to Vault</Link>
      </div>
      <SiteFooter />
    </>
  )
}
