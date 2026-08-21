// Route de debug TEMPORAIRE -- verification Bestiary/grind mob generique
// avant cron. A supprimer apres validation.
import { NextResponse } from 'next/server'
import { computeAndPersistBestiaryRankings, computeBestiaryCandidates } from '../../../../lib/pluton-bestiary'

export const maxDuration = 60

export async function GET(request: Request) {
  const url = new URL(request.url)
  try {
    if (url.searchParams.get('dry') === '1') {
      const candidates = await computeBestiaryCandidates()
      return NextResponse.json({
        success: true,
        total: candidates.length,
        viable: candidates.filter(c => c.hp > 0 && c.guaranteed_ev > 0),
        skipped_hp: candidates.filter(c => c.skipped_reason === 'hp_unparseable').length,
        skipped_no_drop: candidates.filter(c => c.skipped_reason === 'no_priced_guaranteed_drop').length,
      })
    }
    const result = await computeAndPersistBestiaryRankings()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
