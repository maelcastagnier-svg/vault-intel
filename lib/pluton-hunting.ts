// lib/pluton-hunting.ts
// Pluton Hunting -- Trap Hunting (21 aout). 4e et dernier item du lot de
// fermeture de backlog (voir plan). 1re activite du skill Hunting (skill
// neuf 2025/2026, jamais couvert par Pluton).
//
// Formule reelle sourcee mot pour mot (wiki "Huntraps", citations Discord
// dev mrkeith explicitement referencees sur la page elle-meme) :
// - Temps de capture de base par RARETE du shard (pas par trap) : Common
//   8-12h, Uncommon 10-15h, Rare 12-18h, Epic 14-21h, Legendary 16-24h.
// - Reduction reelle par palier de Huntrap : Small=0% (starter, gratuit),
//   Medium=-10%, Large=-20%, Greater=-35%, Astral=-50%.
// - "The bonus from the Huntrap Tier is calculated first then multiplied
//   with all other modifiers which stack additively" -- formule donnee
//   avec un exemple chiffre explicite sur la page (0.5*(1-.25-.1)=0.325
//   pour Forest/Combat Shards avec Desert Temple+Forest/Combat Trap actifs).
//
// **MVP documente, pas cache** : seule la reduction de trap est modelisee
// (Small/Medium/Greater/Astral mappes sur les 4 tiers early/mid/end/late,
// Large saute dans la compression 5->4 paliers). Desert Temple (-25%,
// bonus de LOCALISATION, pas de setup joueur) et Forest Trap/Combat Trap
// (attributs -10%, ciblent seulement Forest/Combat shards specifiquement,
// pas Water) volontairement pas empiles ici -- necessiteraient de choisir
// une localisation ET un type de shard fixes, ce qui contredit le principe
// "chaque shard = son propre coins/h" retenu ci-dessous. Charm Chance
// (Charming) EXPLICITEMENT PAS modelise ici -- Charming est un
// modificateur PASSIF pose sur du combat deja en cours (chance de recevoir
// un shard bonus en tuant un mob), pas une activite autonome avec sa
// propre action+setup -- et la relation Hunter Fortune->nombre de shards
// par proc n'est pas chiffree dans le contenu wiki cache. Documente comme
// gap mecanique reel plutot que force.
//
// **Granularite PAR SHARD INDIVIDUEL (23 aout, 2e correction utilisateur --
// "toute item farmable activement reste une activite... les items
// farmable individuellement tu le fait a la main")** : la 1re passe du
// jour meme avait collapse les 320 shards en 5 activites par RARETE
// (raisonnement : la rarete determine le temps de capture, le shard
// precis choisi a l'interieur semblait un detail d'implementation).
// Corrige explicitement par l'utilisateur : chaque shard est chassable
// individuellement (page wiki "Huntraps#Locations" confirme un
// emplacement par shard, meme incomplete) et a son propre prix reel --
// exactement le meme principe que Ruby vs Coal en Mining (17 materiaux
// individuels, pas "5 activites par tier de Breaking Power"). 320 shards
// pricees (table attribute_shards) => 320 activites, PAS groupees --
// aucune raison mecanique de les regrouper (contrairement aux 5 boss
// Slayer, qui partagent litteralement le meme combat/formule, un vrai cas
// de regroupement legitime).
import { createClient } from '@supabase/supabase-js'
import { SEVEN_TIER_KEYS, type SevenTier } from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_HOURS_BY_RARITY: Record<string, number> = {
  COMMON: (8 + 12) / 2,
  UNCOMMON: (10 + 15) / 2,
  RARE: (12 + 18) / 2,
  EPIC: (14 + 21) / 2,
  LEGENDARY: (16 + 24) / 2,
}

