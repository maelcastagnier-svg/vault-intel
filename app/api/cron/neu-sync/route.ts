// app/api/cron/neu-sync/route.ts
// Sync hebdomadaire depuis NotEnoughUpdates-REPO (github.com/NotEnoughUpdates/NotEnoughUpdates-REPO).
// Reconstruit ce qui a été supprimé le 16 juillet (commit 7df1fa4) — cette fois avec des
// mappings vérifiés contre le contenu réel des fichiers (pas des suppositions sur les noms
// de champs), et un log dans sync_log pour que les échecs soient visibles sans creuser.
//
// Deux niveaux :
// 1. TOUJOURS : cache brut de chaque fichier connu dans neu_constants_raw.
// 2. POUR CERTAINS FICHIERS : mapping vérifié vers une ou plusieurs tables dédiées.
//
// Extension du 3 août (chantier "CHANTIER FINAL" Volet 2, backlog) : ~24 tables
// supplémentaires ajoutées après avoir découvert que la quasi-totalité du backlog
// "Groupe A/B/D" (qu'on pensait wiki-sourcé) est en fait sourcée NEU-REPO -- chaque
// mapping ci-dessous a été vérifié ligne pour ligne contre le contenu réel déjà en
// base avant d'être codé (voir WIKI-MAPPING.md, section "Correction Groupe A/NEU-REPO").
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NEU_RAW = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants'

// Liste confirmée par listing réel du repo (gh api .../contents/constants) le 23 juillet.
const NEU_FILES = [
  'abiphone.json', 'animatedskulls.json', 'attribute_shards.json', 'bazaarstocks.json',
  'bestiary.json', 'bonuses.json', 'calendar.json', 'carnivalshops.json', 'dyes.json',
  'enchants.json', 'essencecosts.json', 'essenceshops.json', 'fairy_souls.json',
  'garden.json', 'gemstonecosts.json', 'gemstones.json', 'george.json',
  'glacite_tunnel_waypoints.json', 'hoppity.json', 'hotflayout.json', 'hotmlayout.json',
  'islands.json', 'legacyrainbownames.json', 'leveling.json', 'misc.json', 'museum.json',
  'parents.json', 'petnums.json', 'pets.json', 'reforges.json', 'reforgestones.json',
  'resource_pack.json', 'rift_guide.json', 'rngscore.json', 'sacks.json', 'sblevels.json',
  'skymart.json', 'trophyfish.json', 'weight.json', 'zones.json',
]

async function fetchNEU(filename: string): Promise<any> {
  const res = await fetch(`${NEU_RAW}/${filename}`)
  if (!res.ok) throw new Error(`fetch ${filename} failed: ${res.status}`)
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

async function replaceAll(table: string, rows: any[], batchSize = 200): Promise<number> {
  const { error: delErr } = await supabase.from(table).delete().gte('id', 0)
  if (delErr) throw new Error(`${table} delete: ` + delErr.message)
  if (rows.length === 0) return 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + batchSize))
    if (error) throw new Error(`${table} insert: ` + error.message)
  }
  return rows.length
}

// ============================================================
// reforges.json → reforges
// ============================================================
async function syncReforges(data: any): Promise<number> {
  const rows: any[] = []
  for (const [name, r] of Object.entries<any>(data)) {
    const itemTypes = r.itemTypes || 'ANY'
    const statsByRarity = r.reforgeStats || {}
    for (const [rarity, stats] of Object.entries(statsByRarity)) {
      rows.push({ reforge_name: name, item_types: itemTypes, rarity, stats })
    }
  }
  return upsertBatched('reforges', rows, 'reforge_name, rarity', 100)
}

// ============================================================
// trophyfish.json → trophy_fish_thresholds
// ============================================================
async function syncTrophyFish(data: any): Promise<number> {
  const rows = Object.entries<any>(data)
    .filter(([, arr]) => Array.isArray(arr) && arr.length >= 4)
    .map(([fish_id, arr]) => ({
      fish_id,
      bronze_threshold: arr[0], silver_threshold: arr[1], gold_threshold: arr[2], diamond_threshold: arr[3],
    }))
  return upsertBatched('trophy_fish_thresholds', rows, 'fish_id')
}

// ============================================================
// essenceshops.json → essence_shop_upgrades
// ============================================================
async function syncEssenceShops(data: any): Promise<number> {
  const rows: any[] = []
  for (const [essenceType, upgrades] of Object.entries<any>(data)) {
    for (const [upgradeId, u] of Object.entries<any>(upgrades)) {
      const costs = (u as any).costs || []
      costs.forEach((cost: number, idx: number) => {
        rows.push({ essence_type: essenceType, upgrade_id: upgradeId, upgrade_name: (u as any).name || upgradeId, level: idx + 1, cost })
      })
    }
  }
  return upsertBatched('essence_shop_upgrades', rows, 'essence_type, upgrade_id, level')
}

