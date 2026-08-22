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
// une localisation ET un type de shard fixes, ce qui contredit "meilleur
// shard toutes localisations confondues" (l'approche retenue ci-dessous).
// Charm Chance (Charming) EXPLICITEMENT PAS modelise ici -- voir la
// distinction mecanique-fondamentale-vs-activite etablie ce jour meme
// (CLAUDE.md) : Charming est un modificateur PASSIF pose sur du combat deja
// en cours (chance de recevoir un shard bonus en tuant un mob), pas une
// activite autonome avec sa propre action+setup -- et la relation Hunter
// Fortune->nombre de shards par proc n'est pas chiffree dans le contenu
// wiki cache ("multiplicateur hf" jamais formule). Documente comme gap
// mecanique reel plutot que force.
//
// Strategie retenue : parmi TOUS les Attribute Shards reels (321, table
// attribute_shards, rarete+prix Bazaar deja sources), le joueur rationnel
// pose ses trap sur la localisation du shard le plus rentable a son palier
// de trap -- on calcule coins/h pour chaque shard price, on retient le
// meilleur par tier. La page wiki "Huntraps#Locations" elle-meme est
// marquee {{Sectionstub}} (liste reconnue incomplete par le wiki source) --
// utiliser le catalogue complet attribute_shards plutot qu'une
// transcription manuelle partielle de cette liste est documente comme un
// choix deliberement plus large, pas une invention.
import { createClient } from '@supabase/supabase-js'
import type { TierKey } from './money-making-constants'

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

const TRAP_BY_TIER: Record<TierKey, { itemId: string; name: string; reductionPct: number }> = {
  early: { itemId: 'RETIA_BASICA', name: 'Small Huntrap', reductionPct: 0 },
  mid: { itemId: 'RETIA_MELIORA', name: 'Medium Huntrap', reductionPct: 10 },
  end: { itemId: 'RETIA_FORTA', name: 'Greater Huntrap', reductionPct: 35 },
  late: { itemId: 'RETIA_SUPREMA', name: 'Astral Huntrap', reductionPct: 50 },
}

// Forest Essence Shop, perk "Trapped" (22 aout, trouve en auditant les
// Essence Shops) -- "Your traps now catch creatures X% faster", I+1%..
// V+5% (5 paliers, niveau max), AUCUNE restriction de lieu. Stack de
// maniere ADDITIVE avec la reduction de palier de Huntrap -- confirme
// explicitement par la formule deja citee en tete de fichier ("calculated
// first then multiplied with all other modifiers which stack
// additively"), applique a tous les tiers (cout modique, pas de gate
// d'item comme le Sharpening Shard de Foraging).
const TRAPPED_REDUCTION_PCT_MAX = 5

export type TrapHuntingResult = {
  tier: TierKey
  trap_name: string
  best_shard: string
  shard_rarity: string
  shard_price: number
  capture_hours: number
  coins_per_hour: number
}

export async function computeTrapHuntingRankings(): Promise<TrapHuntingResult[]> {
  const { data: shards } = await supabase.from('attribute_shards').select('display_name, rarity, bazaar_stock_id')
  if (!shards) return []

  const ids = Array.from(new Set((shards as any[]).map(s => s.bazaar_stock_id).filter(Boolean)))
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
  for (const tier of ['early', 'mid', 'end', 'late'] as TierKey[]) {
    const trap = TRAP_BY_TIER[tier]
    let best: TrapHuntingResult | null = null
    for (const s of shards as { display_name: string; rarity: string; bazaar_stock_id: string | null }[]) {
      if (!s.bazaar_stock_id) continue
      const price = priceCache.get(s.bazaar_stock_id)
      const baseHours = BASE_HOURS_BY_RARITY[s.rarity]
      if (!price || !baseHours) continue
      const captureHours = baseHours * (1 - (trap.reductionPct + TRAPPED_REDUCTION_PCT_MAX) / 100)
      const coinsPerHour = price / captureHours
      if (!best || coinsPerHour > best.coins_per_hour) {
        best = { tier, trap_name: trap.name, best_shard: s.display_name, shard_rarity: s.rarity, shard_price: price, capture_hours: captureHours, coins_per_hour: coinsPerHour }
      }
    }
    if (best) results.push(best)
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

  const { data: block, error: blockErr } = await supabase
    .from('pluton_target_blocks')
    .insert({
      activity_key: 'hunting',
      block_id: 'TRAP_HUNTING',
      block_name: 'Trap Hunting -- meilleur Attribute Shard disponible',
      block_strength: 0,
      required_breaking_power: 0,
      sell_item_id: 'NONE',
      base_drop_count: 1,
      pricing_note: `1re activite Pluton pour le skill Hunting (jamais couvert avant). Formule reelle "Huntraps" (wiki, citations Discord dev mrkeith) : temps de capture par rarete de shard (Common 8-12h ... Legendary 16-24h) reduit par le palier de Huntrap (Small 0% / Medium -10% / Greater -35% / Astral -50%). Parmi les 321 Attribute Shards reels pricees (table attribute_shards), retient le meilleur coins/h par tier. Charm Hunting explicitement PAS modelise -- modificateur passif sur du combat existant (chance de shard bonus au kill), pas une activite autonome, et la relation Hunter Fortune->nombre de shards par proc n'est chiffree nulle part dans le wiki source. Forest/Water/Combat Hunting restent des gaps reels (stamina/pull/vitesse de capture non formules, {{confirm}} explicite cote wiki).`,
    })
    .select('id')
    .single()
  if (blockErr || !block) throw new Error(`pluton_target_blocks insert failed: ${blockErr?.message}`)

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
    accessories: [{ source_id: '__trap_hunting__', best_shard: r.best_shard, shard_rarity: r.shard_rarity }],
  }))
  const { data: insertedSetups, error: setupErr } = await supabase.from('pluton_setups').insert(setupsToInsert).select('id')
  if (setupErr || !insertedSetups) throw new Error(`pluton_setups insert failed: ${setupErr?.message}`)

  const rankingsToInsert = results.map((r, i) => ({
    activity_key: 'hunting',
    tier: r.tier,
    target_block_id: block.id,
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
