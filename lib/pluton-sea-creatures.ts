// lib/pluton-sea-creatures.ts
// Pluton Sea Creature kills (21 aout) -- ferme le gap documente depuis la
// construction de Fishing (17 aout) : "tuer un Sea Creature necessite un
// modele de combat qui n'existe pas encore -- c'est precisement le sujet de
// la prochaine activite (Slayer/Combat)". Le moteur DPS/TTK existe
// desormais (lib/pluton-slayer.ts). Construit comme METHODE ADDITIVE
// DISTINCTE (nouveau target_block 'WATER_POOL_SEA_CREATURES',
// activity_key='fishing') plutot que de modifier lib/pluton-fishing.ts en
// place -- meme discipline "multi-methodes" que Dungeons (Floor I clear
// complet vs frag run), evite tout risque de regression sur le calcul
// WATER_POOL deja valide en prod.
//
// Gear de combat = reutilise directement la progression Zombie Slayer deja
// sourcee (Undead Sword->Revenant Falchion->Reaper Falchion+Reaper Armor,
// meme formule de degats -- voir lib/pluton-slayer.ts pour la doc complete
// de la formule). Choix justifie : 2 des 10 Sea Creatures de la pool
// "basic" sont de mob_type Undead (Sea Walker, Rider of the Deep) -- la
// ligne Zombie Slayer donne donc un vrai bonus Multiplicative sur ces 2
// cibles specifiquement, pas un choix arbitraire.
//
// Table des 10 Sea Creatures de la pool "basic" (wiki, pages individuelles
// -- HP/degats/mob_type/table de loot sourcees mot pour mot, poids reels
// deja en base dans sea_creature_pools). Nerf 2025/Mar 12 a fortement reduit
// les PV des communes (Squid 750->50, Sea Walker 1000->100) -- valeurs
// actuelles confirmees, pas les anciennes.
//
// Simplification documentee : le temps de combat (TTK) n'est PAS soustrait
// de la cadence de peche existante (calculee independamment dans
// lib/pluton-fishing.ts, jamais retouchee) -- cette methode ajoute la
// valeur des Sea Creature en PLUS du coins/h "raw_block_only" deja persiste
// pour WATER_POOL, sans re-deriver la cadence. Sous-estime legerement le
// vrai total (le temps de combat existe reellement) mais evite de coupler
// ce nouveau calcul au code Fishing deja valide -- meme discipline que les
// autres gaps partiels/idealises deja documentes (Slayer : phase de farm de
// mobs non modelisee ; Dungeons : Classes non modelisees).
import { createClient } from '@supabase/supabase-js'
import { loadPriceCache, expectedValueFromLootTable, type WeightedLootRow } from './pluton-engine'
import type { TierKey } from './money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const SEA_CREATURE_TARGET_BLOCK_ID = 'WATER_POOL_SEA_CREATURES'
export const SEA_CREATURE_TIER_KEYS: TierKey[] = ['early', 'mid', 'end', 'late']

// Meme formule que lib/pluton-slayer.ts (Damage/Damage Calculation, wiki) --
// duplication intentionnelle plutot que d'exporter les internals de
// pluton-slayer.ts (fichier deja valide en prod, pas retouche).
const BASE_STRENGTH = 0
const BASE_CRIT_CHANCE = 30
const BASE_CRIT_DAMAGE = 50
const COMBAT_LEVEL_60_DAMAGE_ADDITIVE_PCT = 210
const COMBAT_LEVEL_60_CRIT_CHANCE_BONUS = 30

function computeAttacksPerSecond(bonusAttackSpeed: number): number {
  const ticks = Math.max(1, Math.floor(10 / (1 + bonusAttackSpeed / 100)))
  return 20 / ticks
}

function computeDps(baseDamage: number, flatDamageBonus: number, strength: number, multiplicativeFactors: number[]): number {
  const multiplicativeMult = multiplicativeFactors.reduce((a, b) => a * b, 1)
  const nonCrit = (5 + baseDamage + flatDamageBonus) * (1 + strength / 100) * (1 + COMBAT_LEVEL_60_DAMAGE_ADDITIVE_PCT / 100) * multiplicativeMult
  const critChance = BASE_CRIT_CHANCE + COMBAT_LEVEL_60_CRIT_CHANCE_BONUS
  const expectedPerHit = nonCrit * (1 + (critChance / 100) * (BASE_CRIT_DAMAGE / 100))
  return expectedPerHit * computeAttacksPerSecond(0)
}

