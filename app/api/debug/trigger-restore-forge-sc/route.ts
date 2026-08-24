// TEMPORAIRE -- verifie les nouveaux enchants Combat (Thunderlord/Fire
// Aspect/Inferno/Habanero/Tabasco/Looting/Scavenger, 23 aout) sur les 3
// fichiers Combat 7-tiers. A supprimer apres verification.
import { NextResponse } from 'next/server'
import { computeAndPersistAllSlayerRankings } from '../../../../lib/pluton-slayer'
import { computeAndPersistBestiaryRankings } from '../../../../lib/pluton-bestiary'
import { computeAndPersistSeaCreatureRankings } from '../../../../lib/pluton-sea-creatures'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const out: Record<string, any> = {}
  try {
    const slayer = await computeAndPersistAllSlayerRankings()
    out.slayer = { ok: true, count: slayer.length }
  } catch (e: any) { out.slayer = { ok: false, error: e.message } }
  try {
    const bestiary = await computeAndPersistBestiaryRankings()
    out.bestiary = { ok: true, ...bestiary }
  } catch (e: any) { out.bestiary = { ok: false, error: e.message } }
  try {
    const sc = await computeAndPersistSeaCreatureRankings()
    out.sea_creatures = { ok: true, count: sc.length }
  } catch (e: any) { out.sea_creatures = { ok: false, error: e.message } }
  return NextResponse.json(out)
}
