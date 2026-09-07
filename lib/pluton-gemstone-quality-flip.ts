// lib/pluton-gemstone-quality-flip.ts
// Gemstone quality flip (1er sept) -- ferme le backlog gemstone_quality_flip
// (48 items) documente depuis le 27 aout ("ratio de combinaison
// contradictoire dans la source elle-meme -- 16 vs 80").
//
// Arbitrage (agent de recherche 31 aout + verification directe ce soir,
// game_mechanics_misc key='gemstone', page LIVE non 'outdated') : la page
// contient DEUX affirmations contradictoires -- la PROSE resume ("can be
// crafted with 80 of the previous tiers") dit 80, mais les 36 TABLES DE
// CRAFT STRUCTUREES reelles (12 gemmes x 3 paliers, template mecanique
// "Enchanted Crafting Recipe Row", le MEME format machine-lisible deja
// utilise pour Goldor's/Perfect Armor/tous les autres crafts de ce projet)
// disent TOUTES 16, sans une seule exception. Le paragraphe "80" est un
// residu de redaction jamais mis a jour (la page History confirme un
// changement de mecanique en 2021/July 7 -- Perfect Gemstone n'est PLUS
// obtenu par combine direct depuis cette date, seulement via Forge,
// prouvant que la page a ete modifiee depuis l'introduction du "80" sans
// que la prose de synthese soit corrigee). Retenu : 16, la donnee
// mecanique structuree plutot que la prose.
//
// Scope : Rough->Flawed->Fine->Flawless UNIQUEMENT (3 paliers, 12 types de
// gemme). Perfect Gemstone est HORS SCOPE ici -- confirme par la page
// elle-meme forge via The Forge (HotM 5 + Gemstone Collection 10), pas un
// combine simple -- deja potentiellement couvert par lib/pluton-forge.ts
// (forge_recipes), pas duplique ici.
//
// Craft instantane (Table 3x3, aucun forge_time mentionne) + les 4 paliers
// sont TOUS Bazaar-tradeable (verifie price_history) -- cycle 100% Bazaar
// instantane, meme plafond moteur 20 actions/sec reutilise qu'Enchanted
// Books (27 aout).
//
// **Essai puis abandon d'un plafond base sur price_history.volume** :
// tente avant publication pour Fine->Flawless (marge tres elevee x 72 000
// cycles/h suppose = 85-275 milliards coins/h). Le volume Bazaar TOTAL
// quotidien (toutes les transactions de tous les joueurs confondues)
// s'est revele un mauvais proxy de "cadence solo realiste" : sur Jasper
// (gemme tres liquide), le volume reel depasse largement 72 000/h,
// laissant passer 275 milliards coins/h sans aucune reduction -- le
// volume marche total n'est pas une mesure de ce qu'UN joueur peut
// personnellement absorber. Abandonne, pas de metrique fiable trouvee
// pour cette distinction -- le plafond moteur 20 actions/sec reste le
// SEUL plafond utilise (identique a Enchanted Books/Farming/Foraging),
// et le residu d'irrealisme sur Fine->Flawless (marge de combine 1:16 tres
// elevee, gestion d'inventaire reelle jamais modelisee -- meme reserve
// deja documentee sur Enchanted Books) est traite explicitement via
// `pluton_rankings.bridge_exclude_reason` (donnee conservee pour
// l'audit, exclue des recommandations utilisateur), pas invente ni cache.
import { createClient } from '@supabase/supabase-js'
import { SEVEN_TIER_KEYS } from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GEM_TYPES = ['RUBY', 'AMBER', 'SAPPHIRE', 'JADE', 'AMETHYST', 'TOPAZ', 'JASPER', 'OPAL', 'ONYX', 'AQUAMARINE', 'CITRINE', 'PERIDOT'] as const
const QUALITY_CHAIN = ['ROUGH', 'FLAWED', 'FINE', 'FLAWLESS'] as const
const COMBINE_RATIO = 16 // table de craft structuree, pas la prose "80" -- voir doc en-tete

