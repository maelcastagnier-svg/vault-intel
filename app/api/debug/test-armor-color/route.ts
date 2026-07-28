// app/api/debug/test-armor-color/route.ts
// TEMPORAIRE -- validation du chantier default_color avant merge. Supprimée
// après validation, même pattern que tous les debug routes précédents cette
// semaine (import direct des fonctions exportées, jamais de self-fetch HTTP).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runArmorColorSync } from '../../cron/armor-color-sync/route'
import { loadPricedItems, applyPreciseCost, bestArmorPiecesForSet } from '../../cron/setup-generate-agent/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // 1. La colonne existe-t-elle vraiment ?
  const colCheck = await supabase.from('item_stats').select('item_id, default_color').limit(1)
  if (colCheck.error) {
    return NextResponse.json({ step: 'column_check', ok: false, error: colCheck.error.message })
  }

  // 2. Sync réel NEU-REPO -> item_stats.default_color
  const syncResult = await runArmorColorSync()

  // 3. Charge le catalogue prix (inclut maintenant default_color)
  const priced = await loadPricedItems()

  // 4. Le vrai setup Zombie Slayer T2 (Revenant Armor) déjà en base -- trouvé
  // par recherche texte plutôt que deviner method_key/tier.
  const { data: revenantRows } = await supabase
    .from('method_setups')
    .select('method_key, tier, setup')
    .ilike('setup', '%Revenant%')

  const revenantResults: any[] = []
  for (const row of revenantRows || []) {
    let setup: any
    try { setup = JSON.parse(row.setup) } catch { continue }
    if (!setup.armor_set || !/revenant/i.test(setup.armor_set)) continue
    const before = {
      armor_helmet_color: setup.armor_helmet_color,
      armor_chestplate_color: setup.armor_chestplate_color,
      armor_leggings_color: setup.armor_leggings_color,
      armor_boots_color: setup.armor_boots_color,
    }
    const matchedPieces = bestArmorPiecesForSet(priced, setup.armor_set)
      .map(i => ({ item_id: i.item_id, category: i.category, default_color: i.default_color }))
    await applyPreciseCost(setup, priced)
    const after = {
      armor_helmet_color: setup.armor_helmet_color,
      armor_chestplate_color: setup.armor_chestplate_color,
      armor_leggings_color: setup.armor_leggings_color,
      armor_boots_color: setup.armor_boots_color,
    }
    // Ré-écrit en base pour que le vrai SetupOverlay reflète immédiatement le
    // résultat, pas seulement ce diagnostic.
    await supabase.from('method_setups').upsert(
      { method_key: row.method_key, tier: row.tier, setup: JSON.stringify(setup), generated_at: new Date().toISOString() },
      { onConflict: 'method_key, tier' }
    )
    revenantResults.push({ method_key: row.method_key, tier: row.tier, armor_set: setup.armor_set, matchedPieces, before, after })
  }

  // 5. Setup synthétique sur un vrai set en cuir confirmé coloré (Necron's) --
  // ne dépend pas d'avoir la chance qu'un setup déjà généré le référence.
  const necronSetup: any = { armor_set: "Necron's Armor" }
  const necronMatched = bestArmorPiecesForSet(priced, necronSetup.armor_set)
    .map(i => ({ item_id: i.item_id, category: i.category, default_color: i.default_color }))
  await applyPreciseCost(necronSetup, priced)

  // 6. Ré-applique le coût/couleur sur TOUS les setups déjà en base (pas
  // seulement Revenant) -- fait bénéficier les setups existants de la vraie
  // couleur immédiatement, plutôt que d'attendre le prochain run hebdo de
  // setup-generate-agent. Sert aussi à trouver un vrai setup déjà affiché en
  // prod qui aura une vraie couleur, pour vérification visuelle directe.
  const { data: allRows } = await supabase.from('method_setups').select('method_key, tier, setup')
  let reapplied = 0
  const coloredExamples: any[] = []
  for (const row of allRows || []) {
    let setup: any
    try { setup = JSON.parse(row.setup) } catch { continue }
    if (!setup.armor_set) continue
    await applyPreciseCost(setup, priced)
    await supabase.from('method_setups').upsert(
      { method_key: row.method_key, tier: row.tier, setup: JSON.stringify(setup), generated_at: new Date().toISOString() },
      { onConflict: 'method_key, tier' }
    )
    reapplied++
    if (setup.armor_chestplate_color || setup.armor_boots_color || setup.armor_helmet_color) {
      coloredExamples.push({
        method_key: row.method_key, tier: row.tier, armor_set: setup.armor_set,
        armor_helmet_color: setup.armor_helmet_color ?? null,
        armor_chestplate_color: setup.armor_chestplate_color ?? null,
        armor_leggings_color: setup.armor_leggings_color ?? null,
        armor_boots_color: setup.armor_boots_color ?? null,
      })
    }
  }

  return NextResponse.json({
    column_check: 'ok',
    sync: syncResult,
    priced_items_with_color: priced.filter(p => p.default_color).length,
    priced_armor_items: priced.filter(p => ['HELMET','CHESTPLATE','LEGGINGS','BOOTS'].includes(p.category)).length,
    revenant: {
      rows_found: revenantResults.length,
      results: revenantResults,
    },
    necron: {
      matchedPieces: necronMatched,
      armor_helmet_color: necronSetup.armor_helmet_color ?? null,
      armor_chestplate_color: necronSetup.armor_chestplate_color ?? null,
      armor_leggings_color: necronSetup.armor_leggings_color ?? null,
      armor_boots_color: necronSetup.armor_boots_color ?? null,
    },
    reapply_all: {
      rows_reapplied: reapplied,
      colored_examples: coloredExamples,
    },
  })
}
