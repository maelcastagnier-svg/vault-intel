// Route de debug temporaire -- teste les 5 nouveaux crons référentiels avant merge.
// Supprimée après validation.
import { NextResponse } from 'next/server'
import { runWikiMiningForgeSync } from '../../cron/wiki-mining-forge-sync/route'
import { runWikiGardenSync } from '../../cron/wiki-garden-sync/route'
import { runWikiSlotUpgradesSync } from '../../cron/wiki-slot-upgrades-sync/route'
import { runWikiEconomyNpcSync } from '../../cron/wiki-economy-npc-sync/route'
import { runDiscoveryScan } from '../../cron/discovery-scan/route'

export async function GET() {
  const results: Record<string, any> = {}
  results.mining_forge = await runWikiMiningForgeSync()
  results.garden = await runWikiGardenSync()
  results.slot_upgrades = await runWikiSlotUpgradesSync()
  results.economy_npc = await runWikiEconomyNpcSync()
  results.discovery_scan = await runDiscoveryScan()
  return NextResponse.json(results)
}
