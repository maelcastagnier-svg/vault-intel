// app/api/debug/trigger-neu-sync/route.ts
// TEMPORAIRE -- vérification en conditions réelles du batch NEU-REPO du 3 août
// (attribute_shards/bestiary/bonuses/essencecosts/carnivalshops/pets/bazaarstocks +
// npc_locations/glacite_tunnel_waypoints automatisés). Supprimée après validation.
import { NextResponse } from 'next/server'
import { runNeuSync } from '../../cron/neu-sync/route'

export const maxDuration = 120

export async function GET() {
  try {
    return NextResponse.json(await runNeuSync())
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
