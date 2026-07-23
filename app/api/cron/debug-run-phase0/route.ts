// TEMPORAIRE — teste neu-sync/skyblock-resources-sync/wiki-auto-sync en conditions
// réelles juste après déploiement, sans exposer CRON_SECRET côté client (relit la
// vraie valeur server-side et l'utilise en interne). Supprimé une fois validé.
import { NextResponse } from 'next/server'

const BASE = 'https://vault-intel-iota.vercel.app'

async function call(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const body = await res.json().catch(() => ({ parse_error: true }))
  return { status: res.status, body }
}

export async function GET() {
  const neu     = await call('/api/cron/neu-sync')
  const hypixel = await call('/api/cron/skyblock-resources-sync')
  const wiki    = await call('/api/cron/wiki-auto-sync')

  return NextResponse.json({ neu, hypixel, wiki })
}
