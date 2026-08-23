// lib/pluton-dungeons.ts
// Pluton Dungeons (18 aout) -- 6e activite generalisee, 1ere a consommer
// l'architecture "multi-methodes" (voir CLAUDE.md) : contrairement a
// Mining/Farming/Foraging/Fishing/Slayer (une seule methode par cible),
// pluton_target_blocks porte ici des METHODES distinctes (pas des etages
// bruts) -- ex: "Floor I clear complet" vs, plus tard, "Floor VI frag run
// Sadan" pourront coexister sous le meme activity_key/tier et etre classees
// l'une contre l'autre. 7 etages Normal Mode generalises (Floor I->VII),
// meme methode "clear complet visant S+" partout -- Master Mode et methodes
// additionnelles (frag runs) restent hors scope de ce chantier.
//
// Difference mecanique fondamentale avec Slayer : un run de donjon n'a PAS
// de formule DPS->temps-de-kill (navigation+puzzles+secrets+boss, aucune
// donnee sourcee ne permet de simuler ce temps). Le temps de run est donc
// ANCRE sur le seuil reel documente par la page wiki "Dungeon Score" pour
// obtenir Speed=100 par etage (<=600s Floor I/II/III/V, <=720s Floor IV/VI,
// <=840s Floor VII, voir FLOOR_CONFIG) -- meme logique que le plafond moteur
// 20 actions/sec de Farming/Foraging (un seuil reel, jamais une moyenne
// inventee). Score S+ (>=300) verifie deterministe a ce temps, sur tous les
// etages : Skill=100 (0 mort/0 puzzle rate) + Explore=100 (100% clear) +
// Speed=100 = 300 pile, sans meme compter le Bonus crypts.
//
// Coffre de recompense = meilleur disponible par etage (Obsidian Floor I-IV,
// Bedrock Floor V-VII des qu'il existe -- meme score S+ 300 suffit aux deux,
// Bedrock strictement meilleur) -- PERSONNEL par joueur (pas de partage de
// loot a diviser entre le groupe, confirme wiki "Dungeon Reward Chest").
// Party 2-5 requise pour le run (aucun solo) mais coins/h reste une valeur
// PAR JOUEUR.
//
// Table de loot (pluton_dungeons_chest_loot, 7 etages x jusqu'a 6 coffres,
// ~230 lignes) sourcee mot pour mot depuis les pages wiki "The Catacombs -
// Floor X - Loot" -- deja simulee par les editeurs du wiki via le vrai
// systeme weight/quality (voir doc "Dungeon Reward Chest#Loot Rolling
// Process"), jamais re-derivee a la main ici.
// EARLY/MID = chance_no_bonus_pct (aucun accessoire Treasure) ; END/LATE =
// chance_max_bonus_pct (Treasure Artifact/Ring/Talisman + Boss Luck perk +
// Hideongeon Shard maxes -- meme convention "investissement max" que
// Mining/Foraging pour ces 2 paliers).
//
// "Added Cost" par entree (ex: Bonzo's Staff +2M, Recombobulator 3000 +5M) :
// surcout reel paye SEULEMENT si l'item concerne est effectivement tire
// (confirme methodologie utilisateur) -- E[cout] = base_cost du coffre +
// somme ponderee par probabilite des added_cost de chaque entree.
//
// 🔴 Gap documente, pas un oubli : le systeme de Classes (Archer/Mage/Tank/
// Healer/Berserk, scaling de stats propre) n'est pas modelise ici -- cette
// 1ere methode (score-anchored, temps de run externe) ne depend pas du DPS
// du joueur, donc le choix de classe n'affecte pas ce calcul. Un futur
// "frag run" cible (ex: Floor VI Sadan) redeviendra DPS-dependant et
// necessitera de sourcer les Classes a ce moment-la.
//
// 🔴 Perf : premiere version faisait 1 requete Supabase par (item x ligne de
// loot x combo tier/etage) -- jusqu'a plusieurs centaines de requetes
// sequentielles, timeout 60s systematique en prod (confirme logs Vercel,
// dizaines de 504 "Task timed out"). Reecrit pour tout charger en quelques
// requetes batchees (meme pattern que lib/gear-pricing.ts loadPricedItems :
// une requete large filtree par date, reduite en Map "premier vu = plus
// recent" en JS) puis calculer en memoire, sans aucun aller-retour DB dans
// la boucle de calcul.
import { createClient } from '@supabase/supabase-js'
import { SEVEN_TIER_KEYS, type SevenTier, INVESTMENT_MAX_TIERS } from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const DUNGEONS_TARGET_BLOCK_IDS = [
  'F1_CLEAR_SPLUS', 'F2_CLEAR_SPLUS', 'F3_CLEAR_SPLUS', 'F4_CLEAR_SPLUS',
  'F5_CLEAR_SPLUS', 'F6_CLEAR_SPLUS', 'F7_CLEAR_SPLUS',
] as const
export const DUNGEONS_TIER_KEYS: readonly SevenTier[] = SEVEN_TIER_KEYS