// ============================================================
// sblevels.json → sblevel_tasks (category, task_key, total_threshold|xp_per_action, raw_value)
// Vérifié : core_task.collections=2696, fairy_souls=490, pet_score_xp=3 -- match exact
// avec les lignes déjà en base.
// ============================================================
async function syncSblevelTasks(data: any): Promise<number> {
  const rows: any[] = []
  const CATEGORIES = ['core_task', 'dungeon_task', 'essence_shop_task', 'slaying_task', 'skill_related_task', 'miscellaneous_task', 'story_task', 'event_task']
  for (const category of CATEGORIES) {
    const tasks = data[category]
    if (!tasks || typeof tasks !== 'object') continue
    for (const [taskKey, value] of Object.entries<any>(tasks)) {
      if (typeof value !== 'number') continue // ignore les sous-objets imbriqués (ex: bank_upgrades_xp)
      const isXpPerAction = taskKey.endsWith('_xp')
      rows.push({
        category,
        task_key: taskKey,
        total_threshold: isXpPerAction ? null : value,
        xp_per_action: isXpPerAction ? value : null,
        raw_value: value,
      })
    }
  }
  return upsertBatched('sblevel_tasks', rows, 'category, task_key')
}

// ============================================================
// rngscore.json → dungeon_rng_scores (.catacombs) + slayer_rng_scores (.slayer)
// Vérifié : catacombs.F1.BONZO_MASK=10599, slayer["Revenant Horror"].SMITE;6=62434 --
// match exact.
// ============================================================
async function syncRngScores(data: any): Promise<number> {
  const dungeonRows: any[] = []
  for (const [floor, items] of Object.entries<any>(data.catacombs || {})) {
    for (const [item_id, rng_score] of Object.entries<any>(items)) {
      dungeonRows.push({ floor, item_id, rng_score })
    }
  }
  const slayerRows: any[] = []
  for (const [slayer_category, items] of Object.entries<any>(data.slayer || {})) {
    for (const [item_id, rng_score] of Object.entries<any>(items)) {
      slayerRows.push({ slayer_category, item_id, rng_score })
    }
  }
  const a = await upsertBatched('dungeon_rng_scores', dungeonRows, 'floor, item_id')
  const b = await upsertBatched('slayer_rng_scores', slayerRows, 'slayer_category, item_id')
  return a + b
}

// ============================================================
// gemstonecosts.json → gemstone_slot_costs (item_id, slot_id, costs[])
// Vérifié : ABYSSAL_BOOTS.AQUAMARINE_0 = ["FINE_AQUAMARINE_GEM:40","SKYBLOCK_COIN:250000"] exact.
// ============================================================
async function syncGemstoneSlotCosts(data: any): Promise<number> {
  const rows: any[] = []
  for (const [item_id, slots] of Object.entries<any>(data)) {
    for (const [slot_id, costs] of Object.entries<any>(slots)) {
      rows.push({ item_id, slot_id, costs })
    }
  }
  return upsertBatched('gemstone_slot_costs', rows, 'item_id, slot_id')
}

// ============================================================
// islands.json → island_warps (.island_warps[])
// Vérifié : {warp:"elizabeth",mode:"hub",x:-4,y:79,z:16} exact.
// ============================================================
async function syncIslandWarps(data: any): Promise<number> {
  const rows = (data.island_warps || []).map((w: any) => ({
    warp_name: w.warp, island_mode: w.mode, x: w.x, y: w.y, z: w.z,
  }))
  return upsertBatched('island_warps', rows, 'warp_name, island_mode')
}

// ============================================================
// zones.json → game_zones (zone_id, display_name, sub_zones[])
// Vérifié : combat_1 -> Spider's Den + 7 sous-zones, exact.
// ============================================================
async function syncGameZones(data: any): Promise<number> {
  const rows = Object.entries<any>(data).map(([zone_id, z]) => ({
    zone_id, display_name: z.Display, sub_zones: z.Scoreboard || [],
  }))
  return upsertBatched('game_zones', rows, 'zone_id')
}

// ============================================================
// george.json → george_pet_prices (.prices, "PET;rarity" -> prix)
// Vérifié : BAL;3=2000, BAT;0=250 exact (table déjà correcte, 271 lignes -- juste
// besoin d'un cron de refresh).
// ============================================================
async function syncGeorgePetPrices(data: any): Promise<number> {
  const rows = Object.entries<any>(data.prices || {}).map(([pet_rarity_id, npc_sell_price]) => ({
    pet_rarity_id, npc_sell_price,
  }))
  return upsertBatched('george_pet_prices', rows, 'pet_rarity_id')
}

