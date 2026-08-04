// app/api/cron/skyhanni-repo-sync/route.ts
// Sync depuis SkyHanni-REPO (github.com/hannibal002/SkyHanni-REPO) -- Source 4 du
// chantier cartographie (chantier "épuisement Source 3/4", 4 août). Découverte du
// jour : le code source du mod SkyHanni lui-même (features/*) est ~90% logique
// UI/interaction, la vraie donnée de jeu vit dans CE repo séparé (référencé via
// `data.jsonobjects.repo.*` dans le code), jamais identifié avant cette passe malgré
// SkyHanni déjà listé comme "Source 4" depuis le 1er août.
// 113 fichiers JSON dans constants/, criblés un par un (contenu réel, pas par nom) --
// 15 tables construites ici, chacune vérifiée non-redondante avec l'existant avant
// codage (ex: DianaDrops.json écarté, déjà couvert plus richement par
// griffin_burrows_loot ; TrophyFish.json écarté, déjà couvert par
// trophy_fish_thresholds ; FameRank.json/StarlynContestRewards distinct de
// starlyn_prize_shop, etc -- voir rapport de session pour le détail des exclusions).
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const REPO_RAW = 'https://raw.githubusercontent.com/hannibal002/SkyHanni-REPO/main/constants'

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(`${REPO_RAW}/${path}`)
  if (!res.ok) throw new Error(`fetch ${path} failed: ${res.status}`)
  return res.json()
}
async function upsertBatched(table: string, rows: any[], onConflict: string, batchSize = 200): Promise<number> {
  if (rows.length === 0) return 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + batchSize), { onConflict })
    if (error) throw new Error(`${table} upsert: ` + error.message)
  }
  return rows.length
}
function parsePos(s: string): { x: number; y: number; z: number } {
  const [x, y, z] = s.split(':').map(Number)
  return { x, y, z }
}

// ============================================================
// Slayer.json -> 4 tables (mob combat stats, gear requirements, pet scaling, tier costs)
// ============================================================
async function syncSlayer(): Promise<number> {
  const data = await fetchJson('Slayer.json')
  let total = 0

  const mobRows: any[] = []
  for (const [boss, byLocation] of Object.entries<any>(data.normal_mobs || {})) {
    for (const [location, mobs] of Object.entries<any>(byLocation)) {
      for (const m of mobs as any[]) {
        mobRows.push({ boss, category: 'normal', tier_or_location: location, mob_name: m.name, level: m.level, max_health: m.max_health, xp: m.xp })
      }
    }
  }
  for (const [boss, byTier] of Object.entries<any>(data.mini_bosses || {})) {
    for (const [tier, mobs] of Object.entries<any>(byTier)) {
      for (const m of mobs as any[]) {
        mobRows.push({ boss, category: 'miniboss', tier_or_location: tier, mob_name: m.name, level: m.level, max_health: m.max_health, xp: m.xp })
      }
    }
  }
  const { error: delErr } = await supabase.from('slayer_mob_combat_stats').delete().gte('id', 0)
  if (delErr) throw new Error('slayer_mob_combat_stats delete: ' + delErr.message)
  if (mobRows.length > 0) {
    const { error } = await supabase.from('slayer_mob_combat_stats').insert(mobRows)
    if (error) throw new Error('slayer_mob_combat_stats insert: ' + error.message)
  }
  total += mobRows.length

  const gearRows: any[] = []
  for (const [boss, weapons] of Object.entries<any>(data.weapons || {})) {
    for (const [item_id, min_slayer_level] of Object.entries<any>(weapons)) {
      gearRows.push({ boss, item_type: 'weapon', item_id, min_slayer_level })
    }
  }
  for (const [boss, equipments] of Object.entries<any>(data.equipments || {})) {
    for (const [item_id, min_slayer_level] of Object.entries<any>(equipments)) {
      gearRows.push({ boss, item_type: 'equipment', item_id, min_slayer_level })
    }
  }
  total += await upsertBatched('slayer_gear_requirements', gearRows, 'boss,item_type,item_id')

  const petRows: any[] = []
  for (const [boss, families] of Object.entries<any>(data.pets || {})) {
    for (const [petFamily, info] of Object.entries<any>(families)) {
      if (!info || !info.proper_pet_names) continue
      petRows.push({ boss, pet_family: petFamily, proper_pet_names: info.proper_pet_names.join(', '), scaling: info.scaling })
    }
  }
  total += await upsertBatched('slayer_pet_scaling', petRows, 'boss,pet_family')

  const costRows: any[] = []
  const xpGains = data.xp_gains || {}
  for (const [boss, tiers] of Object.entries<any>(data.spawn_costs || {})) {
    for (const [tier, cost] of Object.entries<any>(tiers)) {
      costRows.push({ boss, tier: parseInt(tier, 10), spawn_cost: cost, xp_gain: xpGains[boss]?.[tier] ?? null })
    }
  }
  total += await upsertBatched('slayer_tier_costs', costRows, 'boss,tier')

  return total
}