// Migre au systeme reel a 7 tiers (23 aout) -- les 5 vrais paliers de
// Huntrap (Small/Medium/Large/Greater/Astral) tiennent maintenant TOUS dans
// les 7 tiers joueur, y compris Large (RETIA_ROBUSTA, -20%) qui etait
// jusqu'ici saute par la compression 5->4 de l'ancien systeme -- plus
// aucune donnee reelle perdue. Seul "intermediate" (entre Small et Medium)
// reste une interpolation lineaire, aucune autre valeur n'est inventee.
const TRAP_BY_TIER: Record<SevenTier, { itemId: string; name: string; reductionPct: number }> = {
  starter:      { itemId: 'RETIA_BASICA',  name: 'Small Huntrap',   reductionPct: 0 },
  amateur:      { itemId: 'RETIA_BASICA',  name: 'Small Huntrap',   reductionPct: 0 },     // ancre reelle
  intermediate: { itemId: 'RETIA_MELIORA', name: 'Medium Huntrap',  reductionPct: 5 },      // interpole (Small->Medium)
  skilled:      { itemId: 'RETIA_MELIORA', name: 'Medium Huntrap',  reductionPct: 10 },     // ancre reelle
  expert:       { itemId: 'RETIA_ROBUSTA', name: 'Large Huntrap',   reductionPct: 20 },     // ancre reelle, restauree (sautee dans l'ancien systeme 4-tiers)
  professional: { itemId: 'RETIA_FORTA',   name: 'Greater Huntrap', reductionPct: 35 },     // ancre reelle
  master:       { itemId: 'RETIA_SUPREMA', name: 'Astral Huntrap',  reductionPct: 50 },     // ancre reelle
}

// Forest Essence Shop, perk "Trapped" (22 aout, trouve en auditant les
// Essence Shops) -- "Your traps now catch creatures X% faster", I+1%..
// V+5% (5 paliers, niveau max), AUCUNE restriction de lieu. Stack de
// maniere ADDITIVE avec la reduction de palier de Huntrap (confirme
// explicitement par la formule deja citee en tete de fichier), applique a
// tous les tiers (cout modique, pas de gate d'item).
const TRAPPED_REDUCTION_PCT_MAX = 5

export type TrapHuntingResult = {
  tier: SevenTier
  shard_item_id: string
  shard_name: string
  shard_rarity: string
  trap_name: string
  shard_price: number
  capture_hours: number
  coins_per_hour: number
}

export async function computeTrapHuntingRankings(): Promise<TrapHuntingResult[]> {
  const { data: shards } = await supabase.from('attribute_shards').select('display_name, rarity, bazaar_stock_id')
  if (!shards) return []

  const validShards = (shards as { display_name: string; rarity: string; bazaar_stock_id: string | null }[])
    .filter(s => s.bazaar_stock_id && BASE_HOURS_BY_RARITY[s.rarity])

  const ids = Array.from(new Set(validShards.map(s => s.bazaar_stock_id as string)))
  const since = new Date(Date.now() - 5 * 86_400_000).toISOString().split('T')[0]
  const { data: priceRows } = await supabase
    .from('price_history')
    .select('item_id, sell_price, bucket_date')
    .in('item_id', ids)
    .gte('bucket_date', since)
    .gt('sell_price', 0)
    .order('bucket_date', { ascending: false })
  const priceCache = new Map<string, number>()
  for (const row of priceRows || []) if (!priceCache.has(row.item_id)) priceCache.set(row.item_id, Number(row.sell_price))

  const results: TrapHuntingResult[] = []
  for (const tier of SEVEN_TIER_KEYS) {
    const trap = TRAP_BY_TIER[tier]
    for (const s of validShards) {
      const price = priceCache.get(s.bazaar_stock_id as string)
      if (!price) continue
      const baseHours = BASE_HOURS_BY_RARITY[s.rarity]
      const captureHours = baseHours * (1 - (trap.reductionPct + TRAPPED_REDUCTION_PCT_MAX) / 100)
      const coinsPerHour = price / captureHours
      results.push({
        tier, shard_item_id: s.bazaar_stock_id as string, shard_name: s.display_name, shard_rarity: s.rarity,
        trap_name: trap.name, shard_price: price, capture_hours: captureHours, coins_per_hour: coinsPerHour,
      })
    }
  }
  return results
}