// ============================================================
// petnums.json → pet_stat_progression (pet_id, rarity, level, stat_nums, other_nums)
// Vérifié : AMMONITE.LEGENDARY.1.statNums.SEA_CREATURE_CHANCE=0.06 exact (table déjà
// correcte, 620 lignes -- juste besoin d'un cron de refresh).
// ============================================================
async function syncPetStatProgression(data: any): Promise<number> {
  const rows: any[] = []
  for (const [pet_id, rarities] of Object.entries<any>(data)) {
    for (const [rarity, levels] of Object.entries<any>(rarities)) {
      for (const [levelStr, v] of Object.entries<any>(levels)) {
        rows.push({
          pet_id, rarity, level: parseInt(levelStr, 10),
          stat_nums: v.statNums || {}, other_nums: v.otherNums || [],
        })
      }
    }
  }
  return upsertBatched('pet_stat_progression', rows, 'pet_id, rarity, level')
}

// ============================================================
// hoppity.json → hoppity_prestige (.hoppity.prestigeMultipliers)
// Vérifié : {1:0, 2:0.1, 3:0.25, 4:0.5, 5:1, 6:1.5} exact.
// ============================================================
async function syncHoppityPrestige(data: any): Promise<number> {
  const mults = data.hoppity?.prestigeMultipliers || {}
  const rows = Object.entries<any>(mults).map(([lvl, multiplier]) => ({
    prestige_level: parseInt(lvl, 10), multiplier,
  }))
  return upsertBatched('hoppity_prestige', rows, 'prestige_level')
}

// ============================================================
// misc.json (.base_stats) → player_base_stats (stat_name, base_value)
// Vérifié : speed=100, damage=0, health=100, defence=0, ferocity=0 exact.
// ============================================================
async function syncPlayerBaseStats(miscData: any): Promise<number> {
  const rows = Object.entries<any>(miscData.base_stats || {}).map(([stat_name, base_value]) => ({
    stat_name, base_value,
  }))
  return upsertBatched('player_base_stats', rows, 'stat_name')
}

// ============================================================
// parents.json → item_upgrade_chains (from_item, to_item) -- 726 clés, flatten.
// Vérifié : AATROX_MAYOR_MONSTER -> [COLE_MAYOR_MONSTER, ...] exact.
// misc.json .talisman_upgrades → accessory_upgrade_paths (même format).
// Vérifié : BAT_RING -> [BAT_ARTIFACT] exact.
// misc.json .minionXp → minion_tier_xp (tier -> xp).
// Vérifié : {1:1,...,7:2,8:3,9:4,10:6,11:12,12:24} exact -- même valeurs que trouvées
// sur le wiki "minions" (Tier Crafted -> SkyBlock XP), source NEU préférée (même
// mécanisme neu-sync, pas de dépendance wiki en plus).
// ============================================================
async function syncItemUpgradeChains(parentsData: any): Promise<number> {
  const rows: any[] = []
  for (const [from_item, children] of Object.entries<any>(parentsData)) {
    for (const to_item of children) rows.push({ from_item, to_item })
  }
  return upsertBatched('item_upgrade_chains', rows, 'from_item, to_item')
}

async function syncAccessoryUpgradePaths(miscData: any): Promise<number> {
  const rows: any[] = []
  for (const [from_item, children] of Object.entries<any>(miscData.talisman_upgrades || {})) {
    for (const to_item of children as any[]) rows.push({ from_item, to_item })
  }
  return upsertBatched('accessory_upgrade_paths', rows, 'from_item, to_item')
}

async function syncMinionTierXp(miscData: any): Promise<number> {
  const rows = Object.entries<any>(miscData.minionXp || {}).map(([tier, xp_multiplier]) => ({
    tier: parseInt(tier, 10), xp_multiplier,
  }))
  return upsertBatched('minion_tier_xp', rows, 'tier')
}

// ============================================================
// garden.json → 7 tables (garden_exp, crop_milestones, visitors, plots, plot_costs,
// crop_upgrades, composter_upgrades). Chaque sous-clé vérifiée ligne pour ligne contre
// le contenu déjà en base (voir WIKI-MAPPING.md) avant d'être codée ici.
// ============================================================
async function syncGardenXpLevels(data: any): Promise<number> {
  const arr: number[] = data.garden_exp || []
  const rows = arr.map((xp_required, level) => ({ level, xp_required }))
  return upsertBatched('garden_xp_levels', rows, 'level')
}

async function syncGardenCropMilestones(data: any): Promise<number> {
  const rows: any[] = []
  for (const [crop_id, amounts] of Object.entries<any>(data.crop_milestones || {})) {
    ;(amounts as number[]).forEach((cumulative_amount, idx) => {
      rows.push({ crop_id, milestone_level: idx, cumulative_amount })
    })
  }
  return upsertBatched('garden_crop_milestones', rows, 'crop_id, milestone_level')
}

async function syncGardenVisitors(data: any): Promise<number> {
  const rows = Object.entries<any>(data.visitors || {}).map(([visitor_id, rarity]) => ({ visitor_id, rarity }))
  return upsertBatched('garden_visitors', rows, 'visitor_id')
}

async function syncGardenPlots(data: any): Promise<number> {
  const rows = Object.entries<any>(data.plots || {}).map(([plot_id, p]) => ({
    plot_id, display_name: p.name, grid_x: p.x, grid_y: p.y,
  }))
  return upsertBatched('garden_plots', rows, 'plot_id')
}

