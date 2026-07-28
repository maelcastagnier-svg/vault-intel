// Route de debug temporaire — validation du nouveau pipeline setup-generate-agent :
// spec de gear précise + justifiée (stars/reforge/hot potato/ultimate enchant),
// prix calculé par variante exacte (price_history_ah_variants ->
// price_history_ah_variant_base -> blended en dernier recours), rareté réelle
// attachée depuis item_stats.rarity. À supprimer après validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  loadPricedItems, gearCatalogForBudget, buildWikiContext, GROUNDING_RULES,
  generateOne, methodKey, specVariantKeys, lookupPreciseVariantPrice,
} from '../../cron/setup-generate-agent/route'
import { TIER_CONFIG } from '../../../../lib/money-making-constants'
import { syncItemStats } from '../../cron/skyblock-resources-sync/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // 1. Déclenche un vrai re-sync item_stats pour peupler rarity maintenant
  //    (le cron quotidien n'a pas encore tourné avec le nouveau mapping).
  let syncResult: any
  try { syncResult = { rows: await syncItemStats() } }
  catch (e: any) { syncResult = { error: e.message } }

  const { data: analysis } = await supabase
    .from('claude_analysis').select('content').eq('section', 'money_making_late').single()
  if (!analysis) return NextResponse.json({ error: 'No money_making_late section' }, { status: 400 })

  const tierData = JSON.parse(analysis.content)
  const methods: any[] = [...(tierData.active || []), ...(tierData.vault || [])]
  const method = methods.find((m: any) => /mining|gemstone|crystal|glacite|hollow/i.test(m.method || '') || m.skill === 'mining') || methods[0]

  const [{ data: ctx }, pricedItems] = await Promise.all([supabase.rpc('get_full_context'), loadPricedItems()])
  const catalog = gearCatalogForBudget(pricedItems, TIER_CONFIG.late.max_gear_cost)
  const wikiContext = buildWikiContext(ctx) + '\n' + GROUNDING_RULES + '\n\n' + catalog

  const ok = await generateOne(method, 'late', wikiContext, pricedItems)

  const key = methodKey(method)
  const { data: savedRow } = await supabase
    .from('method_setups').select('setup').eq('method_key', key).eq('tier', 'late').single()
  const setup = savedRow ? JSON.parse(savedRow.setup) : null

  // Sanity check direct sur item_stats : la colonne rarity est-elle vraiment peuplée ?
  const { data: rarityCheck } = await supabase
    .from('item_stats').select('item_id, display_name, rarity')
    .in('item_id', ['HYPERION', 'DIVAN_DRILL', 'INFERNAL_CRIMSON_CHESTPLATE'])

  // Est-ce que l'armor_set recommandé existe VRAIMENT dans le catalogue montré
  // à Claude, ou est-ce un nom halluciné qui a échappé au grounding ?
  const armorNameLower = (setup?.armor_set || '').toLowerCase()
  const catalogMatchesForArmorName = armorNameLower
    ? pricedItems.filter(p => p.display_name.toLowerCase().includes(armorNameLower.split(' ')[0])).slice(0, 10)
    : []

  // Est-ce que les reforges choisies par Claude (armor_reforge/weapon_reforge)
  // existent VRAIMENT dans reforges (donc dans le wikiContext montré), ou
  // sont-elles inventées malgré l'instruction "copie verbatim" ?
  const reforgeNamesToCheck = [setup?.armor_reforge, setup?.weapon_reforge].filter(Boolean)
  const { data: reforgeCheck } = reforgeNamesToCheck.length
    ? await supabase.from('reforges').select('reforge_name, item_types, rarity').in('reforge_name', reforgeNamesToCheck)
    : { data: [] as any[] }
  const { data: allReforgeNames } = await supabase.from('reforges').select('reforge_name').limit(400)
  const distinctReforgeNames = Array.from(new Set((allReforgeNames || []).map((r: any) => r.reforge_name)))

  // Diagnostic direct : pour la pièce armor du setup généré, combien de
  // lignes existent en base pour ce base_item_id (tous variant_key
  // confondus), et le lookup précis trouve-t-il quoi que ce soit (exact,
  // base, ou rien) ?
  let variantDiagnostic: any = null
  if (setup?.armor_set) {
    const helmetId = 'INFERNAL_CRIMSON_HELMET'
    const keys = specVariantKeys({
      stars: Number(setup.armor_stars) || 0,
      recomb: !!setup.armor_recomb,
      reforge: setup.armor_reforge || null,
      hotPotato: Number(setup.armor_hot_potato_count) || 0,
      ultimateEnchant: null,
    })
    const lookup = await lookupPreciseVariantPrice(helmetId, keys)
    const { count: exactRowsForItem } = await supabase
      .from('price_history_ah_variants').select('*', { count: 'exact', head: true }).eq('base_item_id', helmetId)
    const { count: baseRowsForItem } = await supabase
      .from('price_history_ah_variant_base').select('*', { count: 'exact', head: true }).eq('base_item_id', helmetId)
    const { data: sampleExactKeys } = await supabase
      .from('price_history_ah_variants').select('variant_key, avg_price, bucket_date').eq('base_item_id', helmetId)
      .order('bucket_date', { ascending: false }).limit(10)
    variantDiagnostic = {
      tested_item: helmetId,
      computed_keys: keys,
      lookup_result: lookup,
      total_variant_rows_for_this_item_ever: exactRowsForItem,
      total_base_rows_for_this_item_ever: baseRowsForItem,
      most_recent_real_variant_keys_seen: sampleExactKeys,
    }
  }

  return NextResponse.json({
    variant_diagnostic: variantDiagnostic,
    item_stats_resync: syncResult,
    method_chosen: { id: method.id, method: method.method },
    generation_ok: ok,
    priced_items_total: pricedItems.length,
    rarity_column_check: rarityCheck,
    armor_set_recommended: setup?.armor_set || null,
    catalog_entries_matching_armor_first_word: catalogMatchesForArmorName,
    reforges_claude_picked: reforgeNamesToCheck,
    reforges_that_are_real_matches: reforgeCheck,
    total_distinct_reforge_names_in_db: distinctReforgeNames.length,
    sample_real_reforge_names: distinctReforgeNames.slice(0, 40),
    generated_setup: setup,
  })
}