// Gear Zombie Slayer reutilise (meme mapping que GEAR_BY_SLAYER_TIER dans
// pluton-slayer.ts pour la ligne 'zombie').
const COMBAT_GEAR_BY_TIER: Record<TierKey, { weaponId: string; armorPrefix: string | null }> = {
  early: { weaponId: 'UNDEAD_SWORD', armorPrefix: null },
  mid: { weaponId: 'REVENANT_SWORD', armorPrefix: 'REVENANT' },
  end: { weaponId: 'REAPER_SWORD', armorPrefix: 'REAPER' },
  late: { weaponId: 'REAPER_SWORD', armorPrefix: 'REAPER' },
}

type Creature = {
  name: string
  hp: number
  isUndead: boolean
  weight: number
  loot: WeightedLootRow[]
}

// Poids reels deja en base (sea_creature_pools, pool='basic') -- repetes ici
// pour eviter une jointure supplementaire, valeurs identiques verifiees.
const BASIC_POOL_CREATURES: Creature[] = [
  { name: 'Squid', hp: 50, isUndead: false, weight: 1200, loot: [
    { entry_item_id: 'WATER_LILY', entry_qty: 1.5, chance_pct: 100 },
    { entry_item_id: 'INK_SACK', entry_qty: 2.5, chance_pct: 100 },
    { entry_item_id: 'ENCHANTED_INK_SACK', entry_qty: 1, chance_pct: 0.5 },
    { entry_item_id: 'SQUID_BOOTS', entry_qty: 1, chance_pct: 1 },
  ]},
  { name: 'Sea Walker', hp: 100, isUndead: true, weight: 800, loot: [
    { entry_item_id: 'ROTTEN_FLESH', entry_qty: 5 + 2 * 0.5 + 2 * 0.25, chance_pct: 100 },
    { entry_item_id: 'WATER_LILY', entry_qty: 1, chance_pct: 100 },
  ]},
  { name: 'Sea Witch', hp: 6000, isUndead: false, weight: 700, loot: [
    { entry_item_id: 'WATER_LILY', entry_qty: 1, chance_pct: 100 },
  ]},
  { name: 'Sea Archer', hp: 7000, isUndead: false, weight: 550, loot: [
    { entry_item_id: 'WATER_LILY', entry_qty: 1, chance_pct: 100 },
    { entry_item_id: 'BONE', entry_qty: 8 + 5 * 0.5, chance_pct: 100 },
    { entry_item_id: 'ENCHANTED_BONE', entry_qty: 1, chance_pct: 1 },
    { entry_item_id: null, entry_qty: 1, chance_pct: 100 / 3_000_000 }, // Bone Dye -- aucun prix Bazaar/AH trouve, 0 en esperance (documente)
  ]},
  { name: 'Rider of the Deep', hp: 20000, isUndead: true, weight: 400, loot: [
    { entry_item_id: 'WATER_LILY', entry_qty: 2, chance_pct: 100 },
    { entry_item_id: 'ENCHANTED_FEATHER', entry_qty: 1, chance_pct: 50 },
    { entry_item_id: 'ENCHANTED_ROTTEN_FLESH', entry_qty: 1, chance_pct: 50 },
    { entry_item_id: 'SPONGE', entry_qty: 1, chance_pct: 20 },
    { entry_item_id: 'ENCHANTMENT_MAGNET_6', entry_qty: 1, chance_pct: 2 },
  ]},
  { name: 'Catfish', hp: 26000, isUndead: false, weight: 250, loot: [
    { entry_item_id: 'WATER_LILY', entry_qty: 2 + 0.5, chance_pct: 100 },
    { entry_item_id: 'SPONGE', entry_qty: 1, chance_pct: 20 },
    { entry_item_id: 'ENCHANTMENT_FRAIL_6', entry_qty: 1, chance_pct: 1 },
  ]},
  { name: 'Sea Leech', hp: 60000, isUndead: false, weight: 160, loot: [
    { entry_item_id: 'WATER_LILY', entry_qty: 3 + 0.5, chance_pct: 100 },
    { entry_item_id: 'SPONGE', entry_qty: 1, chance_pct: 40 },
    { entry_item_id: 'ENCHANTMENT_SPIKED_HOOK_6', entry_qty: 1, chance_pct: 2 },
  ]},
  { name: 'Guardian Defender', hp: 70000, isUndead: false, weight: 130, loot: [
    { entry_item_id: 'WATER_LILY', entry_qty: 5 + 0.6 + 0.5, chance_pct: 100 },
    { entry_item_id: 'SPONGE', entry_qty: 1, chance_pct: 100 },
    { entry_item_id: 'ENCHANTED_PRISMARINE_SHARD', entry_qty: 1, chance_pct: 60 },
    { entry_item_id: 'ENCHANTED_PRISMARINE_CRYSTALS', entry_qty: 1, chance_pct: 50 },
    { entry_item_id: 'ENCHANTMENT_LURE_6', entry_qty: 1, chance_pct: 2 },
  ]},
  { name: 'Deep Sea Protector', hp: 150000, isUndead: false, weight: 88, loot: [
    { entry_item_id: 'WATER_LILY', entry_qty: 12 + 0.5 + 0.5 + 0.5, chance_pct: 100 },
    { entry_item_id: 'ENCHANTED_IRON', entry_qty: 2, chance_pct: 100 },
    { entry_item_id: 'SPONGE', entry_qty: 1, chance_pct: 100 },
    { entry_item_id: 'ENCHANTMENT_ANGLER_6', entry_qty: 1, chance_pct: 2 },
  ]},
  { name: 'Water Hydra', hp: 500000 + 250000, isUndead: false, weight: 18, loot: [
    { entry_item_id: 'SPONGE', entry_qty: 5, chance_pct: 100 },
    { entry_item_id: 'WATER_LILY', entry_qty: 16 + 1, chance_pct: 100 },
    { entry_item_id: 'FISH_AFFINITY_TALISMAN', entry_qty: 1, chance_pct: 30 },
    { entry_item_id: 'WATER_HYDRA_HEAD', entry_qty: 1, chance_pct: 14 },
  ]},
]