async function syncGardenPlotCosts(data: any): Promise<number> {
  const rows: any[] = []
  for (const [difficulty, costs] of Object.entries<any>(data.plot_costs || {})) {
    ;(costs as any[]).forEach((c, idx) => {
      rows.push({ difficulty, plot_order: idx + 1, item_required: c.item, amount_required: c.amount })
    })
  }
  return upsertBatched('garden_plot_costs', rows, 'difficulty, plot_order')
}

async function syncGardenCropUpgradeCosts(data: any): Promise<number> {
  const arr: number[] = data.crop_upgrades || []
  const rows = arr.map((cost_value, idx) => ({ upgrade_tier: idx + 1, cost_value }))
  return upsertBatched('garden_crop_upgrade_costs', rows, 'upgrade_tier')
}

async function syncGardenComposterUpgrades(data: any): Promise<number> {
  const rows: any[] = []
  for (const [upgrade_type, levels] of Object.entries<any>(data.composter_upgrades || {})) {
    for (const [levelStr, v] of Object.entries<any>(levels)) {
      rows.push({
        upgrade_type, level: parseInt(levelStr, 10),
        copper_cost: v.copper ?? null, upgrade_value: v.upgrade ?? null, items_required: v.items || {},
      })
    }
  }
  return upsertBatched('garden_composter_upgrades', rows, 'upgrade_type, level')
}

// ============================================================
// skymart.json → skymart_shop (item_id, display_name, price, currency)
// Vérifié : ADVANCED_GARDENING_AXE -> {display:"§9Advanced Gardening Axe",price:25,currency:"copper"} exact.
// ============================================================
async function syncSkymartShop(data: any): Promise<number> {
  const rows = Object.entries<any>(data).map(([item_id, v]) => ({
    item_id, display_name: v.display, price: v.price, currency: v.currency,
  }))
  return upsertBatched('skymart_shop', rows, 'item_id')
}

// ============================================================
// fairy_souls.json → fairy_soul_locations (zone, coordinate, x, y, z)
// Vérifié : hub[0] = "-233,86,84" exact. Clés non-zones ("//", "Max Souls") ignorées.
// ============================================================
async function syncFairySoulLocations(data: any): Promise<number> {
  const rows: any[] = []
  for (const [zone, coords] of Object.entries<any>(data)) {
    if (!Array.isArray(coords)) continue
    for (const c of coords as string[]) {
      const [x, y, z] = c.split(',').map(Number)
      rows.push({ zone, coordinate: c, x, y, z })
    }
  }
  return upsertBatched('fairy_soul_locations', rows, 'zone, x, y, z')
}

// ============================================================
// rift_guide.json → rift_guide (zone, task_id, task_name, description, wiki_link)
// Vérifié : wyld_woods[0] = {id:"rift_accessory_1", name:"Craft the Crux Talisman", ...} exact.
// ============================================================
async function syncRiftGuide(data: any): Promise<number> {
  const rows: any[] = []
  for (const [zone, tasks] of Object.entries<any>(data)) {
    if (!Array.isArray(tasks)) continue
    for (const t of tasks as any[]) {
      rows.push({ zone, task_id: t.id, task_name: t.name, description: t.description ?? null, wiki_link: t.wiki ?? null })
    }
  }
  return upsertBatched('rift_guide', rows, 'zone, task_id')
}

// ============================================================
// museum.json → museum_item_xp (.itemToXp) + museum_sets (.sets_to_items flatten)
// Vérifié : itemToXp.ABYSMAL_LASSO=1, sets_to_items.ABYSSAL=[4 pièces] exact.
// ============================================================
async function syncMuseum(data: any): Promise<number> {
  const xpRows = Object.entries<any>(data.itemToXp || {}).map(([item_code, xp_value]) => ({ item_code, xp_value }))
  const setRows: any[] = []
  for (const [set_code, items] of Object.entries<any>(data.sets_to_items || {})) {
    for (const item_id of items as string[]) setRows.push({ set_code, item_id })
  }
  const a = await upsertBatched('museum_item_xp', xpRows, 'item_code')
  const b = await upsertBatched('museum_sets', setRows, 'set_code, item_id')
  return a + b
}

// ============================================================
// hotmlayout.json (.hotm.perks) → hotm_perks / hotflayout.json (.hotf.perks) → hotf_perks
// Vérifié : hotm.perks.mole = {name:"Mole",x:3,y:6,maxLevel:200,powder:"GEMSTONE",
// cost:"(pow (+ level 2) 2.2)",stat:"(+ 50 ...)"} exact. hotf.perks.sweep confirmé
// aussi (cost="" est un vrai trou de NEU-REPO lui-même, pas un bug de notre côté --
// reproduit fidèlement, pas inventé).
// ============================================================
function mapPerks(perks: Record<string, any>) {
  return Object.entries(perks).map(([perk_id, p]: [string, any]) => ({
    perk_id,
    perk_name: p.name,
    max_level: p.maxLevel,
    cost_formula: p.cost ?? '',
    stat_formula: p.stat ?? null,
    powder_type: p.powder ?? null,
    lore: Array.isArray(p.lore) ? p.lore.join(' ') : (p.lore ?? ''),
    position_x: p.x,
    position_y: p.y,
  }))
}

