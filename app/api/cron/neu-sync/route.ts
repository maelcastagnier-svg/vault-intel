// app/api/cron/neu-sync/route.ts
// Sync hebdomadaire depuis NotEnoughUpdates-REPO (github.com/NotEnoughUpdates/NotEnoughUpdates-REPO).
// Reconstruit ce qui a été supprimé le 16 juillet (commit 7df1fa4) — cette fois avec des
// mappings vérifiés contre le contenu réel des fichiers (pas des suppositions sur les noms
// de champs), et un log dans sync_log pour que les échecs soient visibles sans creuser.
//
// Deux niveaux :
// 1. TOUJOURS : cache brut de chaque fichier connu dans neu_constants_raw. À lui seul,
//    ça garde une copie fraîche et complète de NEU-REPO même pour les fichiers dont on n'a
//    pas encore écrit le mapping vers une table dédiée.
// 2. POUR CERTAINS FICHIERS : mapping vérifié vers une table dédiée déjà existante en base
//    (reforges, trophy_fish_thresholds, essence_shop_upgrades). Les autres fichiers
//    (pets, gemstones, attribute_shards, bestiary, reforgestones, rift_guide, essencecosts,
//    leveling...) restent en cache brut seulement pour l'instant — leur mapping est repris
//    zone par zone dans le chantier de collecte joueur (Minions, Bestiary, Essence, Rift...),
//    pas ici, pour éviter d'écrire un mapping non vérifié.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NEU_RAW = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants'

// Liste confirmée par listing réel du repo (gh api .../contents/constants) le 23 juillet.
const NEU_FILES = [
  'abiphone.json', 'animatedskulls.json', 'attribute_shards.json', 'bazaarstocks.json',
  'bestiary.json', 'bonuses.json', 'calendar.json', 'carnivalshops.json', 'dyes.json',
  'enchants.json', 'essencecosts.json', 'essenceshops.json', 'fairy_souls.json',
  'garden.json', 'gemstonecosts.json', 'gemstones.json', 'george.json',
  'glacite_tunnel_waypoints.json', 'hoppity.json', 'hotflayout.json', 'hotmlayout.json',
  'islands.json', 'legacyrainbownames.json', 'leveling.json', 'misc.json', 'museum.json',
  'parents.json', 'petnums.json', 'pets.json', 'reforges.json', 'reforgestones.json',
  'resource_pack.json', 'rift_guide.json', 'rngscore.json', 'sacks.json', 'sblevels.json',
  'skymart.json', 'trophyfish.json', 'weight.json', 'zones.json',
]

async function fetchNEU(filename: string): Promise<any> {
  const res = await fetch(`${NEU_RAW}/${filename}`)
  if (!res.ok) throw new Error(`fetch ${filename} failed: ${res.status}`)
  return res.json()
}

// ============================================================
// reforges.json → reforges (reforge_name, item_types, rarity, stats)
// Vérifié : reforgeStats est imbriqué PAR RARETÉ, une ligne par (reforge, rareté).
// ============================================================
async function syncReforges(data: any): Promise<number> {
  const rows: any[] = []
  for (const [name, r] of Object.entries<any>(data)) {
    const itemTypes = r.itemTypes || 'ANY'
    const statsByRarity = r.reforgeStats || {}
    for (const [rarity, stats] of Object.entries(statsByRarity)) {
      rows.push({ reforge_name: name, item_types: itemTypes, rarity, stats })
    }
  }
  if (rows.length === 0) return 0
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase
      .from('reforges')
      .upsert(rows.slice(i, i + 100), { onConflict: 'reforge_name, rarity' })
    if (error) throw new Error('reforges upsert: ' + error.message)
  }
  return rows.length
}

// ============================================================
// trophyfish.json → trophy_fish_thresholds (fish_id, bronze/silver/gold/diamond)
// Vérifié : tableau plat [bronze, silver, gold, diamond], confirmé contre les
// valeurs déjà en base (GUSHER, SULPHUR_SKITTER match exactement).
// ============================================================
async function syncTrophyFish(data: any): Promise<number> {
  const rows = Object.entries<any>(data)
    .filter(([, arr]) => Array.isArray(arr) && arr.length >= 4)
    .map(([fish_id, arr]) => ({
      fish_id,
      bronze_threshold:   arr[0],
      silver_threshold:   arr[1],
      gold_threshold:     arr[2],
      diamond_threshold:  arr[3],
    }))
  if (rows.length === 0) return 0
  const { error } = await supabase
    .from('trophy_fish_thresholds')
    .upsert(rows, { onConflict: 'fish_id' })
  if (error) throw new Error('trophy_fish_thresholds upsert: ' + error.message)
  return rows.length
}

// ============================================================
// essenceshops.json → essence_shop_upgrades (essence_type, upgrade_id, upgrade_name, level, cost)
// Vérifié : essence_type garde le préfixe "ESSENCE_" (confirmé contre les lignes déjà
// en base, ex: "ESSENCE_CRIMSON"), un coût par niveau (index+1) dans costs[].
// ============================================================
async function syncEssenceShops(data: any): Promise<number> {
  const rows: any[] = []
  for (const [essenceType, upgrades] of Object.entries<any>(data)) {
    for (const [upgradeId, u] of Object.entries<any>(upgrades)) {
      const costs = u.costs || []
      costs.forEach((cost: number, idx: number) => {
        rows.push({
          essence_type: essenceType,
          upgrade_id:   upgradeId,
          upgrade_name: u.name || upgradeId,
          level:        idx + 1,
          cost,
        })
      })
    }
  }
  if (rows.length === 0) return 0
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from('essence_shop_upgrades')
      .upsert(rows.slice(i, i + 200), { onConflict: 'essence_type, upgrade_id, level' })
    if (error) throw new Error('essence_shop_upgrades upsert: ' + error.message)
  }
  return rows.length
}

const DERIVED_TARGETS: Record<string, (data: any) => Promise<number>> = {
  'reforges.json':     syncReforges,
  'trophyfish.json':   syncTrophyFish,
  'essenceshops.json': syncEssenceShops,
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('neu-sync')
  const results: Record<string, any> = {}
  let totalRows = 0
  let hadError = false

  for (const filename of NEU_FILES) {
    try {
      const data = await fetchNEU(filename)

      const { error: cacheErr } = await supabase
        .from('neu_constants_raw')
        .upsert(
          { file_path: 'constants/' + filename, content: data, fetched_at: new Date().toISOString() },
          { onConflict: 'file_path' }
        )
      if (cacheErr) throw new Error('raw cache upsert: ' + cacheErr.message)

      let derivedRows = 0
      if (DERIVED_TARGETS[filename]) {
        derivedRows = await DERIVED_TARGETS[filename](data)
      }

      results[filename] = { success: true, derived_rows: derivedRows }
      totalRows += derivedRows
    } catch (err: any) {
      hadError = true
      results[filename] = { success: false, error: err.message }
    }
  }

  const failedFiles = Object.entries(results).filter(([, r]: any) => !r.success)
  await finishSync(
    logId,
    hadError ? (failedFiles.length === NEU_FILES.length ? 'error' : 'partial') : 'success',
    totalRows,
    { files_ok: NEU_FILES.length - failedFiles.length, files_failed: failedFiles.length, results }
  )

  return NextResponse.json({
    success:      !hadError,
    files_synced: NEU_FILES.length - failedFiles.length,
    files_failed: failedFiles.length,
    derived_rows: totalRows,
    results,
  })
}
