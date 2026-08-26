import { NextResponse } from 'next/server'
import { computeBestiaryCandidates } from '../../../../lib/pluton-bestiary'

export const dynamic = 'force-dynamic'

const NAMES = ['Redstone Pigman', 'Emerald Slime', 'Automaton', 'Sludge', 'Enderman', 'Voidling Fanatic', 'Voidling Extremist', 'Brood Mother', 'Scatha', 'Worm', 'Star Sentry', 'Powder Ghast']

export async function GET() {
  const all = await computeBestiaryCandidates()
  const filtered = all.filter(r => NAMES.includes(r.name))
  return NextResponse.json({ count: filtered.length, results: filtered })
}