async function syncHotmPerks(data: any): Promise<number> {
  const rows = mapPerks(data.hotm?.perks || {})
  return upsertBatched('hotm_perks', rows, 'perk_id')
}

async function syncHotfPerks(data: any): Promise<number> {
  const rows = mapPerks(data.hotf?.perks || {})
  return upsertBatched('hotf_perks', rows, 'perk_id')
}

// ============================================================
// enchants.json → enchantments (name, item_types, max_level, xp_costs)
// Vérifié : enchants_xp_cost.bane_of_arthropods=[10,15,20,25,30,100,200],
// max_xp_table_levels.bane_of_arthropods=5 exact.
// ============================================================
async function syncEnchantments(data: any): Promise<number> {
  const xpCosts: Record<string, number[]> = data.enchants_xp_cost || {}
  const maxLevels: Record<string, number> = data.max_xp_table_levels || {}
  const enchantsByCategory: Record<string, string[]> = data.enchants || {}
  // reverse map : enchant name -> liste des catégories d'items où il apparaît
  const itemTypesByEnchant: Record<string, string[]> = {}
  for (const [category, names] of Object.entries(enchantsByCategory)) {
    for (const n of names) {
      itemTypesByEnchant[n] = itemTypesByEnchant[n] || []
      if (!itemTypesByEnchant[n].includes(category)) itemTypesByEnchant[n].push(category)
    }
  }
  const rows = Object.entries(xpCosts).map(([name, xp_costs]) => ({
    name,
    item_types: itemTypesByEnchant[name] || [],
    max_level: maxLevels[name] ?? null,
    xp_costs,
  }))
  return upsertBatched('enchantments', rows, 'name')
}

// ============================================================
// gemstones.json (.gemstoneTypes) → gemstones (gem_type, stat_name, quality, gear_rarity, bonus_value)
// Vérifié : AMBER.ROUGH.COMMON=4 exact.
// ============================================================
async function syncGemstones(data: any): Promise<number> {
  const rows: any[] = []
  for (const [gem_type, g] of Object.entries<any>(data.gemstoneTypes || {})) {
    for (const [quality, byRarity] of Object.entries<any>(g.stats || {})) {
      for (const [gear_rarity, bonus_value] of Object.entries<any>(byRarity)) {
        rows.push({ gem_type, stat_name: g.statName, quality, gear_rarity, bonus_value })
      }
    }
  }
  return upsertBatched('gemstones', rows, 'gem_type, quality, gear_rarity')
}

// ============================================================
// reforgestones.json → reforge_stones (internal_name, reforge_name, item_types, stats jsonb)
// Vérifié : ONYX = {reforgeName:"Fruitful", itemTypes:"PICKAXE", reforgeCosts.COMMON=100,...} exact.
// Contrainte unique (internal_name, rarity) mais rarity toujours NULL ici (1 ligne par
// pierre, stats jsonb contient déjà le détail par rareté) -- NULL ne matche jamais NULL
// dans un upsert Postgres, donc delete+insert plutôt qu'upsert pour ne pas dupliquer à
// chaque run.
// ============================================================
async function syncReforgeStones(data: any): Promise<number> {
  const rows = Object.entries<any>(data).map(([internal_name, r]) => ({
    internal_name,
    reforge_name: r.reforgeName,
    item_types: r.itemTypes ?? null,
    rarity: null,
    cost: null,
    stats: {
      reforge_costs: r.reforgeCosts ?? {},
      reforge_stats: r.reforgeStats ?? {},
      reforge_ability: r.reforgeAbility ?? null,
      required_rarities: r.requiredRarities ?? [],
    },
    ability: null,
  }))
  return replaceAll('reforge_stones', rows)
}

// ============================================================
// EXTRACTION BRUTE NEU-REPO du 3 août -- lecture du contenu réel de chaque fichier,
// jamais deviné par nom de fichier ni forcé dans une catégorie présupposée (correction
// méthodologique explicite demandée par l'utilisateur). 17 fichiers NEU-REPO fetchés
// mais jamais inspectés jusqu'ici -- la plupart cosmétiques (dyes/animatedskulls/
// legacyrainbownames, skins/couleurs, aucune valeur mécanique) ou vides (resource_pack,
// calendar -- annonces de maintenance périmées 2024) donc volontairement laissés de
// côté. Le reste ci-dessous est du vrai contenu jamais capturé nulle part.
// ============================================================