export type SeaCreatureResult = {
  target_block: string
  tier: TierKey
  weapon: string
  armor: string | null
  avg_ttk_seconds: number
  avg_loot_ev: number
  base_scc_pct: number
  additional_coins_per_hour: number
}

export async function computeSeaCreatureRanking(tier: TierKey): Promise<SeaCreatureResult> {
  const [{ data: weapon }, { data: armor }] = await Promise.all([
    supabase.from('pluton_slayer_weapon_stats').select('*').eq('slayer_key', 'zombie').eq('item_id', COMBAT_GEAR_BY_TIER[tier].weaponId).single(),
    COMBAT_GEAR_BY_TIER[tier].armorPrefix
      ? supabase.from('pluton_slayer_armor_stats').select('*').eq('slayer_key', 'zombie').eq('set_prefix', COMBAT_GEAR_BY_TIER[tier].armorPrefix).single()
      : Promise.resolve({ data: null }),
  ])
  if (!weapon) throw new Error(`Missing Zombie weapon for tier ${tier}`)

  const armorStrength = armor ? Number(armor.set_strength) : 0
  const totalStrength = BASE_STRENGTH + Number(weapon.base_strength) + armorStrength
  const weaponMobTypeMult = 1 + Number(weapon.mob_type_damage_bonus_pct) / 100
  const armorMobTypeMult = armor ? 1 + Number(armor.mob_type_damage_bonus_pct) / 100 : 1

  const dpsVsUndead = computeDps(Number(weapon.base_damage), 0, totalStrength, [weaponMobTypeMult, armorMobTypeMult])
  const dpsVsOther = computeDps(Number(weapon.base_damage), 0, totalStrength, [])

  const allItemIds = BASIC_POOL_CREATURES.flatMap(c => c.loot.map(l => l.entry_item_id)).filter(Boolean) as string[]
  const priceCache = await loadPriceCache(allItemIds)

  const totalWeight = BASIC_POOL_CREATURES.reduce((s, c) => s + c.weight, 0)
  let weightedTtk = 0
  let weightedLootEv = 0
  for (const creature of BASIC_POOL_CREATURES) {
    const dps = creature.isUndead ? dpsVsUndead : dpsVsOther
    const ttk = creature.hp / dps
    const { expectedValue } = expectedValueFromLootTable(creature.loot, priceCache)
    const p = creature.weight / totalWeight
    weightedTtk += p * ttk
    weightedLootEv += p * expectedValue
  }

  // SCC de base (stat "Sea Creature Chance", base 20 -- wiki "Fishing").
  // Volontairement PAS re-derive depuis le setup Fishing deja optimise
  // (WATER_POOL, non retouche) -- voir doc d'en-tete, simplification
  // documentee pour rester additif sans coupler les 2 calculs.
  const baseSccPct = 20

  // Lit le taux de capture deja calcule et valide par Fishing (catches/h)
  // pour ce tier, plutot que de re-deriver la cadence de peche ici.
  const { data: fishingRanking } = await supabase
    .from('pluton_rankings')
    .select('actions_per_hour, pluton_target_blocks!inner(block_id)')
    .eq('activity_key', 'fishing')
    .eq('tier', tier)
    .eq('pluton_target_blocks.block_id', 'WATER_POOL')
    .maybeSingle()
  const catchesPerHour = Number((fishingRanking as any)?.actions_per_hour) || 0

  const additionalCoinsPerHour = catchesPerHour * (baseSccPct / 100) * weightedLootEv

  return {
    target_block: 'Water Pool -- Sea Creature kills (methode additive)',
    tier,
    weapon: weapon.display_name,
    armor: armor?.set_name ?? null,
    avg_ttk_seconds: weightedTtk,
    avg_loot_ev: weightedLootEv,
    base_scc_pct: baseSccPct,
    additional_coins_per_hour: additionalCoinsPerHour,
  }
}

