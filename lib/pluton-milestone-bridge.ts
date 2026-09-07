// lib/pluton-milestone-bridge.ts
// Phase C V1 (1er sept, plan joyful-shimmying-finch.md Partie 3) -- pont
// Pluton -> Evolve, scope reduit et honnete.
//
// UNIQUEMENT milestone_tasks.requirement->>'type' = 'collection' (239
// lignes verifiees en base). `type='skill'` (61 lignes, {level, skill}) et
// tous les autres types (boss_kill/dungeon_floor_played/bank_tier/etc.)
// restent EXPLICITEMENT hors scope V1 -- Pluton ne calcule un rendement
// qu'en coins/h, jamais en XP/heure ou en progression de jalon generique,
// nulle part dans le projet. Construire ce modele pour type='skill'
// necessiterait d'inventer un ratio stat->XP/h qu'aucune source du projet
// ne fournit -- violerait directement la regle #7. Documente comme limite
// reelle, pas cache.
//
// Architecture : jamais toucher `pluton_setups` (colonnes pricing NOT NULL
// qui seraient fausses/hors-sujet ici) -- nouvelle table soeur
// `milestone_optimal_setups`. Ce pont ne RECALCULE rien : il resout
// item_name -> items_catalog.item_id -> pluton_target_blocks.sell_item_id
// -> meilleur pluton_rankings (bridge_exclude_reason IS NULL) deja
// persiste pour ce tier exact, et copie ce setup tel quel comme "chemin le
// plus rapide connu vers cette collection". Verifie manuellement sur un cas
// connu (Cobblestone/starter -> Mining, actions_per_hour=18000,
// BANDAGED_MITHRIL_PICKAXE + Flamebreaker Armor, coins_per_hour=13754.74)
// AVANT d'etendre a l'ensemble -- resultat exact confirme en base avant
// d'ecrire ce fichier.
//
// Couverture reelle mesuree avant construction (funnel honnete, pas
// suppose) : 239 lignes collection -> 204 resolvent un item_id reel via
// items_catalog -> 110 trouvent un pluton_target_block par sell_item_id ->
// 95 ont un pluton_rankings non-exclu pour LEUR tier precis. Les ~144
// lignes restantes ne sont PAS silencieusement omises : chaque etape du
// funnel qui echoue est enregistree dans `match_status`, jamais une ligne
// disparue sans trace.
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Alias de nom d'affichage verifies un par un contre items_catalog (jamais
// devine) : milestone_tasks nomme la collection ("Wood") differemment de
// items_catalog ("Log"), meme item reel des deux cotes -- confirme par
// requete directe le 1er sept (ex: "Acacia Wood" -> items_catalog.item_id=
// LOG_2 "Acacia Log", target block foraging ACACIA_LOG existant). "Mushroom"
// (nom de la collection Farming) -> items_catalog "Brown Mushroom"
// (BROWN_MUSHROOM), le drop reel de la culture, deja target block
// farming/MUSHROOM. Resolution de synonyme, pas une donnee de jeu inventee.
const ITEM_NAME_ALIASES: Record<string, string> = {
  'acacia wood': 'acacia log',
  'birch wood': 'birch log',
  'dark oak wood': 'dark oak log',
  'jungle wood': 'jungle log',
  'oak wood': 'oak log',
  'mushroom': 'brown mushroom',
}