// abiphone.json → npc_locations -- source réelle confirmée identique aux 84 lignes déjà
// en base (chargées one-shot le 10 juillet sans jamais tracer leur vraie provenance) --
// callNames (21/84 NPCs) jamais capturé, ajouté ici.
async function syncNpcLocations(data: any): Promise<number> {
  const rows = Object.entries<any>(data).map(([npc_name, e]) => ({
    npc_name,
    island: e.island ?? null,
    x: e.x ?? null,
    y: e.y ?? null,
    z: e.z ?? null,
    requirement: Array.isArray(e.requirement) ? e.requirement.join(' ') : (e.requirement ?? null),
    call_names: e.callNames ?? null,
  }))
  return upsertBatched('npc_locations', rows, 'npc_name')
}

// glacite_tunnel_waypoints.json → glacite_tunnel_waypoints -- table déjà réelle (20
// lignes, chargée one-shot), source confirmée exacte, jamais reliée à un cron.
// replaceAll (pas upsert) : le chargement one-shot d'origine indexait waypoint_order
// à partir de 1, ce nouveau parseur à partir de 0 -- un upsert sur (collector_name,
// waypoint_order) laissait une ligne orpheline par collecteur (le dernier index de
// l'ancien schéma, jamais réécrit), trouvé en vérifiant le vrai résultat après un
// premier déploiement (24 lignes au lieu de 20 attendues). Table non lue par aucun
// code applicatif (vérifié), donc aucun impact utilisateur, mais corrigé proprement.
async function syncGlaciteTunnelWaypoints(data: any): Promise<number> {
  const rows: any[] = []
  for (const [collector_name, e] of Object.entries<any>(data)) {
    ;(e.waypoints || []).forEach((w: string, i: number) => {
      const [x, y, z] = w.split(':').map(Number)
      rows.push({ collector_name, title: e.title ?? null, waypoint_order: i, x, y, z })
    })
  }
  return replaceAll('glacite_tunnel_waypoints', rows)
}

// attribute_shards.json → attribute_shards (189 shards) + attribute_shard_leveling_costs
// (5 raretés x 10 niveaux). Système Rift/Kuudra jamais mappé nulle part -- la table
// attribute_shards existait déjà mais vide (0 ligne, schema Phase-0 incompatible),
// reconstruite pour matcher le vrai contenu (voir migration).
async function syncAttributeShards(data: any): Promise<number> {
  const unconsumable = new Set<string>(data.unconsumable_attributes || [])
  const shardRows = (data.attributes || []).map((a: any) => ({
    shard_id: a.shardId,
    bazaar_name: a.bazaarName,
    display_name: a.displayName,
    rarity: a.rarity,
    internal_name: a.internalName,
    ability_name: a.abilityName,
    alignment: a.alignment ?? null,
    family: a.family && a.family.length > 0 ? a.family : null,
    unconsumable: unconsumable.has(a.bazaarName),
  }))
  const n1 = await upsertBatched('attribute_shards', shardRows, 'internal_name')

  const levelRows: any[] = []
  for (const [rarity, costs] of Object.entries<any>(data.attribute_levelling || {})) {
    ;(costs as number[]).forEach((xp_cost, i) => levelRows.push({ rarity, level: i + 1, xp_cost }))
  }
  const n2 = await upsertBatched('attribute_shard_leveling_costs', levelRows, 'rarity, level')
  return n1 + n2
}

// bazaarstocks.json → bazaar_stock_id_map (954 lignes, portée générale -- pas seulement
// attribute shards, ex: enchant tiers ENCHANTMENT_CORRUPTION_5). Backfill en plus
// bazaar_stock_id sur attribute_shards pour les 189 shards concernés (attribute_shards.json
// est traité avant dans NEU_FILES, donc les lignes existent déjà à ce stade).
async function syncBazaarStockMap(data: any): Promise<number> {
  const rows = (data as { stock: string; id: string }[]).map(s => ({
    internal_name: s.id,
    stock_id: s.stock,
  }))
  const n = await upsertBatched('bazaar_stock_id_map', rows, 'internal_name')

  for (const s of data as { stock: string; id: string }[]) {
    if (!s.id.startsWith('ATTRIBUTE_SHARD')) continue
    const { error } = await supabase.from('attribute_shards').update({ bazaar_stock_id: s.stock }).eq('internal_name', s.id)
    if (error) throw new Error('attribute_shards bazaar_stock_id backfill: ' + error.message)
  }
  return n
}

