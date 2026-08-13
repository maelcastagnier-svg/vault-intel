// Route de debug TEMPORAIRE (Pluton, architecture v2, 13 aout) -- classification des
// tables de reference NEU-REPO/API dans pluton_elements. Remplace l'ancien
// trigger-tier-classify-ref (tier seul) -- demande maintenant DEUX jugements par table :
// (1) element_type (axe navigation), (2) test de gating (est-ce debloquable ? si oui,
// quel tier ?). Une regle universelle (ex: formule de vitesse de cassage, definition
// d'une stat) reste catégorisée mais tier=NULL -- elle ne participe pas au modele de
// progression 0-100%.
//
// Lecons de l'incident du jour appliquees des le depart :
// - upsert(ON CONFLICT DO NOTHING) des la premiere ecriture, jamais insert() nu.
// - une seule table de sortie (pluton_elements) -- plus de risque de doublon CROSS-TABLE,
//   la contrainte unique (source_table, source_row_id) protege globalement.
// - a invoquer avec curl -m superieur a maxDuration (300) pour ne jamais chevaucher deux
//   invocations.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// (table, colonne id) -- memes ~150 tables de contenu jeu reel que l'architecture v1,
// moins skills/game_drops (deja migrees manuellement avec un signal reel dedie).
const REF_TABLES: Array<[string, string]> = [
  ['accessory_powers', 'id'], ['reforges', 'id'], ['hotm_perks', 'id'], ['rift_guide', 'id'],
  ['sblevel_tasks', 'id'], ['reforge_stones', 'id'], ['trophy_fish_thresholds', 'id'],
  ['fairy_soul_locations', 'id'], ['garden_crop_milestones', 'id'], ['garden_composter_upgrades', 'id'],
  ['garden_plot_costs', 'id'], ['garden_xp_levels', 'id'], ['garden_plots', 'id'],
  ['garden_crop_upgrade_costs', 'id'], ['museum_item_xp', 'id'], ['museum_sets', 'id'],
  ['sack_contents', 'id'], ['player_base_stats', 'id'], ['accessory_upgrade_paths', 'id'],
  ['minion_tier_xp', 'id'], ['gemstone_slot_costs', 'id'], ['essence_shop_upgrades', 'id'],
  ['glacite_tunnel_waypoints', 'id'], ['hotf_perks', 'id'], ['hotm_hotf_powders', 'id'],
  ['dungeon_rng_scores', 'id'], ['slayer_rng_scores', 'id'], ['game_zones', 'id'],
  ['skymart_shop', 'id'], ['hoppity_prestige', 'id'], ['island_warps', 'id'],
  ['item_upgrade_chains', 'id'], ['george_pet_prices', 'id'], ['npc_locations', 'id'],
  ['dungeon_classes', 'id'], ['enchantments', 'id'], ['sack_tiers', 'id'],
  ['trapper_pelt_rarities', 'id'], ['trapper_pelt_modifiers', 'id'], ['garden_pests', 'id'],
  ['garden_pest_fortune_penalty', 'id'], ['time_pocket_aging_items', 'id'], ['time_pocket_upgrades', 'id'],
  ['minion_upgrade_items', 'id'], ['bestiary_mobs', 'id'], ['bestiary_brackets', 'id'],
  ['level_bonus_stats', 'id'], ['pet_score_magic_find', 'id'], ['essence_upgrade_costs', 'id'],
  ['essence_upgrade_extra_items', 'id'], ['carnival_shop_items', 'id'], ['pet_level_xp_curve', 'id'],
  ['custom_pet_leveling', 'id'], ['player_stats', 'id'], ['attribute_milestones', 'id'],
  ['necromancy_souls', 'id'], ['skyblock_level_xp_tasks', 'id'], ['museum_milestones', 'id'],
  ['skyblock_achievements', 'id'], ['skyblock_quests', 'id'], ['location_details', 'id'],
  ['skyblock_level_rewards', 'id'], ['chocolate_factory_levels', 'id'], ['dungeon_chest_combo_chances', 'id'],
  ['dungeon_class_milestones', 'id'], ['crystal_hollows_loot', 'id'], ['treasure_fishing_loot', 'id'],
  ['zone_mob_stats', 'id'], ['bits_shop_items', 'id'], ['power_scroll_recipes', 'id'],
  ['fame_ranks', 'id'], ['rod_parts', 'id'], ['composter_organic_matter', 'id'],
  ['skyblock_gems_pricing', 'id'], ['rift_timecharms', 'id'], ['drop_chance_tiers', 'id'],
  ['milestone_reward_tiers', 'id'], ['tree_gift_drops', 'id'], ['wormhole_locations', 'id'],
  ['mob_type_categories', 'id'], ['trial_of_blue_flames', 'id'], ['trials_of_fire', 'id'],
  ['fossil_chisels', 'id'], ['mob_modifiers', 'id'], ['griffin_burrows_loot', 'id'],
  ['wormhole_fishing_items', 'id'], ['museum_items', 'id'], ['starlyn_prize_shop', 'id'],
  ['upgrade_fragments', 'id'], ['odger_filleting_rewards', 'id'], ['ribery_frog_donation_rewards', 'id'],
  ['npc_discounts', 'id'], ['reforging_prices', 'id'], ['critters', 'id'],
  ['automated_shipping_hoppers', 'id'], ['city_project_contributions', 'id'], ['city_project_bonuses', 'id'],
  ['hotf_ability_cooldowns', 'id'], ['library_npc_shop', 'id'], ['advent_calendar_rewards', 'id'],
  ['star_upgrades', 'id'], ['cosmetic_skins', 'id'], ['skyblock_guide_tasks', 'id'],
  ['slayer_mob_combat_stats', 'id'], ['slayer_gear_requirements', 'id'], ['slayer_pet_scaling', 'id'],
  ['slayer_tier_costs', 'id'], ['slayer_drop_items', 'id'], ['rift_enigma_soul_locations', 'id'],
  ['minion_item_xp_values', 'id'], ['inferno_minion_fuels', 'id'], ['dojo_belts', 'id'],
  ['rift_race_checkpoints', 'id'], ['garden_special_armor_crops', 'id'], ['rift_ghost_drops', 'id'],
  ['rift_wilted_berberis_locations', 'id'], ['rift_metal_detector_chests', 'id'],
  ['rift_experimentation_table_rewards', 'id'], ['starlyn_contest_tier_rewards', 'id'],
  ['kuudra_faction_discounts', 'id'], ['garden_composter_items', 'id'], ['garden_pest_rare_drops', 'id'],
  ['garden_visitor_requests', 'id'], ['anita_upgrade_costs', 'id'], ['rift_effigy_locations', 'id'],
  ['diana_sphinx_answers', 'id'], ['mythological_ritual_mobs', 'id'], ['skyblock_island_metadata', 'id'],
  ['sea_creature_fishing_xp', 'id'], ['kuudra_tier_prestige_costs', 'id'], ['skyblock_bingo_ranks', 'id'],
  ['dungeon_dance_room_sequence', 'id'], ['forge_recipes', 'id'], ['collections', 'id'],
  ['pet_stat_progression', 'id'], ['magical_power_by_rarity', 'rarity'], ['attribute_shards', 'id'],
  ['attribute_shard_leveling_costs', 'id'], ['chocolate_rabbits', 'id'], ['crop_fortune_sources', 'id'],
  ['garden_mutations', 'id'], ['garden_visitors', 'id'], ['gemstones', 'id'], ['item_stats', 'id'],
  ['pet_rarity_level_offset', 'id'], ['pet_rarity_value', 'id'], ['sea_creature_pools', 'id'],
  ['trophy_frogs', 'id'], ['mythological_creatures', 'id'], ['bazaar_stock_id_map', 'id'],
]

