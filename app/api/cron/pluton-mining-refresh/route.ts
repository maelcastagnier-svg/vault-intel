// app/api/cron/pluton-mining-refresh/route.ts
// Automatise ce qui manquait dans le pont mécanique Pluton (audit du 17 août) :
// computeAndPersistAllMiningRankings() existe et est validée depuis le 5 août
// (lib/pluton-mining.ts) mais n'était appelée que manuellement via une route
// de debug -- pluton_setups/pluton_rankings (activity_key='mining') n'avaient
// plus été recalculées depuis 12 jours, aucun cron ne les rafraîchissait.
//
// Ce cron ne réécrit AUCUNE formule -- il rejoue exactement la même fonction
// déjà validée, sur un rythme régulier, pour que real_cost/coins_per_hour
// restent recroisés sur des prix AH/Bazaar récents plutôt que figés au 5 août.
// La généralisation du moteur de calcul (Phase C, PLUTON-ARCHITECTURE.md) et
// les 5 autres activités restent un chantier séparé, pas fait ici.
import { NextResponse } from 'next/server'
import { computeAndPersistAllMiningRankings } from '../../../../lib/pluton-mining'
import { computeAndPersistForgeRankings } from '../../../../lib/pluton-forge'
import { startSync, finishSync } from '../../../../lib/sync-log'

// 120->280 (22 aout) -- sync_log confirmait des runs reels a 111-120s AVANT
// l'ajout Recombobulator (deja a la limite), et un run reel a depasse 120s
// et est reste bloque en 'running' (id 42126, jamais fini) pendant l'audit
// de cette session -- marge de securite augmentee, aucune formule changee.
export const maxDuration = 280

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-mining-refresh')
  try {
    const results = await computeAndPersistAllMiningRankings()
    const withSetup = results.filter(r => r.has_setup).length
    // Forge (21 aout) -- methode additive au meme activity_key='mining',
    // rejouee dans le meme cron (meme skill, meme cadence). Scoping additif
    // deja garanti par computeAndPersistForgeRankings() (blocs FORGE_* seuls).
    const forge = await computeAndPersistForgeRankings()
    const result = { success: true, combos: results.length, with_setup: withSetup, without_setup: results.length - withSetup, forge_recipes: forge.recipes, forge_viable: forge.viable }
    await finishSync(logId, 'success', withSetup, result)
    return NextResponse.json(result)
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