// bestiary.json → bestiary_mobs (mobs réels par zone, 19 zones incl. "dynamic") +
// bestiary_brackets (seuils de kills par palier, 8 brackets). skullOwner/texture
// (têtes de joueur cosmétiques pour l'icône du mob) volontairement pas capturés, même
// convention que le reste du projet.
function cleanMobName(s: string): string {
  return s.replace(/§./g, '').trim()
}
async function syncBestiary(data: any): Promise<number> {
  const mobRows: any[] = []
  for (const [zoneKey, zone] of Object.entries<any>(data)) {
    if (zoneKey === 'brackets' || zoneKey === 'dynamic' && !zone?.mobs) continue
    if (!Array.isArray(zone?.mobs)) continue
    for (const m of zone.mobs) {
      mobRows.push({
        zone_key: zoneKey,
        display_name: cleanMobName(m.name),
        cap: m.cap ?? null,
        bracket: m.bracket ?? null,
        mob_type_ids: m.mobs && m.mobs.length > 0 ? m.mobs : null,
      })
    }
  }
  const n1 = await upsertBatched('bestiary_mobs', mobRows, 'zone_key, display_name')

  const bracketRows: any[] = []
  for (const [bracketNumber, levels] of Object.entries<any>(data.brackets || {})) {
    ;(levels as number[]).forEach((kills_required, i) =>
      bracketRows.push({ bracket_number: parseInt(bracketNumber, 10), level_index: i + 1, kills_required })
    )
  }
  const n2 = await upsertBatched('bestiary_brackets', bracketRows, 'bracket_number, level_index')
  return n1 + n2
}

// bonuses.json → level_bonus_stats (bonus_stats: skill_X + slayer_X → niveau → stat) +
// pet_score_magic_find (pet_rewards) + pet_rarity_value (pet_value). Mécanique jamais
// mappée : chaque niveau de skill/slayer donne un petit bonus de stat passif.
async function syncBonuses(data: any): Promise<number> {
  const statRows: any[] = []
  for (const [sourceKey, levels] of Object.entries<any>(data.bonus_stats || {})) {
    const [sourceType, ...rest] = sourceKey.split('_')
    const key = rest.join('_')
    for (const [level, stats] of Object.entries<any>(levels)) {
      for (const [statName, statValue] of Object.entries<any>(stats)) {
        statRows.push({ source_type: sourceType, source_key: key, level: parseInt(level, 10), stat_name: statName, stat_value: statValue })
      }
    }
  }
  const n1 = await upsertBatched('level_bonus_stats', statRows, 'source_type, source_key, level, stat_name')

  const magicFindRows = Object.entries<any>(data.pet_rewards || {}).map(([score, r]) => ({
    score_threshold: parseInt(score, 10),
    magic_find: r.magic_find,
  }))
  const n2 = await upsertBatched('pet_score_magic_find', magicFindRows, 'score_threshold')

  const rarityValueRows = Object.entries<any>(data.pet_value || {}).map(([rarity, value]) => ({ rarity, value }))
  const n3 = await upsertBatched('pet_rarity_value', rarityValueRows, 'rarity')

  return n1 + n2 + n3
}

// essencecosts.json → essence_upgrade_costs (coût essence par star, 528 items) +
// essence_upgrade_extra_items (items additionnels à certains paliers). Distinct de
// essence_shop_upgrades déjà mappée (l'arbre de la boutique d'essence, pas les coûts
// d'upgrade par item).
async function syncEssenceCosts(data: any): Promise<number> {
  const costRows: any[] = []
  const extraRows: any[] = []
  for (const [itemId, e] of Object.entries<any>(data)) {
    const essenceType = e.type
    for (const [k, v] of Object.entries<any>(e)) {
      if (k === 'type' || k === 'items') continue
      const star = parseInt(k, 10)
      if (isNaN(star)) continue
      costRows.push({ item_id: itemId, essence_type: essenceType, star, essence_cost: v })
    }
    for (const [star, items] of Object.entries<any>(e.items || {})) {
      for (const entry of items as string[]) {
        const [extra_item_id, amount] = entry.split(':')
        extraRows.push({ item_id: itemId, star: parseInt(star, 10), extra_item_id, extra_item_amount: parseInt(amount, 10) })
      }
    }
  }
  const n1 = await upsertBatched('essence_upgrade_costs', costRows, 'item_id, star')
  const n2 = await replaceAll('essence_upgrade_extra_items', extraRows)
  return n1 + n2
}

// carnivalshops.json → carnival_shop_items (boutiques à jetons carnaval, 6 événements
// saisonniers : Spooky Festival, Season of Jerry, Fishing Festival, Mining Fiesta,
// Mythological Ritual, Harvest Feast).
async function syncCarnivalShops(data: any): Promise<number> {
  const rows: any[] = []
  for (const [eventKey, shop] of Object.entries<any>(data.carnivalTokenShops || {})) {
    for (const [itemKey, item] of Object.entries<any>(shop)) {
      rows.push({ event_key: eventKey, item_key: itemKey, display_name: item.name, costs: item.costs })
    }
  }
  return upsertBatched('carnival_shop_items', rows, 'event_key, item_key')
}