// Seuils reels source page wiki "Dungeon Score" -- Speed=100 si T<480 avec
// T=TotalSeconds-offset (offset variable par etage). Utilise comme temps de
// run assume pour la methode "clear complet visant S+" (Skill=100+Explore=
// 100+Speed=100=300=S+ deterministe, sans meme compter le Bonus crypts).
// Coffre Bedrock disponible seulement Floor V-VII (score S+ deja suffisant,
// meme 300 que pour Obsidian) -- strictement meilleur, donc choisi des
// qu'il existe.
const FLOOR_CONFIG: Record<string, { runSeconds: number; chestTier: string }> = {
  'I': { runSeconds: 600, chestTier: 'Obsidian' },
  'II': { runSeconds: 600, chestTier: 'Obsidian' },
  'III': { runSeconds: 600, chestTier: 'Obsidian' },
  'IV': { runSeconds: 720, chestTier: 'Obsidian' },
  'V': { runSeconds: 600, chestTier: 'Bedrock' },
  'VI': { runSeconds: 720, chestTier: 'Bedrock' },
  'VII': { runSeconds: 840, chestTier: 'Bedrock' },
}

function floorFromBlockId(blockId: string): string {
  // 'F1_CLEAR_SPLUS' -> 'I', 'F7_CLEAR_SPLUS' -> 'VII'
  const arabic = blockId.match(/^F(\d+)_/)?.[1]
  const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
  return roman[Number(arabic)]
}

// Charge le prix le plus recent de chaque item_id demande en 2 requetes
// batchees (Bazaar d'abord, fallback AH nostar_norecomb) plutot qu'un
// aller-retour par item -- meme pattern que loadPricedItems (gear-pricing.ts).
async function loadPriceCache(itemIds: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(itemIds))
  const since = new Date(Date.now() - 5 * 86_400_000).toISOString().split('T')[0]

  const [{ data: bazaarRows }, { data: ahRows }] = await Promise.all([
    supabase.from('price_history')
      .select('item_id, sell_price, bucket_date')
      .in('item_id', ids)
      .gte('bucket_date', since)
      .gt('sell_price', 0)
      .order('bucket_date', { ascending: false }),
    supabase.from('price_history_ah_variant_base')
      .select('base_item_id, avg_price, bucket_date')
      .in('base_item_id', ids)
      .eq('variant_key_base', 'nostar_norecomb')
      .gte('bucket_date', since)
      .order('bucket_date', { ascending: false }),
  ])

  const cache = new Map<string, number>()
  for (const row of ahRows || []) {
    if (!cache.has(row.base_item_id)) cache.set(row.base_item_id, Number(row.avg_price))
  }
  // Bazaar ecrase l'AH si present (source primaire pour les items
  // consommables) -- premiere ligne rencontree par item = la plus recente
  // grace au tri desc, donc un set() inconditionnel ici reecrirait avec des
  // lignes plus vieilles au fil de la boucle. On ecrase l'entree AH une
  // seule fois (au premier Bazaar vu pour cet item), puis on ignore le reste.
  const bazaarSeen = new Set<string>()
  for (const row of bazaarRows || []) {
    if (bazaarSeen.has(row.item_id)) continue
    bazaarSeen.add(row.item_id)
    cache.set(row.item_id, Number(row.sell_price))
  }
  return cache
}

export type DungeonsRankingResult = {
  target_block: string
  target_block_id: number
  tier: SevenTier
  top_setup: {
    chest_tier: string
    run_time_seconds: number
    runs_per_hour: number
    expected_chest_value: number
    expected_chest_cost: number
    coins_per_hour_raw_block_only: number
  } | null
}