// ============================================================
// SlayerProfitTrackerItems.json -> slayer_drop_items
// ============================================================
async function syncSlayerDropItems(): Promise<number> {
  const data = await fetchJson('SlayerProfitTrackerItems.json')
  const rows: any[] = []
  for (const [boss, items] of Object.entries<any>(data.slayers || {})) {
    for (const item_id of items as string[]) rows.push({ boss, item_id })
  }
  return upsertBatched('slayer_drop_items', rows, 'boss,item_id')
}

// ============================================================
// EnigmaSouls.json -> rift_enigma_soul_locations
// ============================================================
async function syncEnigmaSouls(): Promise<number> {
  const data = await fetchJson('EnigmaSouls.json')
  const rows: any[] = []
  for (const [area, souls] of Object.entries<any>(data.areas || {})) {
    for (const s of souls as any[]) {
      const { x, y, z } = parsePos(s.position)
      rows.push({ area, soul_name: s.name, x, y, z })
    }
  }
  return upsertBatched('rift_enigma_soul_locations', rows, 'area,soul_name')
}

// ============================================================
// MinionXP.json -> minion_item_xp_values
// ============================================================
async function syncMinionItemXp(): Promise<number> {
  const data = await fetchJson('MinionXP.json')
  const rows: any[] = []
  for (const [skill, items] of Object.entries<any>(data.minion_xp || {})) {
    for (const [item_id, xp_value] of Object.entries<any>(items)) {
      rows.push({ skill, item_id, xp_value })
    }
  }
  return upsertBatched('minion_item_xp_values', rows, 'skill,item_id')
}

// ============================================================
// InfernoMinionFuels.json -> inferno_minion_fuels
// ============================================================
async function syncInfernoMinionFuels(): Promise<number> {
  const data = await fetchJson('InfernoMinionFuels.json')
  const rows: any[] = (data.inferno_minion_fuels || []).map((fuel_id: string) => {
    let tier = 'fuel'
    if (fuel_id.startsWith('INFERNO_HEAVY_')) tier = 'heavy'
    else if (fuel_id.startsWith('INFERNO_HYPERGOLIC_')) tier = 'hypergolic'
    const base_material = fuel_id.replace(/^INFERNO_(FUEL|HEAVY|HYPERGOLIC)_/, '')
    return { fuel_id, tier, base_material }
  })
  return upsertBatched('inferno_minion_fuels', rows, 'fuel_id')
}

// ============================================================
// Belts.json -> dojo_belts
// ============================================================
async function syncDojoBelts(): Promise<number> {
  const data = await fetchJson('Belts.json')
  const rows = Object.entries<any>(data.belts || {}).map(([belt_name, points_required]) => ({
    belt_name: belt_name.replace(/§./g, ''), points_required,
  }))
  return upsertBatched('dojo_belts', rows, 'belt_name')
}

// ============================================================
// RiftRace.json -> rift_race_checkpoints
// ============================================================
async function syncRiftRaceCheckpoints(): Promise<number> {
  const data = await fetchJson('rift/RiftRace.json')
  const rows = (data.locations || []).map((pos: string, i: number) => {
    const { x, y, z } = parsePos(pos)
    return { checkpoint_order: i + 1, x, y, z }
  })
  return upsertBatched('rift_race_checkpoints', rows, 'checkpoint_order')
}

// ============================================================
// ArmorDrops.json -> garden_special_armor_crops
// ============================================================
async function syncGardenSpecialArmorCrops(): Promise<number> {
  const data = await fetchJson('ArmorDrops.json')
  const rows = Object.entries<any>(data.special_crops || {}).map(([crop_id, info]) => ({
    crop_id, armor_type_from: info.armor_type, chance_by_fortune_tier: info.chance,
  }))
  return upsertBatched('garden_special_armor_crops', rows, 'crop_id')
}