// PostgREST/Supabase plafonne chaque reponse a 1000 lignes par defaut --
// piege deja documente ailleurs dans ce projet sous d'autres formes
// (inserts un-par-un qui timeout, etc.), ici sous sa forme lecture : un
// simple .select() sur items_catalog/pluton_rankings/pluton_setups (qui
// depassent tous 1000 lignes) tronquerait silencieusement le resultat --
// trouve en verifiant manuellement Cobblestone/starter (tool_item_id/
// armor_set_prefix ressortaient NULL alors que la ligne pluton_setups
// source les a bien) AVANT tout deploiement du cron. Pagine explicitement
// par lots de 1000 jusqu'a epuisement.
async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const pageSize = 1000
  const out: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw new Error(`Pagination fetch failed: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

export type MilestoneBridgeReport = {
  total_collection_tasks: number
  matched: number
  item_id_unresolved: number
  no_target_block: number
  no_ranking_for_tier: number
}

export async function computeAndPersistMilestoneOptimalSetups(): Promise<MilestoneBridgeReport> {
  // Filtre en JS (pas un filtre PostgREST sur le JSON) -- meme convention
  // deja etablie par app/api/player/milestones/route.ts (`row.requirement.
  // type === 'collection'`), evite toute ambiguite de syntaxe d'operateur
  // JSON cote supabase-js.
  const { data: allTasks, error: tasksErr } = await supabase
    .from('milestone_tasks')
    .select('id, tier, requirement')
  if (tasksErr) throw new Error(`milestone_tasks fetch failed: ${tasksErr.message}`)
  const tasks = (allTasks || []).filter(t => (t.requirement as any)?.type === 'collection')
  if (tasks.length === 0) throw new Error('Aucune ligne milestone_tasks type=collection -- verifier la source')

  const catalog = await fetchAllPages<{ item_id: string; item_name: string | null }>((from, to) =>
    supabase.from('items_catalog').select('item_id, item_name').range(from, to)
  )
  const itemIdByName = new Map<string, string>()
  for (const row of catalog) {
    if (row.item_name) itemIdByName.set(row.item_name.toLowerCase(), row.item_id)
  }

  const blocks = await fetchAllPages<{ id: number; activity_key: string; sell_item_id: string | null }>((from, to) =>
    supabase.from('pluton_target_blocks').select('id, activity_key, sell_item_id').range(from, to)
  )
  const blocksBySellItemId = new Map<string, { id: number; activity_key: string }[]>()
  for (const b of blocks) {
    if (!b.sell_item_id) continue
    const list = blocksBySellItemId.get(b.sell_item_id) || []
    list.push({ id: b.id, activity_key: b.activity_key })
    blocksBySellItemId.set(b.sell_item_id, list)
  }

  const targetBlockIds = blocks.map(b => b.id)
  type RankingRow = { target_block_id: number; tier: string; setup_id: number; actions_per_hour: number; yield_per_hour: number; coins_per_hour_raw_block_only: number; rank: number }
  const rankings = await fetchAllPages<RankingRow>((from, to) =>
    supabase.from('pluton_rankings')
      .select('target_block_id, tier, setup_id, actions_per_hour, yield_per_hour, coins_per_hour_raw_block_only, rank')
      .in('target_block_id', targetBlockIds)
      .is('bridge_exclude_reason', null)
      .range(from, to)
  )
  const bestRankingByBlockTier = new Map<string, RankingRow>()
  for (const r of rankings) {
    const key = `${r.target_block_id}__${r.tier}`
    const existing = bestRankingByBlockTier.get(key)
    if (!existing || r.rank < existing.rank) bestRankingByBlockTier.set(key, r)
  }

  // setupIds peut depasser 4000 entrees -- un seul .in() avec une liste
  // aussi longue produirait une URL demesuree (risque de troncature cote
  // serveur HTTP, distinct du plafond 1000-lignes ci-dessus). Chunk par
  // lots de 300, meme discipline que les inserts par lots de 200 deja
  // etablie ailleurs dans ce projet (Enchanted Books, gemstone flip...).
  const setupIds = Array.from(new Set(rankings.map(r => r.setup_id)))
  type SetupRow = { id: number; tool_item_id: string | null; armor_set_prefix: string | null }
  const setups: SetupRow[] = []
  for (let i = 0; i < setupIds.length; i += 300) {
    const idBatch = setupIds.slice(i, i + 300)
    const batchRows = await fetchAllPages<SetupRow>((from, to) =>
      supabase.from('pluton_setups').select('id, tool_item_id, armor_set_prefix').in('id', idBatch).range(from, to)
    )
    setups.push(...batchRows)
  }
  const setupById = new Map(setups.map(s => [s.id, s]))

  const rows: any[] = []
  const report: MilestoneBridgeReport = { total_collection_tasks: tasks.length, matched: 0, item_id_unresolved: 0, no_target_block: 0, no_ranking_for_tier: 0 }

  for (const task of tasks) {
    const req = task.requirement as { item_name?: string }
    const itemName = req.item_name || ''
    const tier = String(task.tier).toLowerCase()
    const normalizedName = itemName.toLowerCase()
    const itemId = itemIdByName.get(normalizedName) ?? itemIdByName.get(ITEM_NAME_ALIASES[normalizedName] ?? '')

    if (!itemId) {
      rows.push({ milestone_task_id: task.id, tier, item_name: itemName, item_id: null, activity_key: null, target_block_id: null, setup_id: null, actions_per_hour: null, yield_per_hour: null, coins_per_hour_raw_block_only: null, tool_item_id: null, armor_set_prefix: null, match_status: 'item_id_unresolved' })
      report.item_id_unresolved++
      continue
    }

    const candidateBlocks = blocksBySellItemId.get(itemId) || []
    if (candidateBlocks.length === 0) {
      rows.push({ milestone_task_id: task.id, tier, item_name: itemName, item_id: itemId, activity_key: null, target_block_id: null, setup_id: null, actions_per_hour: null, yield_per_hour: null, coins_per_hour_raw_block_only: null, tool_item_id: null, armor_set_prefix: null, match_status: 'no_target_block' })
      report.no_target_block++
      continue
    }

    // Plusieurs target_blocks peuvent partager le meme sell_item_id (ex:
    // methodes multiples). Retient le meilleur coins_per_hour reel parmi
    // tous les candidats pour ce tier precis -- jamais le premier trouve.
    let best: { block: { id: number; activity_key: string }; ranking: RankingRow; setup: SetupRow | undefined } | null = null
    for (const block of candidateBlocks) {
      const ranking = bestRankingByBlockTier.get(`${block.id}__${tier}`)
      if (!ranking) continue
      if (!best || Number(ranking.coins_per_hour_raw_block_only) > Number(best.ranking.coins_per_hour_raw_block_only)) {
        best = { block, ranking, setup: setupById.get(ranking.setup_id) }
      }
    }

    if (!best) {
      rows.push({ milestone_task_id: task.id, tier, item_name: itemName, item_id: itemId, activity_key: candidateBlocks[0].activity_key, target_block_id: candidateBlocks[0].id, setup_id: null, actions_per_hour: null, yield_per_hour: null, coins_per_hour_raw_block_only: null, tool_item_id: null, armor_set_prefix: null, match_status: 'no_ranking_for_tier' })
      report.no_ranking_for_tier++
      continue
    }

    rows.push({
      milestone_task_id: task.id, tier, item_name: itemName, item_id: itemId,
      activity_key: best.block.activity_key, target_block_id: best.block.id, setup_id: best.ranking.setup_id,
      actions_per_hour: best.ranking.actions_per_hour, yield_per_hour: best.ranking.yield_per_hour,
      coins_per_hour_raw_block_only: best.ranking.coins_per_hour_raw_block_only,
      tool_item_id: best.setup?.tool_item_id ?? null, armor_set_prefix: best.setup?.armor_set_prefix ?? null,
      match_status: 'matched',
    })
    report.matched++
  }

  await supabase.from('milestone_optimal_setups').delete().neq('id', 0)
  const chunks = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }
  for (const batch of chunks(rows, 200)) {
    const { error } = await supabase.from('milestone_optimal_setups').insert(batch)
    if (error) throw new Error(`milestone_optimal_setups batch insert failed: ${error.message}`)
  }

  return report
}