export async function computeAndPersistSeaCreatureRankings(): Promise<SeaCreatureResult[]> {
  const { data: targetBlock } = await supabase
    .from('pluton_target_blocks')
    .select('id')
    .eq('activity_key', 'fishing')
    .eq('block_id', SEA_CREATURE_TARGET_BLOCK_ID)
    .maybeSingle()
  if (!targetBlock) throw new Error(`pluton_target_blocks row missing for ${SEA_CREATURE_TARGET_BLOCK_ID} -- run migration first`)

  const results: SeaCreatureResult[] = []
  const entries = []
  for (const tier of SEA_CREATURE_TIER_KEYS) {
    const r = await computeSeaCreatureRanking(tier)
    results.push(r)
    entries.push({
      tier,
      targetBlockId: targetBlock.id,
      setup: {
        armor_set_prefix: r.armor ?? `Aucune (${r.weapon} seul)`,
        tool_item_id: 'ZOMBIE_SLAYER_GEAR_REUSED',
        total_mining_speed: 0,
        total_mining_fortune: 0,
        real_cost: 0,
        accessories: [{ source_id: '__sea_creature_method__', equip_slot: 'meta', avg_ttk_seconds: r.avg_ttk_seconds, avg_loot_ev: r.avg_loot_ev, base_scc_pct: r.base_scc_pct }],
      },
      ranking: {
        time_seconds: r.avg_ttk_seconds,
        actions_per_hour: 3600 / Math.max(r.avg_ttk_seconds, 0.01),
        yield_per_hour: 3600 / Math.max(r.avg_ttk_seconds, 0.01),
        coins_per_hour: r.additional_coins_per_hour,
      },
    })
  }

  // Persistance manuelle scopee au target_block_id dedie de cette methode --
  // NE PAS appeler persistSetupsAndRankings() du moteur partage ici : son
  // delete() est scope par activity_key seul (delete-puis-rebuild complet
  // d'une activite), ce qui effacerait aussi les lignes WATER_POOL de
  // Fishing deja validees. Cette methode est additive, jamais un rebuild
  // complet de l'activite 'fishing'.
  await supabase.from('pluton_rankings').delete().eq('activity_key', 'fishing').eq('target_block_id', targetBlock.id)
  await supabase.from('pluton_setups').delete().eq('activity_key', 'fishing').in('tier', SEA_CREATURE_TIER_KEYS).contains('accessories', [{ source_id: '__sea_creature_method__' }])

  const setupsToInsert = entries.map(e => ({
    activity_key: 'fishing',
    tier: e.tier,
    investment_level: 'optimal',
    armor_set_prefix: e.setup.armor_set_prefix,
    tool_item_id: e.setup.tool_item_id,
    total_mining_speed: 0,
    total_mining_fortune: 0,
    total_breaking_power: 0,
    real_cost: 0,
    pet_id: null,
    pet_rarity: null,
    accessories: e.setup.accessories,
  }))
  const { data: insertedSetups, error: setupErr } = await supabase.from('pluton_setups').insert(setupsToInsert).select('id')
  if (setupErr || !insertedSetups) throw new Error(`pluton_setups insert failed (sea creature kills): ${setupErr?.message}`)

  const rankingsToInsert = entries.map((e, i) => ({
    activity_key: 'fishing',
    tier: e.tier,
    target_block_id: e.targetBlockId,
    setup_id: insertedSetups[i].id,
    rank: 1,
    mining_time_seconds: e.ranking.time_seconds,
    actions_per_hour: e.ranking.actions_per_hour,
    yield_per_hour: e.ranking.yield_per_hour,
    coins_per_hour_raw_block_only: e.ranking.coins_per_hour,
  }))
  const { error: rankErr } = await supabase.from('pluton_rankings').insert(rankingsToInsert)
  if (rankErr) throw new Error(`pluton_rankings insert failed (sea creature kills): ${rankErr.message}`)

  return results
}