// ============================================================
// GhostDrops.json -> rift_ghost_drops
// ============================================================
async function syncRiftGhostDrops(): Promise<number> {
  const data = await fetchJson('GhostDrops.json')
  const rows: any[] = []
  for (const item_id of data.ghost_drops || []) rows.push({ drop_category: 'ghost_drops', item_id })
  for (const item_id of data.sacks_drops || []) rows.push({ drop_category: 'sacks_drops', item_id })
  return upsertBatched('rift_ghost_drops', rows, 'drop_category,item_id')
}

// ============================================================
// rift/WiltedBerberisLocations.json -> rift_wilted_berberis_locations
// ============================================================
async function syncWiltedBerberisLocations(): Promise<number> {
  const data = await fetchJson('rift/WiltedBerberisLocations.json')
  const rows = (data.field_centers || []).map((f: any) => {
    const { x, y, z } = parsePos(f.position)
    return { x, y, z, berberis_count: f.count }
  })
  return upsertBatched('rift_wilted_berberis_locations', rows, 'x,y,z')
}

// ============================================================
// MetalDetectorChests.json -> rift_metal_detector_chests
// ============================================================
async function syncMetalDetectorChests(): Promise<number> {
  const data = await fetchJson('MetalDetectorChests.json')
  const rows = (data.locations || []).map((pos: string) => parsePos(pos))
  return upsertBatched('rift_metal_detector_chests', rows, 'x,y,z')
}

// ============================================================
// ExperimentationTable.json -> rift_experimentation_table_rewards
// ============================================================
async function syncExperimentationTableRewards(): Promise<number> {
  const data = await fetchJson('ExperimentationTable.json')
  const ultraRare = new Set<string>(data.ultra_rare_rewards || [])
  const rows = (data.misc_rewards || []).map((item_id: string) => ({ item_id, is_ultra_rare: ultraRare.has(item_id) }))
  return upsertBatched('rift_experimentation_table_rewards', rows, 'item_id')
}

// ============================================================
// foraging/StarlynContestRewards.json -> starlyn_contest_tier_rewards
// ============================================================
async function syncStarlynContestTierRewards(): Promise<number> {
  const data = await fetchJson('foraging/StarlynContestRewards.json')
  const rows = Object.entries<any>(data).map(([tier, info]) => ({
    tier,
    min_points: info.min_points,
    coupons: info.coupons ?? null,
    essence: info.essence ?? null,
    foraging_exp: info.foraging_exp ?? null,
    hotf_exp: info.hotf_exp ?? null,
    whispers: info.whispers ?? null,
    prize_chance: info.prize_chance ?? null,
  }))
  return upsertBatched('starlyn_contest_tier_rewards', rows, 'tier')
}

// ============================================================
// misc/ItemDiscounts.json -> kuudra_faction_discounts
// ============================================================
async function syncKuudraFactionDiscounts(): Promise<number> {
  const data = await fetchJson('misc/ItemDiscounts.json')
  const basePrices: Record<string, number> = data.item_price_coin_only || {}
  const itemsByArea: Record<string, string[]> = data.items_to_discount_by_area || {}
  const scaling: Record<string, Record<string, number>> = data.scaling_discounts || {}

  const rows: any[] = []
  for (const [faction, items] of Object.entries(itemsByArea)) {
    const tiers = scaling[faction] || {}
    for (const item_id of items) {
      for (const [reputation_threshold, discount_pct] of Object.entries(tiers)) {
        rows.push({
          item_id,
          base_coin_price: basePrices[item_id] ?? null,
          faction,
          reputation_threshold: parseInt(reputation_threshold, 10),
          discount_pct,
        })
      }
    }
  }
  const { error: delErr } = await supabase.from('kuudra_faction_discounts').delete().gte('id', 0)
  if (delErr) throw new Error('kuudra_faction_discounts delete: ' + delErr.message)
  if (rows.length > 0) {
    const { error } = await supabase.from('kuudra_faction_discounts').insert(rows)
    if (error) throw new Error('kuudra_faction_discounts insert: ' + error.message)
  }
  return rows.length
}

