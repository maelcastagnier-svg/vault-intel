// Route de debug temporaire -- verification des 2 lignes zone_mob_stats
// ajoutees (Sheep/Rabbit, byproducts Farming Collections officielles) apres
// l'audit du 25 aout. Croissance negligeable (107->109 mobs, +1.9%), pas de
// scoping necessaire. A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistBestiaryRankings } from '../../../../lib/pluton-bestiary'

export const maxDuration = 100
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await computeAndPersistBestiaryRankings()
    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
  }
}
