// lib/pluton-enchanting.ts
// Enchanted Books flip (27 aout) -- backlog documente depuis le 21 aout
// ("Enchanted Books flip (Anvil) -- mecanique confirmee reelle... bloquee
// par la couverture de prix"), rouvert cette nuit (audit exhaustif 7000+
// items) : couverture de prix desormais large (447/490 paires niveau N/N+1
// avec un prix Bazaar frais et non-nul, verifie par agent dedie).
//
// Mecanique reelle sourcee (game_mechanics_misc, key='anvil', section
// "Usage -> Combining Enchanted Books") : combiner 2 livres enchantes de
// MEME enchant/MEME niveau a l'Enclume donne 1 livre de niveau+1 --
// "it costs no additional Experience levels to do so, and as a result,
// gives no Enchanting experience." Cout reel = 0 coin/0 XP -- uniquement
// le cout des 2 livres sources.
//
// Marge = sell_price(niveau N+1) - 2 x buy_price(niveau N).
//
// Cadence : reutilise le plafond moteur 20 actions/seconde deja valide sur
// Farming/Foraging (5 aout, decision explicite de l'utilisateur) --
// legitime ICI (contrairement a un flip Auction House qui attend un
// acheteur, gap non modelisable) car les 3 etapes du cycle (achat
// Bazaar instabuy, combine Enclume, vente Bazaar instasell) sont TOUTES
// des actions instantanees sans attente de marche -- meme categorie de
// limite moteur qu'un swing de houe/hache, pas un nouveau nombre invente.
// Documente comme un plafond theorique (sous-estime probablement moins la
// realite que les autres usages de ce plafond, la gestion d'inventaire
// reelle etant plus lente qu'un swing) -- honnete, pas cache.
//
// Filtre de fraicheur (trouve par l'agent de recherche le 27 aout) : le
// flag `priced_bazaar` de l'audit constatait l'EXISTENCE d'une ligne, pas
// sa fraicheur -- ~9% des 490 items ont un prix a 0 ou perime (>7j, ex.
// SUNDER 5/6 stale depuis juin). Filtre applique ici : bucket_date <= 5
// jours ET prix > 0 sur LES DEUX niveaux de la paire, sinon paire exclue
// (jamais un prix invente ou perime utilise).
import { createClient } from '@supabase/supabase-js'
import { SEVEN_TIER_KEYS, type SevenTier } from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CRAFT_ACTIONS_PER_SECOND_CAP = 20
const CYCLES_PER_HOUR = CRAFT_ACTIONS_PER_SECOND_CAP * 3600 // 72 000 cycles buy+combine+sell/h, plafond theorique

type PairCandidate = { enchantName: string; levelLow: number; levelHigh: number; itemLow: string; itemHigh: string }