const CRAFT_ACTIONS_PER_SECOND_CAP = 20
const CYCLES_PER_HOUR = CRAFT_ACTIONS_PER_SECOND_CAP * 3600
// Seuil au-dela duquel le plafond moteur 20 actions/sec, deja documente
// comme theorique (gestion d'inventaire reelle jamais modelisee), cesse
// d'etre credible pour une recommandation utilisateur -- pas un nouveau
// palier de jeu invente, un seuil de bon sens applique au meme plafond
// deja accepte partout ailleurs (Enchanted Books/Farming/Foraging restent
// tous largement en dessous). Documente explicitement dans bridge_exclude_
// reason, jamais supprime de pluton_rankings.
const BRIDGE_SANITY_CEILING_COINS_PER_HOUR = 1_000_000_000 // 1 milliard/h

type StepCalc = { gem: string; fromQ: string; toQ: string; margin: number; coinsPerHour: number }

export async function computeAndPersistGemstoneQualityFlipRankings(): Promise<{ steps_evaluated: number; steps_priced: number }> {
  const allItemIds = GEM_TYPES.flatMap(g => QUALITY_CHAIN.map(q => `${q}_${g}_GEM`))
  const { data: priceRows } = await supabase
    .from('price_history')
    .select('item_id, buy_price, sell_price, bucket_date')
    .in('item_id', allItemIds)
    .order('bucket_date', { ascending: false })

  const buyCache = new Map<string, number>()
  const sellCache = new Map<string, number>()
  for (const row of (priceRows || [])) {
    if (Number(row.buy_price) > 0 && !buyCache.has(row.item_id)) buyCache.set(row.item_id, Number(row.buy_price))
    if (Number(row.sell_price) > 0 && !sellCache.has(row.item_id)) sellCache.set(row.item_id, Number(row.sell_price))
  }

  const calcs: StepCalc[] = []
  for (const gem of GEM_TYPES) {
    for (let i = 0; i < QUALITY_CHAIN.length - 1; i++) {
      const fromQ = QUALITY_CHAIN[i]
      const toQ = QUALITY_CHAIN[i + 1]
      const fromId = `${fromQ}_${gem}_GEM`
      const toId = `${toQ}_${gem}_GEM`
      const buyFrom = buyCache.get(fromId)
      const sellTo = sellCache.get(toId)
      if (!buyFrom || !sellTo) continue
      const cost = COMBINE_RATIO * buyFrom
      const margin = sellTo - cost
      calcs.push({ gem, fromQ, toQ, margin, coinsPerHour: margin * CYCLES_PER_HOUR })
    }
  }
  if (calcs.length === 0) throw new Error('Aucun palier gemstone priceable -- verifier price_history')

  const blockIds = calcs.map(c => `GEMSTONE_FLIP_${c.gem}_${c.fromQ}_${c.toQ}`)
  const { data: existingBlocks } = await supabase.from('pluton_target_blocks').select('id').eq('activity_key', 'mining').in('block_id', blockIds)
  const existingIds = (existingBlocks || []).map(b => b.id)
  if (existingIds.length > 0) {
    await supabase.from('pluton_rankings').delete().in('target_block_id', existingIds)
    await supabase.from('pluton_setups').delete().eq('activity_key', 'mining').eq('tool_item_id', 'GEMSTONE_FLIP_NO_TOOL')
    await supabase.from('pluton_target_blocks').delete().in('id', existingIds)
  }

  const chunks = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }

  const blockRows = calcs.map(c => ({
    activity_key: 'mining',
    block_id: `GEMSTONE_FLIP_${c.gem}_${c.fromQ}_${c.toQ}`,
    block_name: `Gemstone ${c.gem} -- ${c.fromQ}->${c.toQ} (combine Table 3x3)`,
    block_strength: 0,
    required_breaking_power: 0,
    sell_item_id: `${c.toQ}_${c.gem}_GEM`,
    base_drop_count: 1,
    effective_sell_price: c.margin > 0 ? c.margin : 0,
    pricing_note: `Marge crafting_margin (1er sept) : combine ${COMBINE_RATIO}x ${c.fromQ}_${c.gem}_GEM (Bazaar buy_price) -> 1x ${c.toQ}_${c.gem}_GEM (Bazaar sell_price). Ratio=${COMBINE_RATIO} (table de craft structuree, PAS la prose "80" de la meme page -- contradiction documentee, arbitrage explicite voir lib source). Marge=${c.margin.toFixed(2)}/craft. Cadence : plafond moteur 20 actions/sec (cycle 100% Bazaar instantane, meme convention Enchanted Books) -- theorique, gestion d'inventaire reelle jamais modelisee, voir bridge_exclude_reason si ce combo est exclu du pont Money Making pour irrealisme.`,
  }))
  const insertedBlocks: { id: number }[] = []
  for (const batch of chunks(blockRows, 200)) {
    const { data, error } = await supabase.from('pluton_target_blocks').insert(batch).select('id')
    if (error || !data) throw new Error(`Gemstone flip blocks batch insert failed: ${error?.message}`)
    insertedBlocks.push(...data)
  }

  const setupRows: any[] = []
  for (let i = 0; i < calcs.length; i++) {
    for (const tier of SEVEN_TIER_KEYS) {
      setupRows.push({
        activity_key: 'mining', tier, investment_level: 'optimal',
        armor_set_prefix: 'Aucune (combine Table 3x3, gear-independant)',
        tool_item_id: 'GEMSTONE_FLIP_NO_TOOL',
        total_mining_speed: 0, total_mining_fortune: 0, total_breaking_power: 0,
        real_cost: COMBINE_RATIO * (buyCache.get(`${calcs[i].fromQ}_${calcs[i].gem}_GEM`) || 0),
        accessories: [{ source_id: '__gemstone_quality_flip__', gem: calcs[i].gem, from: calcs[i].fromQ, to: calcs[i].toQ }],
        _idx: i,
      })
    }
  }
  const insertedSetups: { id: number }[] = []
  for (const batch of chunks(setupRows, 200)) {
    const clean = batch.map(({ _idx, ...rest }) => rest)
    const { data, error } = await supabase.from('pluton_setups').insert(clean).select('id')
    if (error || !data) throw new Error(`Gemstone flip setups batch insert failed: ${error?.message}`)
    insertedSetups.push(...data)
  }

  const rankingRows = setupRows.map((s, i) => {
    const c = calcs[s._idx]
    const exceedsSanityCeiling = c.coinsPerHour > BRIDGE_SANITY_CEILING_COINS_PER_HOUR
    return {
      activity_key: 'mining', tier: s.tier,
      target_block_id: insertedBlocks[s._idx].id,
      setup_id: insertedSetups[i].id, rank: 1,
      mining_time_seconds: 1 / CRAFT_ACTIONS_PER_SECOND_CAP,
      actions_per_hour: CYCLES_PER_HOUR, yield_per_hour: CYCLES_PER_HOUR,
      coins_per_hour_raw_block_only: c.coinsPerHour,
      bridge_exclude_reason: exceedsSanityCeiling
        ? `Plafond moteur 20 actions/sec (deja documente comme theorique, gestion d'inventaire reelle jamais modelisee) applique a une marge de combine tres elevee (${c.margin.toFixed(0)}/craft, ratio 1:${COMBINE_RATIO}) produit ${Math.round(c.coinsPerHour).toLocaleString('fr-FR')} coins/h -- au-dela du seuil de credibilite pour une recommandation utilisateur payant (>${BRIDGE_SANITY_CEILING_COINS_PER_HOUR.toLocaleString('fr-FR')}/h). Conserve tel quel dans pluton_rankings (donnee de recherche valide), exclu du pont Money Making uniquement.`
        : null,
    }
  })
  for (const batch of chunks(rankingRows, 200)) {
    const { error } = await supabase.from('pluton_rankings').insert(batch)
    if (error) throw new Error(`Gemstone flip rankings batch insert failed: ${error.message}`)
  }

  return { steps_evaluated: GEM_TYPES.length * (QUALITY_CHAIN.length - 1), steps_priced: calcs.length }
}