export async function computeAndPersistTrapHuntingRankings(): Promise<TrapHuntingResult[]> {
  const results = await computeTrapHuntingRankings()

  const { data: existingBlocks } = await supabase.from('pluton_target_blocks').select('id').eq('activity_key', 'hunting')
  const existingIds = (existingBlocks || []).map(b => b.id)
  if (existingIds.length > 0) {
    await supabase.from('pluton_rankings').delete().in('target_block_id', existingIds)
    await supabase.from('pluton_setups').delete().eq('activity_key', 'hunting')
    await supabase.from('pluton_target_blocks').delete().in('id', existingIds)
  }

  // 1 target_block PAR SHARD INDIVIDUEL (voir doc plus haut) -- remplace
  // l'ancien decoupage par rarete (5 blocs) du meme jour.
  const uniqueShards = Array.from(new Map(results.map(r => [r.shard_item_id, r])).values())
  const blockRows = uniqueShards.map(s => ({
    activity_key: 'hunting',
    block_id: `TRAP_HUNTING_${s.shard_item_id}`,
    block_name: `Trap Hunting -- ${s.shard_name} (${s.shard_rarity})`,
    block_strength: 0,
    required_breaking_power: 0,
    sell_item_id: s.shard_item_id,
    base_drop_count: 1,
    pricing_note: `Activite Pluton Hunting, granularite par shard individuel (23 aout -- chaque shard chassable = sa propre activite, meme principe que Ruby vs Coal en Mining). Formule reelle "Huntraps" (wiki, citations Discord dev mrkeith) : temps de capture par rarete de shard (Common 8-12h ... Legendary 16-24h) reduit par le palier de Huntrap (Small 0% / Medium -10% / Greater -35% / Astral -50%) + Trapped (Forest Essence Shop, -5%). Charm Hunting explicitement PAS modelise -- modificateur passif sur du combat existant, pas une activite autonome.`,
  }))
  const { data: insertedBlocks, error: blockErr } = await supabase.from('pluton_target_blocks').insert(blockRows).select('id, block_id')
  if (blockErr || !insertedBlocks) throw new Error(`pluton_target_blocks insert failed: ${blockErr?.message}`)
  const blockIdByShard = new Map(insertedBlocks.map(b => [b.block_id.replace('TRAP_HUNTING_', ''), b.id]))

  const setupsToInsert = results.map(r => ({
    activity_key: 'hunting',
    tier: r.tier,
    investment_level: 'optimal',
    armor_set_prefix: `Aucune (${r.trap_name} seul)`,
    tool_item_id: TRAP_BY_TIER[r.tier].itemId,
    total_mining_speed: 0,
    total_mining_fortune: 0,
    total_breaking_power: 0,
    real_cost: 0,
    accessories: [{ source_id: '__trap_hunting__', shard: r.shard_name, shard_rarity: r.shard_rarity }],
  }))
  const { data: insertedSetups, error: setupErr } = await supabase.from('pluton_setups').insert(setupsToInsert).select('id')
  if (setupErr || !insertedSetups) throw new Error(`pluton_setups insert failed: ${setupErr?.message}`)

  const rankingsToInsert = results.map((r, i) => ({
    activity_key: 'hunting',
    tier: r.tier,
    target_block_id: blockIdByShard.get(r.shard_item_id)!,
    setup_id: insertedSetups[i].id,
    rank: 1,
    mining_time_seconds: r.capture_hours * 3600,
    actions_per_hour: 1 / r.capture_hours,
    yield_per_hour: 1 / r.capture_hours,
    coins_per_hour_raw_block_only: r.coins_per_hour,
  }))
  const { error: rankErr } = await supabase.from('pluton_rankings').insert(rankingsToInsert)
  if (rankErr) throw new Error(`pluton_rankings insert failed: ${rankErr.message}`)

  return results
}