// ============================================================
// Garden.json -> garden_composter_items, garden_pest_rare_drops, garden_visitor_requests
// (garden_exp/crop_milestones/visitors base info already covered by NEU-REPO garden.json ->
// garden_xp_levels/garden_crop_milestones/garden_visitors -- confirmed exact value match
// before excluding. organic_matter/fuel/pest_rare_drops/visitor need_items+position are
// genuinely new, not in those tables.)
// ============================================================
function toVisitorId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}
async function syncGardenComposterItems(): Promise<number> {
  const data = await fetchJson('Garden.json')
  const rows: any[] = []
  for (const [item_id, value] of Object.entries<any>(data.organic_matter || {})) {
    rows.push({ item_id, value_type: 'organic_matter', value })
  }
  for (const [item_id, value] of Object.entries<any>(data.fuel || {})) {
    rows.push({ item_id, value_type: 'fuel', value })
  }
  return upsertBatched('garden_composter_items', rows, 'item_id,value_type')
}
async function syncGardenPestRareDrops(): Promise<number> {
  const data = await fetchJson('Garden.json')
  const rows: any[] = []
  for (const [pestKey, drops] of Object.entries<any>(data.pest_rare_drops || {})) {
    const pest_name = pestKey.charAt(0) + pestKey.slice(1).toLowerCase()
    for (const [drop_item, drop_rate_denominator] of Object.entries<any>(drops)) {
      rows.push({ pest_name, drop_item, drop_rate_denominator })
    }
  }
  return upsertBatched('garden_pest_rare_drops', rows, 'pest_name,drop_item')
}
async function syncGardenVisitorRequests(): Promise<number> {
  const data = await fetchJson('Garden.json')
  const rows: any[] = []
  for (const [name, info] of Object.entries<any>(data.visitors || {})) {
    let position_x = null, position_y = null, position_z = null
    if (info.position) {
      const p = parsePos(info.position)
      position_x = p.x; position_y = p.y; position_z = p.z
    }
    rows.push({
      visitor_name: toVisitorId(name),
      need_items: info.need_items || [],
      mode: info.mode || null,
      position_x, position_y, position_z,
    })
  }
  return upsertBatched('garden_visitor_requests', rows, 'visitor_name')
}

// ============================================================
// AnitaUpgradeCosts.json -> anita_upgrade_costs
// ============================================================
async function syncAnitaUpgradeCosts(): Promise<number> {
  const data = await fetchJson('AnitaUpgradeCosts.json')
  const rows = Object.entries<any>(data.level_price || {}).map(([level, cost]) => ({
    level: parseInt(level, 10),
    gold_medals: cost.gold_medals ?? null,
    jacob_tickets: cost.jacob_tickets ?? null,
  }))
  return upsertBatched('anita_upgrade_costs', rows, 'level')
}

// ============================================================
// RiftEffigies.json -> rift_effigy_locations
// ============================================================
async function syncRiftEffigyLocations(): Promise<number> {
  const data = await fetchJson('RiftEffigies.json')
  const rows = (data.locations || []).map((pos: string, i: number) => {
    const { x, y, z } = parsePos(pos)
    return { effigy_order: i + 1, x, y, z }
  })
  return upsertBatched('rift_effigy_locations', rows, 'effigy_order')
}

// ============================================================
// events/Diana.json -> diana_sphinx_answers, mythological_ritual_mobs
// ============================================================
async function syncDianaSphinxAnswers(): Promise<number> {
  const data = await fetchJson('events/Diana.json')
  const rows = Object.entries<any>(data.sphinx_questions || {})
    .filter(([q]) => !q.startsWith('//'))
    .map(([question, answer]) => ({ question, answer }))
  return upsertBatched('diana_sphinx_answers', rows, 'question')
}
async function syncMythologicalRitualMobs(): Promise<number> {
  const data = await fetchJson('events/Diana.json')
  const rows = Object.entries<any>(data.mythological_mobs || {}).map(([mob_name, info]) => ({
    mob_name, is_rare: !!info.rare,
  }))
  return upsertBatched('mythological_ritual_mobs', rows, 'mob_name')
}

// ============================================================
// misc/IslandType.json -> skyblock_island_metadata
// ============================================================
async function syncIslandMetadata(): Promise<number> {
  const data = await fetchJson('misc/IslandType.json')
  const rows = Object.entries<any>(data.islands || {}).map(([island_id, info]) => ({
    island_id,
    display_name: info.name || null,
    api_name: info.api_name || null,
    max_players: info.max_players ?? null,
    bounds_min_x: info.bounds?.min_x ?? null,
    bounds_max_x: info.bounds?.max_x ?? null,
    bounds_min_z: info.bounds?.min_z ?? null,
    bounds_max_z: info.bounds?.max_z ?? null,
  }))
  return upsertBatched('skyblock_island_metadata', rows, 'island_id')
}

