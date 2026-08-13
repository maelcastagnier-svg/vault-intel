// Route de debug TEMPORAIRE (Pluton, 13 aout) -- classification 7-tiers des tables de
// reference NEU-REPO/API (hors game_wiki, deja fait). Liste explicite des tables de
// contenu jeu reel (exclut operationnel/live/sortie Pluton -- price_history*, ah_*,
// bazaar_*, sync_log, player_*, claude_*, pluton_* de sortie, milestone_tier_totals,
// discovery_queue, skyblock_mayor_election/news/fire_sales/bingo_events -- evenements
// courants, pas du contenu permanent). Un seul jugement Haiku par table (echantillon de
// colonnes + quelques lignes), applique a toutes les lignes NON DEJA classees de cette
// table (les tables partiellement couvertes par la regle rarete ne reclassent que leur
// residu).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TIER_TABLES = ['pluton_tier_1_starter', 'pluton_tier_2_amateur', 'pluton_tier_3_intermediate', 'pluton_tier_4_skilled', 'pluton_tier_5_expert', 'pluton_tier_6_professional', 'pluton_tier_7_master']

// (table, colonne id) -- tables de contenu jeu reel candidates a la classification 7-tiers.
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
  ['gemstone_slot_costs', 'id'],
]

const SYSTEM_PROMPT = `Tu classes des TABLES de donnees de reference du jeu Hypixel Skyblock dans un des 7 tiers de progression joueur (networth reel) :
1 Starter (0-5M) | 2 Amateur (5-50M) | 3 Intermediate (50-150M) | 4 Skilled (150-500M) | 5 Expert (500M-1.5B) | 6 Professional (1.5B-5B) | 7 Master (5B+)

Pour chaque table (nom + colonnes + echantillon de lignes), reponds a quel tier un joueur rencontre/utilise TYPIQUEMENT ce contenu. Certaines tables couvrent TOUTE la progression (early a late) -- dans ce cas reponds tier_min et tier_max differents (ex: essence upgrade costs va du tier 1 au tier 7 selon le niveau). D'autres sont concentrees a un seul palier (ex: contenu Kuudra = tier 5-7 uniquement).
Regles :
- N'invente aucune valeur numerique. Base-toi sur le contenu fourni et ta connaissance generale de la progression Hypixel Skyblock.
- Si aucun indice exploitable, reponds tier_min=null.
- confidence=low si tu dois inferer sans signal fort.`

const SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          tier_min: { type: ['integer', 'null'] },
          tier_max: { type: ['integer', 'null'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          reason: { type: 'string' },
        },
        required: ['index', 'tier_min', 'tier_max', 'confidence', 'reason'],
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
  return { classifications: parsed.classifications as Array<{ index: number; tier_min: number | null; tier_max: number | null; confidence: string; reason: string }>, inputTokens: data?.usage?.input_tokens ?? 0, outputTokens: data?.usage?.output_tokens ?? 0 }
}

function tierTableName(tier: number): string { return TIER_TABLES[tier - 1] }

export async function GET(req: NextRequest) {
  try {
    const limit = req.nextUrl.searchParams.get('limit') ? parseInt(req.nextUrl.searchParams.get('limit')!, 10) : 15
    const batchSize = 15

    // Deja classe -- (source_table, source_row_id) pour toutes les tables de reference.
    const doneKeys = new Set<string>()
    for (const tbl of TIER_TABLES) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from(tbl).select('source_table, source_row_id').neq('source_table', 'wiki_table_extract').neq('source_table', 'wiki_haiku_extract').range(offset, offset + 999)
        if (error) throw new Error(`fetch done ${tbl}: ${error.message}`)
        if (!data || data.length === 0) break
        for (const r of data) doneKeys.add(`${r.source_table}::${r.source_row_id}`)
        if (data.length < 1000) break
      }
    }

    // Pour chaque table candidate, fetch toutes ses lignes (la plupart sont petites).
    type TableInfo = { table: string; idCol: string; rows: any[]; sampleText: string }
    const tablesInfo: TableInfo[] = []
    for (const [table, idCol] of REF_TABLES) {
      const allRows: any[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from(table).select('*').range(offset, offset + 999)
        if (error) { console.error(`fetch ${table}: ${error.message}`); break }
        if (!data || data.length === 0) break
        allRows.push(...data)
        if (data.length < 1000) break
      }
      const residual = allRows.filter(r => !doneKeys.has(`${table}::${String(r[idCol])}`))
      if (residual.length === 0) continue
      const cols = residual.length > 0 ? Object.keys(residual[0]) : []
      const sample = residual.slice(0, 4).map(r => JSON.stringify(r)).join(' | ')
      tablesInfo.push({ table, idCol, rows: residual, sampleText: `Table "${table}" -- colonnes: ${cols.join(', ')} -- echantillon: ${sample} (${residual.length} lignes au total)` })
    }

    const toProcess = tablesInfo.slice(0, limit)
    let totalInputTokens = 0, totalOutputTokens = 0, classifiedRows = 0, classifiedTables = 0, nullCount = 0
    const errors: Array<{ table: string; error: string }> = []
    const results: Array<{ table: string; tier_min: number | null; tier_max: number | null; rows: number }> = []

    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batch = toProcess.slice(i, i + batchSize)
      const items = batch.map((t, idx) => ({ index: idx, text: t.sampleText }))
      try {
        const { classifications, inputTokens, outputTokens } = await callHaiku(items)
        totalInputTokens += inputTokens
        totalOutputTokens += outputTokens
        for (const c of classifications) {
          const t = batch[c.index]
          if (!t) continue
          if (c.tier_min === null) { nullCount++; continue }
          const tMin = c.tier_min
          const tMax = c.tier_max ?? c.tier_min
          results.push({ table: t.table, tier_min: tMin, tier_max: tMax, rows: t.rows.length })

          for (let ri = 0; ri < t.rows.length; ri++) {
            const row = t.rows[ri]
            // repartition lineaire si plage tier_min..tier_max, sinon tier fixe
            const tier = tMax > tMin ? Math.min(tMax, tMin + Math.floor((ri / Math.max(1, t.rows.length - 1)) * (tMax - tMin))) : tMin
            const tierTbl = tierTableName(tier)
            const elementName = String(row.display_name ?? row.name ?? row.item_name ?? row.reward_name ?? row.perk_name ?? row.title ?? row.mob_name ?? row[t.idCol] ?? t.table).slice(0, 250)
            const { error } = await supabase.from(tierTbl).insert({
              element_name: elementName,
              element_type: 'reference_data',
              source_table: t.table,
              source_row_id: String(row[t.idCol]),
              raw_data: row,
              classification_method: 'haiku_table_level',
              classification_confidence: c.confidence,
              classification_reason: `${c.reason} (table "${t.table}", plage tier ${tMin}-${tMax})`,
            })
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
      residual_tables_total: tablesInfo.length,
      processed_this_run: toProcess.length,
      remaining_after_this_run: tablesInfo.length - toProcess.length,
      classified_tables: classifiedTables,
      classified_rows: classifiedRows,
      null_count: nullCount,
      error_count: errors.length,
      real_cost_usd: costUsd,
      errors: errors.slice(0, 10),
      results,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
