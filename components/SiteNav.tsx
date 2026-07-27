import Link from 'next/link'

export default function SiteNav() {
  return (
    <nav className="nav">
      <Link href="/" className="nav-logo">VAULT<span>.</span></Link>
      <div className="nav-links">
        <Link href="/features">Features</Link>
        <Link href="/about">About</Link>
        <Link href="/#pricing">Pricing</Link>
        <Link href="/login" className="nav-cta">Sign in</Link>
      </div>
    </nav>
  )
}