type ChestLootRow = {
  entry_item_id: string | null
  entry_qty: number | string
  added_cost: number | string
  chance_no_bonus_pct: number | string
  chance_max_bonus_pct: number | string
}
type ChestMeta = { base_cost: number | string }
type TargetBlock = { id: number; block_name: string }

function computeFromLoaded(
  tier: SevenTier,
  blockId: string,
  targetBlock: TargetBlock,
  chestMeta: ChestMeta,
  lootRows: ChestLootRow[],
  chestTier: string,
  priceCache: Map<string, number>,
): DungeonsRankingResult {
  const floor = floorFromBlockId(blockId)
  const config = FLOOR_CONFIG[floor]
  const useMaxBonus = INVESTMENT_MAX_TIERS.has(tier)

  let expectedValue = 0
  let expectedAddedCost = 0
  for (const row of lootRows) {
    if (!row.entry_item_id) continue
    const chancePct = useMaxBonus ? Number(row.chance_max_bonus_pct) : Number(row.chance_no_bonus_pct)
    const chance = chancePct / 100
    const price = priceCache.get(row.entry_item_id) || 0
    expectedValue += chance * Number(row.entry_qty) * price
    if (Number(row.added_cost) > 0) {
      expectedAddedCost += chance * Number(row.added_cost)
    }
  }

  const expectedCost = Number(chestMeta.base_cost) + expectedAddedCost
  const runTimeSeconds = config.runSeconds
  const runsPerHour = 3600 / runTimeSeconds
  const coinsPerHour = (expectedValue - expectedCost) * runsPerHour

  return {
    target_block: targetBlock.block_name,
    target_block_id: targetBlock.id,
    tier,
    top_setup: {
      chest_tier: chestTier,
      run_time_seconds: runTimeSeconds,
      runs_per_hour: runsPerHour,
      expected_chest_value: expectedValue,
      expected_chest_cost: expectedCost,
      coins_per_hour_raw_block_only: coinsPerHour,
    },
  }
}

// Conserve pour compatibilite/tests unitaires cibles -- recharge tout pour un
// seul combo (pas utilise par le chemin batch de computeAndPersistAllDungeonsRankings).
export async function computeDungeonsRanking(tier: SevenTier, blockId: string): Promise<DungeonsRankingResult> {
  const { data: targetBlock } = await supabase
    .from('pluton_target_blocks')
    .select('id, block_name')
    .eq('activity_key', 'dungeons')
    .eq('block_id', blockId)
    .single()
  if (!targetBlock) throw new Error(`Unknown target block: ${blockId}`)

  const floor = floorFromBlockId(blockId)
  const config = FLOOR_CONFIG[floor]
  if (!config) throw new Error(`Unknown floor for block: ${blockId}`)
  const chestTier = config.chestTier

  const [{ data: chestMeta }, { data: lootRows }] = await Promise.all([
    supabase.from('pluton_dungeons_chest_tiers').select('*').eq('floor', floor).eq('chest_tier', chestTier).single(),
    supabase.from('pluton_dungeons_chest_loot').select('*').eq('floor', floor).eq('chest_tier', chestTier),
  ])
  if (!chestMeta || !lootRows) throw new Error(`Missing chest data for ${floor}/${chestTier}`)

  const priceCache = await loadPriceCache(lootRows.map(r => r.entry_item_id).filter(Boolean) as string[])
  return computeFromLoaded(tier, blockId, targetBlock, chestMeta, lootRows, chestTier, priceCache)
}

export type PersistedDungeonsResult = {
  tier: SevenTier
  block_id: string
  target_block: string
  has_setup: boolean
  coins_per_hour_raw_block_only: number | null
}

