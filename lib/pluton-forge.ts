// lib/pluton-forge.ts
// Pluton Mining -- Forge crafting margin (21 aout). 2e item du lot de
// fermeture de backlog (voir plan). Mecanique crafting_margin bornee :
// acheter les ingredients reels d'une recette forge_recipes (107 lignes deja
// en base, ingredients jsonb + forge_time_hours reels), forger, revendre le
// produit fini. profit_per_hour = (revenue-cost) / temps_forge_effectif.
//
// Verifie avant de coder (pas suppose) : forge_time_hours=0.01 sur 21/107
// lignes semblait suspect (defaut de parsing potentiel) -- recoupe contre
// hotm_forge_durations (source independante, meme item_name) : confirme
// reel, 0.01h = 30 secondes exact (Bejeweled Handle, Tungsten Key, pieces de
// drill... de vrais crafts rapides gates par la raret des ingredients plutot
// que par le temps). Donnee gardee telle quelle.
//
// Tier-scaling reel trouve (hotm_perks, perk_id='quick_forge') : "Decreases
// the time it takes to forge by X%", formule stat_formula sourcee
// littéralement -- 10+0.5*niveau (niveau<20), 30% au niveau 20 max. Applique
// comme reduction de temps par tier (early=0%, mid correspond a un niveau
// partiel, end/late=30% max -- meme convention "investissement croissant par
// tier" que Mining Speed Boost/Reaper Enrage ailleurs dans Pluton).
//
// Contrairement aux autres activites, le Forge n'a pas de setup gear
// (armure/outil) -- seul le temps de craft varie par tier via Quick Forge.
// `armor_set_prefix`/`tool_item_id` du schema commun sont donc des
// placeholders explicites (meme pattern deja utilise par Fishing/Slayer pour
// les colonnes Mining-only NOT NULL heritees).
import { createClient } from '@supabase/supabase-js'
import type { TierKey } from './money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Quick Forge : reduction de temps reelle par tier. Niveau assume ~10 (mi-
// parcours) pour MID, niveau max 20 (30%) pour END/LATE -- meme hypothese
// "skill/perk progresse en parallele du tier" que les autres activites.
const QUICK_FORGE_REDUCTION_PCT: Record<TierKey, number> = {
  early: 0,
  mid: 10 + 0.5 * 10, // niveau 10 -> 15%
  end: 30,
  late: 30,
}

type ForgeRecipe = {
  item_id: string
  item_name: string
  forge_time_hours: number
  ingredients: { item: string; amount: number }[]
}

// Charge prix d'achat (Bazaar buy_price, ce qu'on paie a l'instabuy) ET prix
// de vente (Bazaar sell_price, ce qu'on recoit a l'instasell) pour un set
// d'items -- distinct de loadPriceCache() du moteur partage (lib/pluton-
// engine.ts) qui ne charge qu'un seul prix, suffisant pour toutes les autres
// activites (jamais d'achat d'ingredient, seulement vente de drop). Le Forge
// est la 1ere activite Pluton avec un vrai cote achat, necessite les 2 prix
// Bazaar distincts. Fallback AH (avg_price, nostar_norecomb) utilise pour
// les 2 cotes quand Bazaar est absent (items non-bazaar comme les drills/
// talismans finis) -- approximation documentee (l'AH n'a pas de vrai spread
// achat/vente comme le Bazaar, avg_price sert aux deux sens).
async function loadDualPriceCache(itemIds: string[]): Promise<{ buy: Map<string, number>; sell: Map<string, number> }> {
  const ids = Array.from(new Set(itemIds)).filter(Boolean)
  const buy = new Map<string, number>()
  const sell = new Map<string, number>()
  if (ids.length === 0) return { buy, sell }
  const since = new Date(Date.now() - 5 * 86_400_000).toISOString().split('T')[0]

  const [{ data: bazaarRows }, { data: ahRows }] = await Promise.all([
    supabase.from('price_history')
      .select('item_id, buy_price, sell_price, bucket_date')
      .in('item_id', ids)
      .gte('bucket_date', since)
      .order('bucket_date', { ascending: false }),
    supabase.from('price_history_ah_variant_base')
      .select('base_item_id, avg_price, bucket_date')
      .in('base_item_id', ids)
      .eq('variant_key_base', 'nostar_norecomb')
      .gte('bucket_date', since)
      .order('bucket_date', { ascending: false }),
  ])

  for (const row of ahRows || []) {
    if (!buy.has(row.base_item_id)) buy.set(row.base_item_id, Number(row.avg_price))
    if (!sell.has(row.base_item_id)) sell.set(row.base_item_id, Number(row.avg_price))
  }
  const bazaarSeen = new Set<string>()
  for (const row of bazaarRows || []) {
    if (bazaarSeen.has(row.item_id)) continue
    bazaarSeen.add(row.item_id)
    if (Number(row.buy_price) > 0) buy.set(row.item_id, Number(row.buy_price))
    if (Number(row.sell_price) > 0) sell.set(row.item_id, Number(row.sell_price))
  }
  return { buy, sell }
}

export type ForgeRecipeResult = {
  item_id: string
  item_name: string
  cost: number
  revenue: number
  profit: number
  forge_time_hours: number
  priceable: boolean
}