// pets.json → pet_level_xp_curve (courbe standard, 119 niveaux) + pet_rarity_level_offset
// (décalage d'index par rareté) + custom_pet_leveling (5 pets à courbe custom : Golden/
// Jade/Rose Dragon, Bingo, Reindeer). pet_types/id_to_display_name/
// pet_item_display_name_to_id volontairement pas capturés -- dictionnaires de noms, pas
// une mécanique de jeu.
async function syncPets(data: any): Promise<number> {
  const curveRows = (data.pet_levels || []).map((xp_required: number, i: number) => ({
    level_index: i + 1,
    xp_required,
  }))
  const n1 = await upsertBatched('pet_level_xp_curve', curveRows, 'level_index')

  const offsetRows = Object.entries<any>(data.pet_rarity_offset || {}).map(([rarity, level_offset]) => ({ rarity, level_offset }))
  const n2 = await upsertBatched('pet_rarity_level_offset', offsetRows, 'rarity')

  const customRows: any[] = []
  for (const [petId, c] of Object.entries<any>(data.custom_pet_leveling || {})) {
    ;(c.pet_levels || []).forEach((xp_required: number, i: number) =>
      customRows.push({ pet_id: petId, pet_type: c.type ?? null, level_index: i + 1, xp_required })
    )
  }
  const n3 = await upsertBatched('custom_pet_leveling', customRows, 'pet_id, level_index')

  return n1 + n2 + n3
}

const DERIVED_TARGETS: Record<string, (data: any) => Promise<number>> = {
  'abiphone.json':                  syncNpcLocations,
  'glacite_tunnel_waypoints.json':  syncGlaciteTunnelWaypoints,
  'attribute_shards.json':          syncAttributeShards,
  'bazaarstocks.json':              syncBazaarStockMap,
  'bestiary.json':                  syncBestiary,
  'bonuses.json':                   syncBonuses,
  'essencecosts.json':              syncEssenceCosts,
  'carnivalshops.json':             syncCarnivalShops,
  'pets.json':                      syncPets,
  'reforges.json':        syncReforges,
  'trophyfish.json':      syncTrophyFish,
  'essenceshops.json':    syncEssenceShops,
  'sblevels.json':        syncSblevelTasks,
  'rngscore.json':        syncRngScores,
  'gemstonecosts.json':   syncGemstoneSlotCosts,
  'islands.json':         syncIslandWarps,
  'zones.json':           syncGameZones,
  'george.json':          syncGeorgePetPrices,
  'petnums.json':         syncPetStatProgression,
  'hoppity.json':         syncHoppityPrestige,
  'parents.json':         syncItemUpgradeChains,
  'skymart.json':         syncSkymartShop,
  'fairy_souls.json':     syncFairySoulLocations,
  'rift_guide.json':      syncRiftGuide,
  'museum.json':          syncMuseum,
  'hotmlayout.json':      syncHotmPerks,
  'hotflayout.json':      syncHotfPerks,
  'enchants.json':        syncEnchantments,
  'gemstones.json':       syncGemstones,
  'reforgestones.json':   syncReforgeStones,
  'misc.json': async (data: any) =>
    (await syncAccessoryUpgradePaths(data)) + (await syncMinionTierXp(data)) + (await syncPlayerBaseStats(data)),
  'garden.json': async (data: any) =>
    (await syncGardenXpLevels(data)) +
    (await syncGardenCropMilestones(data)) +
    (await syncGardenVisitors(data)) +
    (await syncGardenPlots(data)) +
    (await syncGardenPlotCosts(data)) +
    (await syncGardenCropUpgradeCosts(data)) +
    (await syncGardenComposterUpgrades(data)),
}

// Logique principale (exportée pour test direct hors HTTP, même pattern que
// runMoneyMakingAgent()/runSetupGenerateAgent()/runRadarAgent()).
export async function runNeuSync() {
  const logId = await startSync('neu-sync')
  const results: Record<string, any> = {}
  let totalRows = 0
  let hadError = false

  for (const filename of NEU_FILES) {
    try {
      const data = await fetchNEU(filename)

      const { error: cacheErr } = await supabase
        .from('neu_constants_raw')
        .upsert(
          { file_path: 'constants/' + filename, content: data, fetched_at: new Date().toISOString() },
          { onConflict: 'file_path' }
        )
      if (cacheErr) throw new Error('raw cache upsert: ' + cacheErr.message)

      let derivedRows = 0
      if (DERIVED_TARGETS[filename]) {
        derivedRows = await DERIVED_TARGETS[filename](data)
      }

      results[filename] = { success: true, derived_rows: derivedRows }
      totalRows += derivedRows
    } catch (err: any) {
      hadError = true
      results[filename] = { success: false, error: err.message }
    }
  }

  const failedFiles = Object.entries(results).filter(([, r]: any) => !r.success)
  await finishSync(
    logId,
    hadError ? (failedFiles.length === NEU_FILES.length ? 'error' : 'partial') : 'success',
    totalRows,
    { files_ok: NEU_FILES.length - failedFiles.length, files_failed: failedFiles.length, results }
  )

  return {
    success:      !hadError,
    files_synced: NEU_FILES.length - failedFiles.length,
    files_failed: failedFiles.length,
    derived_rows: totalRows,
    results,
  }
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runNeuSync()
  return NextResponse.json(result)
}