export async function computeAndPersistAllDungeonsRankings(): Promise<PersistedDungeonsResult[]> {
  await supabase.from('pluton_rankings').delete().eq('activity_key', 'dungeons')
  await supabase.from('pluton_setups').delete().eq('activity_key', 'dungeons')

  const [{ data: targetBlocks }, { data: chestTiers }, { data: allLoot }] = await Promise.all([
    supabase.from('pluton_target_blocks').select('id, block_id, block_name').eq('activity_key', 'dungeons'),
    supabase.from('pluton_dungeons_chest_tiers').select('floor, chest_tier, base_cost'),
    supabase.from('pluton_dungeons_chest_loot').select('floor, chest_tier, entry_item_id, entry_qty, added_cost, chance_no_bonus_pct, chance_max_bonus_pct'),
  ])
  if (!targetBlocks || !chestTiers || !allLoot) throw new Error('Failed to load Dungeons reference data')

  const targetBlockByBlockId = new Map(targetBlocks.map(t => [t.block_id, t]))
  const chestMetaByKey = new Map(chestTiers.map(c => [`${c.floor}|${c.chest_tier}`, c]))
  const lootByKey = new Map<string, ChestLootRow[]>()
  for (const row of allLoot) {
    const key = `${row.floor}|${row.chest_tier}`
    if (!lootByKey.has(key)) lootByKey.set(key, [])
    lootByKey.get(key)!.push(row)
  }

  const priceCache = await loadPriceCache(allLoot.map(r => r.entry_item_id).filter(Boolean) as string[])

  const out: PersistedDungeonsResult[] = []
  const setupsToInsert: any[] = []
  const setupMeta: { tier: SevenTier; blockId: string; result: DungeonsRankingResult }[] = []

  for (const tier of DUNGEONS_TIER_KEYS) {
    for (const blockId of DUNGEONS_TARGET_BLOCK_IDS) {
      const targetBlock = targetBlockByBlockId.get(blockId)
      const floor = floorFromBlockId(blockId)
      const config = FLOOR_CONFIG[floor]
      if (!targetBlock || !config) {
        out.push({ tier, block_id: blockId, target_block: targetBlock?.block_name || blockId, has_setup: false, coins_per_hour_raw_block_only: null })
        continue
      }
      const chestMeta = chestMetaByKey.get(`${floor}|${config.chestTier}`)
      const lootRows = lootByKey.get(`${floor}|${config.chestTier}`)
      if (!chestMeta || !lootRows) {
        out.push({ tier, block_id: blockId, target_block: targetBlock.block_name, has_setup: false, coins_per_hour_raw_block_only: null })
        continue
      }

      const result = computeFromLoaded(tier, blockId, targetBlock, chestMeta, lootRows, config.chestTier, priceCache)
      const s = result.top_setup!
      setupsToInsert.push({
        activity_key: 'dungeons',
        tier,
        investment_level: 'optimal',
        armor_set_prefix: `Coffre ${s.chest_tier} (score S+)`,
        tool_item_id: 'NONE',
        total_mining_speed: 0,
        total_mining_fortune: 0,
        total_breaking_power: 0,
        real_cost: Math.round(s.expected_chest_cost),
        pet_id: null,
        pet_rarity: null,
        accessories: [{ source_id: '__dungeons_method__', equip_slot: 'meta', chest_tier: s.chest_tier, run_time_seconds: s.run_time_seconds }],
      })
      setupMeta.push({ tier, blockId, result })
    }
  }

  const { data: insertedSetups, error: setupErr } = await supabase
    .from('pluton_setups')
    .insert(setupsToInsert)
    .select('id')
  if (setupErr || !insertedSetups) throw new Error(`pluton_setups batch insert failed: ${setupErr?.message}`)

  const rankingsToInsert = setupMeta.map((meta, i) => {
    const s = meta.result.top_setup!
    return {
      activity_key: 'dungeons',
      tier: meta.tier,
      target_block_id: meta.result.target_block_id,
      setup_id: insertedSetups[i].id,
      rank: 1,
      mining_time_seconds: s.run_time_seconds,
      actions_per_hour: s.runs_per_hour,
      yield_per_hour: s.runs_per_hour,
      coins_per_hour_raw_block_only: s.coins_per_hour_raw_block_only,
    }
  })
  const { error: rankErr } = await supabase.from('pluton_rankings').insert(rankingsToInsert)
  if (rankErr) throw new Error(`pluton_rankings batch insert failed: ${rankErr.message}`)

  for (const meta of setupMeta) {
    out.push({
      tier: meta.tier,
      block_id: meta.blockId,
      target_block: meta.result.target_block,
      has_setup: true,
      coins_per_hour_raw_block_only: meta.result.top_setup!.coins_per_hour_raw_block_only,
    })
  }
  return out
}