export async function computeForgeMargins(): Promise<ForgeRecipeResult[]> {
  const { data: recipes } = await supabase.from('forge_recipes').select('item_id, item_name, forge_time_hours, ingredients')
  if (!recipes) return []

  const allIds = new Set<string>()
  for (const r of recipes as ForgeRecipe[]) {
    allIds.add(r.item_id)
    for (const ing of r.ingredients) allIds.add(ing.item)
  }
  const { buy, sell } = await loadDualPriceCache(Array.from(allIds))

  const results: ForgeRecipeResult[] = []
  for (const r of recipes as ForgeRecipe[]) {
    let cost = 0
    let priceable = true
    for (const ing of r.ingredients) {
      const p = buy.get(ing.item)
      if (!p) { priceable = false; break }
      cost += p * ing.amount
    }
    const revenue = sell.get(r.item_id) || 0
    if (revenue <= 0) priceable = false
    results.push({
      item_id: r.item_id,
      item_name: r.item_name,
      cost,
      revenue,
      profit: revenue - cost,
      forge_time_hours: Number(r.forge_time_hours),
      priceable,
    })
  }
  return results
}

export async function computeAndPersistForgeRankings(): Promise<{ recipes: number; viable: number }> {
  const margins = await computeForgeMargins()
  const priceable = margins.filter(m => m.priceable)

  // Scoping additif : on ne supprime que les blocs FORGE_* deja crees par
  // cette activite (jamais les blocs de minage bruts/gemstones existants) --
  // meme discipline que Sea Creature kills (bug reel deja trouve et corrige
  // sur cette activite : ne jamais appeler un delete-puis-rebuild scope par
  // activity_key seul quand plusieurs methodes coexistent sous la meme cle).
  const { data: existingBlocks } = await supabase
    .from('pluton_target_blocks')
    .select('id, block_id')
    .eq('activity_key', 'mining')
    .like('block_id', 'FORGE_%')
  const existingIds = (existingBlocks || []).map(b => b.id)
  if (existingIds.length > 0) {
    await supabase.from('pluton_rankings').delete().in('target_block_id', existingIds)
    await supabase.from('pluton_setups').delete().eq('activity_key', 'mining').contains('accessories', [{ source_id: '__forge_method__' }])
    await supabase.from('pluton_target_blocks').delete().in('id', existingIds)
  }

  let viableCount = 0
  for (const m of priceable) {
    const { data: block, error: blockErr } = await supabase
      .from('pluton_target_blocks')
      .insert({
        activity_key: 'mining',
        block_id: `FORGE_${m.item_id}`,
        block_name: `Forge -- ${m.item_name} (craft/flip)`,
        block_strength: 0,
        required_breaking_power: 0,
        sell_item_id: m.item_id,
        base_drop_count: 1,
        effective_sell_price: m.revenue,
        pricing_note: `Marge crafting_margin (21 aout) : cout=${m.cost.toFixed(0)} (ingredients Bazaar buy_price reels), revenue=${m.revenue.toFixed(0)} (Bazaar sell_price). forge_time_hours reel=${m.forge_time_hours} (source forge_recipes, recoupe hotm_forge_durations). Reduction de temps par tier via HOTM perk Quick Forge reelle (hotm_perks.quick_forge, jusqu'a -30% niveau max).`,
      })
      .select('id')
      .single()
    if (blockErr || !block) continue

    const entries = (['early', 'mid', 'end', 'late'] as TierKey[]).map(tier => {
      const reduction = QUICK_FORGE_REDUCTION_PCT[tier] / 100
      const effectiveHours = m.forge_time_hours * (1 - reduction)
      const profitPerHour = effectiveHours > 0 ? m.profit / effectiveHours : 0
      return { tier, profitPerHour, effectiveHours }
    })

    const { data: insertedSetups, error: setupErr } = await supabase
      .from('pluton_setups')
      .insert(entries.map(e => ({
        activity_key: 'mining',
        tier: e.tier,
        investment_level: 'optimal',
        armor_set_prefix: `Aucune (Forge -- Quick Forge niveau ${e.tier === 'early' ? 0 : e.tier === 'mid' ? 10 : 20})`,
        tool_item_id: 'FORGE_NO_TOOL',
        total_mining_speed: 0,
        total_mining_fortune: 0,
        total_breaking_power: 0,
        real_cost: m.cost,
        accessories: [{ source_id: '__forge_method__', quick_forge_reduction_pct: QUICK_FORGE_REDUCTION_PCT[e.tier as TierKey] }],
      })))
      .select('id')
    if (setupErr || !insertedSetups) continue

    const rankingsToInsert = entries.map((e, i) => ({
      activity_key: 'mining',
      tier: e.tier,
      target_block_id: block.id,
      setup_id: insertedSetups[i].id,
      rank: 1,
      mining_time_seconds: e.effectiveHours * 3600,
      actions_per_hour: 1 / e.effectiveHours,
      yield_per_hour: 1 / e.effectiveHours,
      coins_per_hour_raw_block_only: e.profitPerHour,
    }))
    await supabase.from('pluton_rankings').insert(rankingsToInsert)
    if (m.profit > 0) viableCount++
  }

  return { recipes: priceable.length, viable: viableCount }
}
