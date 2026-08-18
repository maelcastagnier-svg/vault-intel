// lib/pluton-dungeons.ts
// Pluton Dungeons (18 aout) -- 6e activite generalisee, 1ere a consommer
// l'architecture "multi-methodes" (voir CLAUDE.md) : contrairement a
// Mining/Farming/Foraging/Fishing/Slayer (une seule methode par cible),
// pluton_target_blocks porte ici des METHODES distinctes (pas des etages
// bruts) -- ex: "Floor I clear complet" vs, plus tard, "Floor VI frag run
// Sadan" pourront coexister sous le meme activity_key/tier et etre classees
// l'une contre l'autre.
//
// Difference mecanique fondamentale avec Slayer : un run de donjon n'a PAS
// de formule DPS->temps-de-kill (navigation+puzzles+secrets+boss, aucune
// donnee sourcee ne permet de simuler ce temps). Le temps de run est donc
// ANCRE sur le seuil reel documente par la page wiki "Dungeon Score" pour
// obtenir Speed=100 (<=600s sur Floor I) -- meme logique que le plafond
// moteur 20 actions/sec de Farming/Foraging (un seuil reel, jamais une
// moyenne inventee). Score S+ (>=300) verifie deterministe a ce temps :
// Skill=100 (0 mort/0 puzzle rate) + Explore=100 (100% clear) + Speed=100 =
// 300 pile, sans meme compter le Bonus crypts.
//
// Coffre de recompense = Obsidian (meilleur coffre Floor I, pas de Bedrock
// avant Floor V) -- PERSONNEL par joueur (pas de partage de loot a diviser
// entre le groupe, confirme wiki "Dungeon Reward Chest"). Party 2-5 requise
// pour le run (aucun solo Floor I) mais coins/h reste une valeur PAR JOUEUR.
//
// Table de loot (pluton_dungeons_chest_loot) sourcee mot pour mot depuis la
// page wiki "The Catacombs - Floor I - Loot" -- deja simulee par les
// editeurs du wiki via le vrai systeme weight/quality (voir doc "Dungeon
// Reward Chest#Loot Rolling Process"), jamais re-derivee a la main ici.
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
import { createClient } from '@supabase/supabase-js'
import { TIER_CONFIG, type TierKey } from './money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const DUNGEONS_TARGET_BLOCK_IDS = ['F1_CLEAR_SPLUS'] as const
export const DUNGEONS_TIER_KEYS: TierKey[] = ['early', 'mid', 'end', 'late']

// Seuil reel source page wiki "Dungeon Score" -- Speed=100 si T<480 avec
// T=TotalSeconds-120 sur Floor I, donc TotalSeconds<=600s. Utilise comme
// temps de run assume pour la methode "clear complet visant S+".
const FLOOR_I_ASSUMED_RUN_SECONDS = 600

async function getLivePrice(itemId: string): Promise<number> {
  const { data: bazaar } = await supabase
    .from('price_history')
    .select('sell_price, bucket_date')
    .eq('item_id', itemId)
    .gt('sell_price', 0)
    .order('bucket_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (bazaar?.sell_price) return Number(bazaar.sell_price)

  const { data: ah } = await supabase
    .from('price_history_ah_variant_base')
    .select('avg_price, bucket_date')
    .eq('base_item_id', itemId)
    .eq('variant_key_base', 'nostar_norecomb')
    .order('bucket_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return Number(ah?.avg_price) || 0
}

export type DungeonsRankingResult = {
  target_block: string
  target_block_id: number
  tier: TierKey
  top_setup: {
    chest_tier: string
    run_time_seconds: number
    runs_per_hour: number
    expected_chest_value: number
    expected_chest_cost: number
    coins_per_hour_raw_block_only: number
  } | null
}

export async function computeDungeonsRanking(tier: TierKey, blockId: string): Promise<DungeonsRankingResult> {
  const { data: targetBlock } = await supabase
    .from('pluton_target_blocks')
    .select('id, block_name')
    .eq('activity_key', 'dungeons')
    .eq('block_id', blockId)
    .single()
  if (!targetBlock) throw new Error(`Unknown target block: ${blockId}`)

  // Seule methode construite pour l'instant : Floor I clear complet S+,
  // coffre Obsidian. A generaliser (Floors II-VII + Master Mode + methodes
  // additionnelles type frag run) selon le meme pattern.
  const floor = 'I'
  const chestTier = 'Obsidian'

  const [{ data: chestMeta }, { data: lootRows }] = await Promise.all([
    supabase.from('pluton_dungeons_chest_tiers').select('*').eq('floor', floor).eq('chest_tier', chestTier).single(),
    supabase.from('pluton_dungeons_chest_loot').select('*').eq('floor', floor).eq('chest_tier', chestTier),
  ])
  if (!chestMeta || !lootRows) throw new Error(`Missing chest data for ${floor}/${chestTier}`)

  const useMaxBonus = tier === 'end' || tier === 'late'

  let expectedValue = 0
  let expectedAddedCost = 0
  for (const row of lootRows) {
    const chancePct = useMaxBonus ? Number(row.chance_max_bonus_pct) : Number(row.chance_no_bonus_pct)
    const chance = chancePct / 100
    if (!row.entry_item_id) continue
    const price = await getLivePrice(row.entry_item_id)
    expectedValue += chance * Number(row.entry_qty) * price
    if (Number(row.added_cost) > 0) {
      expectedAddedCost += chance * Number(row.added_cost)
    }
  }

  const expectedCost = Number(chestMeta.base_cost) + expectedAddedCost
  const runTimeSeconds = FLOOR_I_ASSUMED_RUN_SECONDS
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

export type PersistedDungeonsResult = {
  tier: TierKey
  block_id: string
  target_block: string
  has_setup: boolean
  coins_per_hour_raw_block_only: number | null
}

export async function computeAndPersistAllDungeonsRankings(): Promise<PersistedDungeonsResult[]> {
  const out: PersistedDungeonsResult[] = []
  await supabase.from('pluton_rankings').delete().eq('activity_key', 'dungeons')
  await supabase.from('pluton_setups').delete().eq('activity_key', 'dungeons')

  for (const tier of DUNGEONS_TIER_KEYS) {
    for (const blockId of DUNGEONS_TARGET_BLOCK_IDS) {
      const result = await computeDungeonsRanking(tier, blockId)
      if (!result.top_setup) {
        out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: false, coins_per_hour_raw_block_only: null })
        continue
      }
      const s = result.top_setup
      const { data: setupRow, error: setupErr } = await supabase
        .from('pluton_setups')
        .insert({
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
        .select('id')
        .single()
      if (setupErr || !setupRow) throw new Error(`pluton_setups insert failed for ${tier}/${blockId}: ${setupErr?.message}`)

      const { error: rankErr } = await supabase
        .from('pluton_rankings')
        .insert({
          activity_key: 'dungeons',
          tier,
          target_block_id: result.target_block_id,
          setup_id: setupRow.id,
          rank: 1,
          mining_time_seconds: s.run_time_seconds,
          actions_per_hour: s.runs_per_hour,
          yield_per_hour: s.runs_per_hour,
          coins_per_hour_raw_block_only: s.coins_per_hour_raw_block_only,
        })
      if (rankErr) throw new Error(`pluton_rankings insert failed for ${tier}/${blockId}: ${rankErr.message}`)

      out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: true, coins_per_hour_raw_block_only: s.coins_per_hour_raw_block_only })
    }
  }
  return out
}