export async function computeAndPersistEnchantedBookFlipRankings(): Promise<{ pairs_evaluated: number; pairs_priced: number }> {
  const { data: enchants } = await supabase.from('enchantments').select('name, max_level')
  const candidates: PairCandidate[] = []
  for (const e of (enchants || [])) {
    const maxLevel = Number(e.max_level) || 0
    if (maxLevel < 2) continue
    const upper = String(e.name).toUpperCase()
    for (let lvl = 1; lvl < maxLevel; lvl++) {
      candidates.push({
        enchantName: e.name,
        levelLow: lvl,
        levelHigh: lvl + 1,
        itemLow: `ENCHANTMENT_${upper}_${lvl}`,
        itemHigh: `ENCHANTMENT_${upper}_${lvl + 1}`,
      })
    }
  }

  const allItemIds = Array.from(new Set(candidates.flatMap(c => [c.itemLow, c.itemHigh])))
  const since = new Date(Date.now() - 5 * 86_400_000).toISOString().split('T')[0]
  const { data: priceRows } = await supabase
    .from('price_history')
    .select('item_id, buy_price, sell_price, bucket_date')
    .in('item_id', allItemIds)
    .gte('bucket_date', since)
    .order('bucket_date', { ascending: false })

  const buyCache = new Map<string, number>()
  const sellCache = new Map<string, number>()
  for (const row of (priceRows || [])) {
    if (Number(row.buy_price) > 0 && !buyCache.has(row.item_id)) buyCache.set(row.item_id, Number(row.buy_price))
    if (Number(row.sell_price) > 0 && !sellCache.has(row.item_id)) sellCache.set(row.item_id, Number(row.sell_price))
  }

  const pricedPairs = candidates
    .map(c => {
      const buyLow = buyCache.get(c.itemLow)
      const sellHigh = sellCache.get(c.itemHigh)
      if (!buyLow || !sellHigh) return null
      const cost = 2 * buyLow
      const margin = sellHigh - cost
      return { ...c, buyLow, sellHigh, cost, margin }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // Delete-puis-insert scope a activity_key='enchanting' -- namespace dedie,
  // n'affecte aucune autre activite Pluton.
  const { data: existingBlocks } = await supabase.from('pluton_target_blocks').select('id').eq('activity_key', 'enchanting')
  const existingIds = (existingBlocks || []).map(b => b.id)
  if (existingIds.length > 0) {
    await supabase.from('pluton_rankings').delete().in('target_block_id', existingIds)
    await supabase.from('pluton_setups').delete().eq('activity_key', 'enchanting')
    await supabase.from('pluton_target_blocks').delete().in('id', existingIds)
  }

  for (const p of pricedPairs) {
    const { data: block, error: blockErr } = await supabase
      .from('pluton_target_blocks')
      .insert({
        activity_key: 'enchanting',
        block_id: `ENCHBOOK_${p.enchantName.toUpperCase()}_${p.levelLow}_${p.levelHigh}`,
        block_name: `Enchanted Book -- ${p.enchantName} ${p.levelLow}->${p.levelHigh} (combine Enclume)`,
        block_strength: 0,
        required_breaking_power: 0,
        sell_item_id: p.itemHigh,
        base_drop_count: 1,
        effective_sell_price: p.sellHigh,
        pricing_note: `Marge crafting_margin (27 aout) : combine 2x ${p.itemLow} (buy_price=${p.buyLow.toFixed(0)}) -> 1x ${p.itemHigh} (sell_price=${p.sellHigh.toFixed(0)}) a l'Enclume, cout reel=0 coin/0 XP (source game_mechanics_misc key='anvil'). Marge=${p.margin.toFixed(0)}/craft. Cadence : plafond moteur 20 actions/sec reutilise (Farming/Foraging, 5 aout) -- legitime ici, cycle buy+combine+sell 100% Bazaar instantane, aucune attente de marche AH.`,
      })
      .select('id').single()
    if (blockErr || !block) throw new Error(`Enchanted book block insert failed for ${p.enchantName} ${p.levelLow}->${p.levelHigh}: ${blockErr?.message}`)

    for (const tier of SEVEN_TIER_KEYS) {
      const { data: setupRow, error: setupErr } = await supabase
        .from('pluton_setups')
        .insert({
          activity_key: 'enchanting',
          tier,
          investment_level: 'optimal',
          armor_set_prefix: 'Aucune (combine Enclume, gear-independant)',
          tool_item_id: 'ANVIL_NO_TOOL',
          total_mining_speed: 0,
          total_mining_fortune: 0,
          total_breaking_power: 0,
          real_cost: p.cost,
          accessories: [{ source_id: '__enchanted_book_flip__', enchant: p.enchantName, level_low: p.levelLow, level_high: p.levelHigh }],
        })
        .select('id').single()
      if (setupErr || !setupRow) throw new Error(`Enchanted book setup insert failed: ${setupErr?.message}`)

      const { error: rankErr } = await supabase
        .from('pluton_rankings')
        .insert({
          activity_key: 'enchanting',
          tier,
          target_block_id: block.id,
          setup_id: setupRow.id,
          rank: 1,
          mining_time_seconds: 1 / CRAFT_ACTIONS_PER_SECOND_CAP,
          actions_per_hour: CYCLES_PER_HOUR,
          yield_per_hour: CYCLES_PER_HOUR,
          coins_per_hour_raw_block_only: p.margin * CYCLES_PER_HOUR,
        })
      if (rankErr) throw new Error(`Enchanted book ranking insert failed: ${rankErr.message}`)
    }
  }

  return { pairs_evaluated: candidates.length, pairs_priced: pricedPairs.length }
}