// ============================================================
// SeaCreatures.json -> sea_creature_fishing_xp
// (distinct from wiki-sourced sea_creature_pools: adds fishing_experience per creature,
// organized by SkyHanni's own zone key rather than the wiki's pool taxonomy)
// ============================================================
async function syncSeaCreatureFishingXp(): Promise<number> {
  const data = await fetchJson('SeaCreatures.json')
  const rows: any[] = []
  for (const [zone, zdata] of Object.entries<any>(data)) {
    for (const [name, info] of Object.entries<any>(zdata.sea_creatures || {})) {
      rows.push({
        zone, name,
        fishing_experience: info.fishing_experience ?? null,
        rarity: info.rarity ?? null,
        is_rare_variant: !!info.rare,
      })
    }
  }
  return upsertBatched('sea_creature_fishing_xp', rows, 'zone,name')
}

// ============================================================
// Items.json (crimson_prestige_costs only -- rest is mod pricing-calculator heuristics,
// not authoritative Hypixel data, deliberately not built) -> kuudra_tier_prestige_costs
// ============================================================
async function syncKuudraTierPrestigeCosts(): Promise<number> {
  const data = await fetchJson('Items.json')
  const rows = Object.entries<any>(data.crimson_prestige_costs || {}).map(([tier, cost]) => ({
    tier,
    essence_crimson: cost.ESSENCE_CRIMSON ?? null,
    kuudra_teeth: cost.KUUDRA_TEETH ?? null,
    skyblock_coin: cost.SKYBLOCK_COIN ?? null,
  }))
  return upsertBatched('kuudra_tier_prestige_costs', rows, 'tier')
}

// ============================================================
// BingoRanks.json -> skyblock_bingo_ranks
// ============================================================
async function syncBingoRanks(): Promise<number> {
  const data = await fetchJson('BingoRanks.json')
  const rows = Object.entries<any>(data.ranks || {}).map(([color_code, rank_order]) => ({
    color_code, rank_order,
  }))
  return upsertBatched('skyblock_bingo_ranks', rows, 'rank_order')
}

// ============================================================
// DanceRoomInstructions.json -> dungeon_dance_room_sequence
// ============================================================
async function syncDungeonDanceRoomSequence(): Promise<number> {
  const data = await fetchJson('DanceRoomInstructions.json')
  const rows = (data.instructions || []).map((action: string, i: number) => ({
    step_order: i + 1, action,
  }))
  return upsertBatched('dungeon_dance_room_sequence', rows, 'step_order')
}

// ============================================================
export async function runSkyhanniRepoSync() {
  const logId = await startSync('skyhanni-repo-sync')
  const results: Record<string, any> = {}
  let totalRows = 0
  let hadError = false

  for (const [name, fn] of Object.entries({
    slayer: syncSlayer,
    slayer_drop_items: syncSlayerDropItems,
    rift_enigma_soul_locations: syncEnigmaSouls,
    minion_item_xp_values: syncMinionItemXp,
    inferno_minion_fuels: syncInfernoMinionFuels,
    dojo_belts: syncDojoBelts,
    rift_race_checkpoints: syncRiftRaceCheckpoints,
    garden_special_armor_crops: syncGardenSpecialArmorCrops,
    rift_ghost_drops: syncRiftGhostDrops,
    rift_wilted_berberis_locations: syncWiltedBerberisLocations,
    rift_metal_detector_chests: syncMetalDetectorChests,
    rift_experimentation_table_rewards: syncExperimentationTableRewards,
    starlyn_contest_tier_rewards: syncStarlynContestTierRewards,
    kuudra_faction_discounts: syncKuudraFactionDiscounts,
    garden_composter_items: syncGardenComposterItems,
    garden_pest_rare_drops: syncGardenPestRareDrops,
    garden_visitor_requests: syncGardenVisitorRequests,
    anita_upgrade_costs: syncAnitaUpgradeCosts,
    rift_effigy_locations: syncRiftEffigyLocations,
    diana_sphinx_answers: syncDianaSphinxAnswers,
    mythological_ritual_mobs: syncMythologicalRitualMobs,
    skyblock_island_metadata: syncIslandMetadata,
    sea_creature_fishing_xp: syncSeaCreatureFishingXp,
    kuudra_tier_prestige_costs: syncKuudraTierPrestigeCosts,
    skyblock_bingo_ranks: syncBingoRanks,
    dungeon_dance_room_sequence: syncDungeonDanceRoomSequence,
  })) {
    try {
      const rows = await fn()
      results[name] = { success: true, rows }
      totalRows += rows
    } catch (err: any) {
      hadError = true
      results[name] = { success: false, error: err.message }
    }
  }

  await finishSync(logId, hadError ? 'partial' : 'success', totalRows, { results })
  return { success: !hadError, total_rows: totalRows, results }
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runSkyhanniRepoSync()
  return NextResponse.json(result)
}