const ELEMENT_TYPES = ['item', 'progression_milestone', 'mechanic_formula', 'mob_zone_data', 'cosmetic', 'event_seasonal', 'admin_excluded', 'general_mechanic']

const SYSTEM_PROMPT = `Tu classes des TABLES de donnees de reference du jeu Hypixel Skyblock. Pour chaque table (nom + colonnes + echantillon de lignes), reponds a DEUX questions independantes :

1. element_type -- que represente cette table ? Un des 8 : ${ELEMENT_TYPES.join(', ')}.
   - item = equipement/arme/outil/pet/accessoire/reforge qu'un joueur obtient/achete
   - progression_milestone = niveaux skill/slayer/collection/reputation et leurs recompenses
   - mechanic_formula = formule/regle du jeu (taux de drop, courbe XP, calcul de stat) -- PAS une chose "obtenue"
   - mob_zone_data = stats de mob, donnees de zone/bestiary/loot par zone
   - cosmetic = skins, dialogues, contenu purement visuel
   - event_seasonal = festivals, bingo, contenu limite dans le temps
   - admin_excluded = contenu reserve aux GM/dev, jamais accessible a un vrai joueur
   - general_mechanic = mecanique reelle mais qui ne rentre dans aucune des 7 autres

2. is_gated -- CETTE TABLE represente-t-elle du contenu DEBLOQUABLE (un vrai palier de progression existe : networth necessaire, niveau XP requis, prerequis de zone/quete documente) ? Une regle UNIVERSELLE, vraie pour tout joueur des le debut independamment de sa progression (ex: la vitesse de cassage de bloc vanilla, la definition de ce que fait une stat) n'est PAS gated -- reponds is_gated=false, tier_min=null.
   Si is_gated=true : donne gate_type (networth|xp_ratio|prerequisite|inherited) et tier_min/tier_max (1-7, plage si la table couvre plusieurs paliers de progression, sinon tier_min=tier_max). Si is_gated=false : gate_type="none", tier_min=null, tier_max=null.

Regles :
- N'invente aucune valeur numerique, base-toi sur le contenu fourni.
- confidence=low si tu dois inferer sans signal fort.
- Si aucune colonne de prix/niveau/prerequis n'existe dans l'echantillon, is_gated peut quand meme etre true si le CONTENU documente un vrai prerequis (ex: "Kuudra Tier 5 loot" implique un acces Kuudra deja gated) -- explique le raisonnement dans reason.`

const SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          element_type: { type: 'string', enum: ELEMENT_TYPES },
          is_gated: { type: 'boolean' },
          gate_type: { type: 'string', enum: ['networth', 'xp_ratio', 'prerequisite', 'inherited', 'none'] },
          tier_min: { type: ['integer', 'null'] },
          tier_max: { type: ['integer', 'null'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          reason: { type: 'string' },
        },
        required: ['index', 'element_type', 'is_gated', 'gate_type', 'tier_min', 'tier_max', 'confidence', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['classifications'],
  additionalProperties: false,
}

async function callHaiku(items: Array<{ index: number; text: string }>) {
  const userContent = items.map(i => `[${i.index}] ${i.text}`).join('\n---\n')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    }),
  })
  if (!res.ok) throw new Error(`Haiku API ${res.status}: ${(await res.text()).slice(0, 500)}`)
  const data = await res.json()
  const raw = data?.content?.[0]?.text ?? ''
  const parsed = JSON.parse(raw)
  return {
    classifications: parsed.classifications as Array<{ index: number; element_type: string; is_gated: boolean; gate_type: string | null; tier_min: number | null; tier_max: number | null; confidence: string; reason: string }>,
    inputTokens: data?.usage?.input_tokens ?? 0,
    outputTokens: data?.usage?.output_tokens ?? 0,
  }
}

export async function GET(req: NextRequest) {
  try {
    const limit = req.nextUrl.searchParams.get('limit') ? parseInt(req.nextUrl.searchParams.get('limit')!, 10) : 15
    const batchSize = 15

    const doneKeys = new Set<string>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('pluton_elements').select('source_table, source_row_id').range(offset, offset + 999)
      if (error) throw new Error(`fetch done: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data) doneKeys.add(`${r.source_table}::${r.source_row_id}`)
      if (data.length < 1000) break
    }
    const doneCountByTable = new Map<string, number>()
    for (const key of doneKeys) {
      const t = key.split('::')[0]
      doneCountByTable.set(t, (doneCountByTable.get(t) ?? 0) + 1)
    }

    const counts = await Promise.all(REF_TABLES.map(async ([table, idCol]) => {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
      if (error) { console.error(`count ${table}: ${error.message}`); return null }
      return { table, idCol, total: count ?? 0 }
    }))
    const notFullyDone: Array<[string, string]> = []
    for (const c of counts) {
      if (!c) continue
      const done = doneCountByTable.get(c.table) ?? 0
      if (c.total > 0 && done < c.total) notFullyDone.push([c.table, c.idCol])
    }

    type TableInfo = { table: string; idCol: string; rows: any[]; sampleText: string }
    const fetched = await Promise.all(notFullyDone.slice(0, limit).map(async ([table, idCol]) => {
      const allRows: any[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from(table).select('*').range(offset, offset + 999)
        if (error) { console.error(`fetch ${table}: ${error.message}`); break }
        if (!data || data.length === 0) break
        allRows.push(...data)
        if (data.length < 1000) break
      }
      const residual = allRows.filter(r => !doneKeys.has(`${table}::${String(r[idCol])}`))
      if (residual.length === 0) return null
      const cols = residual.length > 0 ? Object.keys(residual[0]) : []
      const sample = residual.slice(0, 4).map(r => JSON.stringify(r)).join(' | ')
      return { table, idCol, rows: residual, sampleText: `Table "${table}" -- colonnes: ${cols.join(', ')} -- echantillon: ${sample} (${residual.length} lignes au total)` } as TableInfo
    }))
    const tablesInfo: TableInfo[] = fetched.filter((t): t is TableInfo => t !== null)

    let totalInputTokens = 0, totalOutputTokens = 0, classifiedRows = 0, classifiedTables = 0, gatedTables = 0, ungatedTables = 0
    const errors: Array<{ table: string; error: string }> = []
    const results: Array<{ table: string; element_type: string; is_gated: boolean; tier_min: number | null; tier_max: number | null; rows: number }> = []

    for (let i = 0; i < tablesInfo.length; i += batchSize) {
      const batch = tablesInfo.slice(i, i + batchSize)
      const items = batch.map((t, idx) => ({ index: idx, text: t.sampleText }))
      try {
        const { classifications, inputTokens, outputTokens } = await callHaiku(items)
        totalInputTokens += inputTokens
        totalOutputTokens += outputTokens
        for (const c of classifications) {
          const t = batch[c.index]
          if (!t) continue
          const tMin = c.is_gated ? c.tier_min : null
          const tMax = c.is_gated ? (c.tier_max ?? c.tier_min) : null
          if (c.is_gated) gatedTables++; else ungatedTables++
          results.push({ table: t.table, element_type: c.element_type, is_gated: c.is_gated, tier_min: tMin, tier_max: tMax, rows: t.rows.length })

          for (let ri = 0; ri < t.rows.length; ri++) {
            const row = t.rows[ri]
            const tier = (tMin !== null && tMax !== null && tMax > tMin)
              ? Math.min(tMax, tMin + Math.floor((ri / Math.max(1, t.rows.length - 1)) * (tMax - tMin)))
              : tMin
            const elementName = String(row.display_name ?? row.name ?? row.item_name ?? row.reward_name ?? row.perk_name ?? row.title ?? row.mob_name ?? row[t.idCol] ?? t.table).slice(0, 250)
            const { error } = await supabase.from('pluton_elements').upsert({
              element_type: c.element_type,
              element_name: elementName,
              tier,
              gate_type: c.is_gated ? c.gate_type : null,
              gate_reference: c.is_gated ? `jugement table-level (plage ${tMin}-${tMax})` : null,
              source_table: t.table,
              source_row_id: String(row[t.idCol]),
              raw_data: row,
              classification_method: 'haiku_table_level_v2',
              classification_confidence: c.confidence,
              classification_reason: c.reason,
            }, { onConflict: 'source_table,source_row_id', ignoreDuplicates: true })
            if (error) errors.push({ table: t.table, error: error.message })
            else classifiedRows++
          }
          classifiedTables++
        }
      } catch (e: any) {
        for (const t of batch) errors.push({ table: t.table, error: String(e?.message ?? e) })
      }
    }

    const costUsd = (totalInputTokens / 1_000_000) * 1.0 + (totalOutputTokens / 1_000_000) * 5.0
    return NextResponse.json({
      success: true,
      residual_tables_total: notFullyDone.length,
      processed_this_run: tablesInfo.length,
      remaining_after_this_run: notFullyDone.length - tablesInfo.length,
      classified_tables: classifiedTables,
      classified_rows: classifiedRows,
      gated_tables: gatedTables,
      ungated_tables: ungatedTables,
      error_count: errors.length,
      real_cost_usd: costUsd,
      errors: errors.slice(0, 10),
      results,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
