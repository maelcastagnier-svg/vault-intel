// Temp debug route -- Bloc 8, validation demandée par l'utilisateur : le
// setup Divan's Armor + Divan's Drill (meilleur setup Late/Titanium Ore
// actuel) recalculé avec gemmes Perfect (Amber->Mining Speed, Jade->Mining
// Fortune, réellement sourcées dans `gemstones`, voir migration
// populate_gemstones_amber_jade_mining_only) + enchant Compact X + enchant
// Efficiency X + reforge Jaded. Deleted after validation -- ne touche PAS
// encore computeMiningRanking()/la pipeline persistée, c'est un calcul
// isolé pour répondre à la question "est-ce que ça se rapproche des
// 30-60M/h réels" avant de généraliser l'allocation gemmes/enchants/reforge
// à tout le catalogue (problème d'optimisation différent, pas fait ici).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Compact enchant tier X (max), Mining Speed par tier confirmé sur la page
// wiki "Compact" (déjà en cache) : I=+1 ... X=+10. Applique au Drill
// (catégorie éligible confirmée : Pickaxes/Drills/Gemstone Gauntlet).
const COMPACT_X_MINING_SPEED = 10

// Efficiency enchant tier X (max), sourcé du wiki officiel (31 juillet,
// hors cache -- 2 fetches indépendants convergents : page "Efficiency"
// directe + page "Enchantments") : I=30, II=50, III=70, IV=90, V=110,
// VI=130, VII=150, VIII=170, IX=190, X=210 Mining Speed. Applique au Drill
// (catégorie éligible confirmée : Axe/Pickaxe/Shovel/Drill/Shears/Gauntlet).
const EFFICIENCY_X_MINING_SPEED = 210

// Reforge Jaded (Jaderald), sourcé du wiki officiel (31 juillet, hors
// cache) : Armor UNIQUEMENT (Jaderald "requiert Mining niveau 30 pour
// s'appliquer à l'armure"), pas d'effet outil. Valeurs par rareté de la
// PIÈCE (pas de la gemme) -- croisées sur 2 pages indépendantes
// (Reforging/Armor (Advanced) + tableau de reforges de la page Mining
// Speed) + un exemple chiffré cohérent (+180 Mining Speed sur un set
// complet = 4 x 45 Legendary, exact). Mining Fortune n'a qu'une seule
// source confirmée (moins solide que Mining Speed, mais structurellement
// cohérente). DIVINE non trouvé sur aucune source -- volontairement absent
// plutôt que deviné (règle 7).
const JADED_MINING_SPEED_BY_RARITY: Record<string, number> = {
  COMMON: 5, UNCOMMON: 12, RARE: 20, EPIC: 30, LEGENDARY: 45, MYTHIC: 60,
}
const JADED_MINING_FORTUNE_BY_RARITY: Record<string, number> = {
  COMMON: 5, UNCOMMON: 10, RARE: 15, EPIC: 20, LEGENDARY: 25, MYTHIC: 30,
}

const ARMOR_PIECES = ['DIVAN_HELMET', 'DIVAN_CHESTPLATE', 'DIVAN_LEGGINGS', 'DIVAN_BOOTS']
const DRILL = 'DIVAN_DRILL'

// Pets Mining -- pet_stat_progression était déjà peuplée (620 lignes,
// jamais exploitée par Pluton avant cette passe). Deux candidats réels
// comparés (pas supposé) : Scatha (Legendary, niveau 100) donne Speed ET
// Fortune ; Mole (Legendary, niveau 100) donne plus de Speed seule mais
// zéro Fortune. Le meilleur des deux dépend du calcul réel, pas d'un a
// priori -- les deux scorés ci-dessous, le gagnant retenu.
// Bug de pricing réel trouvé en vérifiant : le pipeline AH ne capture les
// pets que sous un base_item_id générique 'PET' (9 lignes au total, jamais
// nommément Mole/Scatha) -- aucun prix marché réel disponible. Documenté
// honnêtement plutôt que d'utiliser le prix plancher NPC (george_pet_prices)
// comme s'il s'agissait d'un vrai prix AH.
const PET_CANDIDATES = [
  { pet_id: 'SCATHA', rarity: 'LEGENDARY' },
  { pet_id: 'MOLE', rarity: 'LEGENDARY' },
]

// Accessoires Mining -- sourcés du wiki officiel (31 juillet, hors cache),
// page "Equipment" pour les 4 slots (Necklace/Cloak/Belt/Bracelet, un item
// par slot, les 4 portés simultanément -- pas de conflit) + pages dédiées
// pour Titanium Relic / Haste Artifact (Accessory Bag, stackables avec
// l'Equipment et entre eux). "Relic of Power" (item_id réel POWER_RELIC,
// confirmé via la page wiki) reste absent de item_stats/items_catalog --
// vrai trou de collecte, pas une erreur de nom, exclu cette passe faute de
// prix/stats. L'effet Haste III de Haste Artifact n'est PAS modélisé (la
// page "Achieving Maximum" ne donne qu'une conversion approximative
// "équivalent à +150 Mining Speed", pas la vraie formule d'interaction
// avec le calcul par ticks déjà sourcé -- deviner cette conversion
// violerait la règle 7). Seul le stat "+25 Mining Speed" direct et confirmé
// de Haste Artifact est inclus.
const EQUIPMENT_SLOTS: { slot: string; item_id: string; speed: number; fortune: number }[] = [
  { slot: 'Necklace', item_id: 'DIVAN_PENDANT', speed: 100, fortune: 25 },
  { slot: 'Cloak', item_id: 'SAPPHIRE_CLOAK', speed: 30, fortune: 10 },
  { slot: 'Belt', item_id: 'JADE_BELT', speed: 30, fortune: 10 },
  { slot: 'Bracelet', item_id: 'DWARVEN_HANDWARMERS', speed: 45, fortune: 30 },
]
const ACCESSORY_BAG_ITEMS: { item_id: string; speed: number; fortune: number }[] = [
  { item_id: 'TITANIUM_RELIC', speed: 60, fortune: 0 },
  { item_id: 'HASTE_ARTIFACT', speed: 25, fortune: 0 },
]

// HOTM -- décision d'architecture actée avec l'utilisateur (31 juillet) :
// Pluton reste 100% générique, HOTM y est inclus comme un calcul
// d'allocation optimale de Powder PAR TIER, jamais lié à un joueur réel
// (la personnalisation réelle reste le rôle d'Evolve Skills, en aval).
// Axe de progression : le vrai niveau HOTM (1-10, système XP indépendant
// des coins, confirmé via le wiki -- Core of the Mountain NE définit PAS
// ce niveau, correction actée après une 1re hypothèse fausse). Mapping
// tier->niveau HOTM : Early=3 et Mid=6 déjà actés dans
// TIER_CONFIG.access ("Dwarven Mines HotM 1-3" / "Crystal Hollows HotM
// 4-6", money-making-constants.ts, pas inventé ici). End=9/Late=10 n'ont
// PAS de source tierce -- extrapolation honnête de la séquence connue
// (3->6->9->10), documentée comme telle, PAS justifiée par le networth
// (le networth ne prouve rien sur la progression réelle, rappel acté
// plusieurs fois cette semaine -- un joueur "early" peut recevoir un item
// cher en cadeau sans avoir le vrai temps de jeu qui va avec).
// Cette validation porte sur Late (HOTM 10, tous les nodes débloqués).
// Scope limité aux 2 nodes déjà mappés à nos stats trackées
// (perk_id 'mining_speed'/'mining_fortune', cost_formula/stat_formula
// réels dans hotm_perks) -- le wiki liste au moins 7 autres nodes réels
// donnant Mining Speed/Fortune (Gemstone Expertise, Deep Caves, Tungsten
// Affinity, Mineshaft Depth, Hard Stone Mastery, Mineshaft Loot, le
// mécanisme de particule des Pickaxe Enchantments) jamais mappés à un
// perk_id précis de hotm_perks cette passe -- réel gap de généralisation,
// pas caché, à faire avant de considérer HOTM complet.
const HOTM_TIER_LEVEL: Record<string, number> = { early: 3, mid: 6, end: 9, late: 10 }
function hotmNodeMaxCost(costExponent: number, maxLevel: number): number {
  let total = 0
  for (let level = 1; level <= maxLevel; level++) total += Math.pow(level + 2, costExponent)
  return total
}
// mining_speed: cost_formula "(pow (+ level 2) 3)", stat_formula "(* level 20)", max_level 50
// mining_fortune: cost_formula "(pow (+ level 2) 3.05)", stat_formula "(* level 2)", max_level 50
const HOTM_MINING_SPEED_MAX_LEVEL = 50
const HOTM_MINING_FORTUNE_MAX_LEVEL = 50
const HOTM_MINING_SPEED_STAT = HOTM_MINING_SPEED_MAX_LEVEL * 20
const HOTM_MINING_FORTUNE_STAT = HOTM_MINING_FORTUNE_MAX_LEVEL * 2
const HOTM_MINING_SPEED_POWDER_COST = hotmNodeMaxCost(3, HOTM_MINING_SPEED_MAX_LEVEL)
const HOTM_MINING_FORTUNE_POWDER_COST = hotmNodeMaxCost(3.05, HOTM_MINING_FORTUNE_MAX_LEVEL)

export async function GET() {
  const accessoryItemIds = [...EQUIPMENT_SLOTS.map(e => e.item_id), ...ACCESSORY_BAG_ITEMS.map(a => a.item_id)]

  const [{ data: itemRarities }, { data: slots }, { data: gems }, { data: block }, { data: armorStats }, { data: toolStats }, { data: bazaarPrice }, { data: petRows }, { data: accessoryPriceRows }] = await Promise.all([
    supabase.from('item_stats').select('item_id, rarity').in('item_id', [...ARMOR_PIECES, DRILL]),
    supabase.from('gemstone_slot_costs').select('item_id, slot_id').in('item_id', [...ARMOR_PIECES, DRILL]),
    supabase.from('gemstones').select('gem_type, stat_name, gear_rarity, bonus_value').eq('quality', 'PERFECT'),
    supabase.from('pluton_target_blocks').select('*').eq('block_id', 'TITANIUM_ORE').single(),
    supabase.from('pluton_mining_armor_stats').select('*').eq('set_prefix', 'DIVAN'),
    supabase.from('pluton_mining_tool_stats').select('*').eq('item_id', DRILL).single(),
    supabase.from('price_history').select('sell_price').eq('item_id', 'TITANIUM_ORE').gt('sell_price', 0).order('bucket_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('pet_stat_progression').select('pet_id, rarity, stat_nums').eq('level', 100).in('pet_id', PET_CANDIDATES.map(p => p.pet_id)),
    supabase.from('price_history_ah').select('base_item_id, avg_price, bucket_date').in('base_item_id', accessoryItemIds).eq('variant_key', '__all_variants_blended__').order('bucket_date', { ascending: false }),
  ])

  const rarityByItem = new Map((itemRarities || []).map(r => [r.item_id, r.rarity]))
  const gemBonus = new Map<string, number>() // key: `${gem_type}_${gear_rarity}` -> bonus_value
  for (const g of gems || []) gemBonus.set(`${g.gem_type}_${g.gear_rarity}`, Number(g.bonus_value))

  // Compte les slots AMBER_*/JADE_*/MINING_* par item (données réelles,
  // gemstone_slot_costs). MINING_* est un slot combiné (accepte Jade/Amber/
  // Topaz, 1 seul gemme) -- rempli en Amber ici (choix explicite documenté,
  // maximise Mining Speed plutôt que Mining Fortune sur ce slot précis;
  // pas une allocation "optimale" prouvée, juste un choix transparent pour
  // cette validation).
  const slotCounts = new Map<string, { amber: number; jade: number; miningCombo: number }>()
  for (const s of slots || []) {
    const cur = slotCounts.get(s.item_id) || { amber: 0, jade: 0, miningCombo: 0 }
    if (s.slot_id.startsWith('AMBER_')) cur.amber++
    else if (s.slot_id.startsWith('JADE_')) cur.jade++
    else if (s.slot_id.startsWith('MINING_')) cur.miningCombo++
    slotCounts.set(s.item_id, cur)
  }

  let gemMiningSpeedBonus = 0
  let gemMiningFortuneBonus = 0
  let jadedMiningSpeedBonus = 0
  let jadedMiningFortuneBonus = 0
  const breakdown: any[] = []
  for (const itemId of [...ARMOR_PIECES, DRILL]) {
    const rarity = rarityByItem.get(itemId)
    const counts = slotCounts.get(itemId) || { amber: 0, jade: 0, miningCombo: 0 }
    if (!rarity) { breakdown.push({ itemId, error: 'no rarity found' }); continue }
    const perfectAmber = gemBonus.get(`AMBER_${rarity}`) || 0
    const perfectJade = gemBonus.get(`JADE_${rarity}`) || 0
    const speedFromAmber = counts.amber * perfectAmber
    const speedFromCombo = counts.miningCombo * perfectAmber // combo slot filled with Amber
    const fortuneFromJade = counts.jade * perfectJade
    gemMiningSpeedBonus += speedFromAmber + speedFromCombo
    gemMiningFortuneBonus += fortuneFromJade

    // Jaded (armure uniquement, jamais le drill)
    let jadedSpeed = 0, jadedFortune = 0
    if (ARMOR_PIECES.includes(itemId) && rarity) {
      jadedSpeed = JADED_MINING_SPEED_BY_RARITY[rarity] ?? 0
      jadedFortune = JADED_MINING_FORTUNE_BY_RARITY[rarity] ?? 0
      jadedMiningSpeedBonus += jadedSpeed
      jadedMiningFortuneBonus += jadedFortune
    }

    breakdown.push({ itemId, rarity, amber_slots: counts.amber, jade_slots: counts.jade, mining_combo_slots: counts.miningCombo, speed_from_amber: speedFromAmber, speed_from_combo: speedFromCombo, fortune_from_jade: fortuneFromJade, jaded_speed: jadedSpeed, jaded_fortune: jadedFortune })
  }

  const divanArmor = (armorStats || [])[0]
  const divanDrill = toolStats

  const baseMiningSpeed = divanArmor.set_mining_speed + divanDrill.base_mining_speed
  const baseMiningFortune = Number(divanArmor.set_mining_fortune) + Number(divanDrill.base_mining_fortune)

  const gemsCompactSpeed = baseMiningSpeed + gemMiningSpeedBonus + COMPACT_X_MINING_SPEED
  const gemsCompactFortune = baseMiningFortune + gemMiningFortuneBonus

  const gemsCompactEfficiencyJadedSpeed = gemsCompactSpeed + EFFICIENCY_X_MINING_SPEED + jadedMiningSpeedBonus
  const gemsCompactEfficiencyJadedFortune = gemsCompactFortune + jadedMiningFortuneBonus

  function scoreSetup(miningSpeed: number, miningFortune: number) {
    const miningTimeTicks = Math.round((block!.block_strength * 30) / miningSpeed)
    const effectiveTicks = Math.max(miningTimeTicks, 4)
    const miningTimeSeconds = effectiveTicks / 20
    const actionsPerHour = 3600 / miningTimeSeconds
    const yieldPerHour = actionsPerHour * (1 + miningFortune / 100)
    const sellPrice = Number(bazaarPrice?.sell_price) || 0
    const coinsPerHourRawBlockOnly = yieldPerHour * sellPrice
    return { miningTimeSeconds, actionsPerHour, yieldPerHour, sellPrice, coinsPerHourRawBlockOnly }
  }

  // Compare les candidats pets réels (pas supposé) -- garde celui qui score
  // le plus haut coins/h sur ce cas précis.
  const petComparison = (petRows || [])
    .filter(p => PET_CANDIDATES.some(c => c.pet_id === p.pet_id && c.rarity === p.rarity))
    .map(p => {
      const stats = p.stat_nums as Record<string, number>
      const petSpeed = stats.MINING_SPEED || 0
      const petFortune = stats.MINING_FORTUNE || 0
      const withPetSpeed = gemsCompactEfficiencyJadedSpeed + petSpeed
      const withPetFortune = gemsCompactEfficiencyJadedFortune + petFortune
      return { pet_id: p.pet_id, rarity: p.rarity, pet_mining_speed: petSpeed, pet_mining_fortune: petFortune, total_mining_speed: withPetSpeed, total_mining_fortune: withPetFortune, ...scoreSetup(withPetSpeed, withPetFortune) }
    })
    .sort((a, b) => b.coinsPerHourRawBlockOnly - a.coinsPerHourRawBlockOnly)

  const bestPet = petComparison[0]

  // Accessoires -- 4 slots Equipment distincts (portés simultanément, pas
  // de conflit) + 2 items Accessory Bag stackables.
  const latestPriceByItem = new Map<string, number>()
  for (const row of accessoryPriceRows || []) {
    if (!latestPriceByItem.has(row.base_item_id)) latestPriceByItem.set(row.base_item_id, Number(row.avg_price))
  }
  let accessorySpeedBonus = 0, accessoryFortuneBonus = 0, accessoryCost = 0
  const accessoryBreakdown: any[] = []
  for (const eq of EQUIPMENT_SLOTS) {
    accessorySpeedBonus += eq.speed
    accessoryFortuneBonus += eq.fortune
    const price = latestPriceByItem.get(eq.item_id) ?? null
    if (price) accessoryCost += price
    accessoryBreakdown.push({ type: 'equipment', slot: eq.slot, item_id: eq.item_id, speed: eq.speed, fortune: eq.fortune, price })
  }
  for (const acc of ACCESSORY_BAG_ITEMS) {
    accessorySpeedBonus += acc.speed
    accessoryFortuneBonus += acc.fortune
    const price = latestPriceByItem.get(acc.item_id) ?? null
    if (price) accessoryCost += price
    accessoryBreakdown.push({ type: 'accessory_bag', item_id: acc.item_id, speed: acc.speed, fortune: acc.fortune, price })
  }

  const withAccessoriesSpeed = bestPet.total_mining_speed + accessorySpeedBonus
  const withAccessoriesFortune = bestPet.total_mining_fortune + accessoryFortuneBonus

  // HOTM -- validation sur Late (HOTM 10, tous les nodes débloqués),
  // mining_speed + mining_fortune nodes maxés (niveau 50 chacun, coût réel
  // calculé, pas gate sur un budget -- même méthode que gemmes/enchants/
  // pets/accessoires jusqu'ici).
  const withHotmSpeed = withAccessoriesSpeed + HOTM_MINING_SPEED_STAT
  const withHotmFortune = withAccessoriesFortune + HOTM_MINING_FORTUNE_STAT

  return NextResponse.json({
    target_block: block?.block_name,
    before: { total_mining_speed: baseMiningSpeed, total_mining_fortune: baseMiningFortune, ...scoreSetup(baseMiningSpeed, baseMiningFortune) },
    after_gems_and_compact: { total_mining_speed: gemsCompactSpeed, total_mining_fortune: gemsCompactFortune, gem_mining_speed_bonus: gemMiningSpeedBonus, gem_mining_fortune_bonus: gemMiningFortuneBonus, compact_bonus: COMPACT_X_MINING_SPEED, ...scoreSetup(gemsCompactSpeed, gemsCompactFortune) },
    after_gems_compact_efficiency_jaded: { total_mining_speed: gemsCompactEfficiencyJadedSpeed, total_mining_fortune: gemsCompactEfficiencyJadedFortune, efficiency_bonus: EFFICIENCY_X_MINING_SPEED, jaded_speed_bonus: jadedMiningSpeedBonus, jaded_fortune_bonus: jadedMiningFortuneBonus, ...scoreSetup(gemsCompactEfficiencyJadedSpeed, gemsCompactEfficiencyJadedFortune) },
    pet_comparison_all_candidates: petComparison,
    after_best_pet: { ...bestPet, note: 'Prix marché réel indisponible (pipeline AH ne capture les pets que sous un base_item_id générique, jamais nommément) -- pet ajouté sans gate budget cette passe, comme gemmes/enchants/reforge.' },
    after_accessories: {
      total_mining_speed: withAccessoriesSpeed,
      total_mining_fortune: withAccessoriesFortune,
      accessory_speed_bonus: accessorySpeedBonus,
      accessory_fortune_bonus: accessoryFortuneBonus,
      accessory_total_cost: accessoryCost,
      relic_of_power_note: "item_id réel POWER_RELIC confirmé (page wiki) mais absent de item_stats/items_catalog -- vrai trou de collecte, exclu faute de prix/stats.",
      haste_artifact_note: "Effet Haste III non modélisé -- seul le stat direct +25 Mining Speed est inclus, la conversion 'équivalent +150' du wiki est une approximation non sourcée précisément.",
      ...scoreSetup(withAccessoriesSpeed, withAccessoriesFortune),
    },
    accessory_breakdown: accessoryBreakdown,
    after_hotm: {
      total_mining_speed: withHotmSpeed,
      total_mining_fortune: withHotmFortune,
      hotm_tier_level: HOTM_TIER_LEVEL.late,
      hotm_tier_level_note: "Late=10 : extrapolation honnête de la séquence Early=3/Mid=6 (déjà actés via TIER_CONFIG.access) -- PAS prouvé par une source tierce, PAS justifié par le networth (le networth ne prouve rien sur la vraie progression d'un joueur).",
      mining_speed_node: { max_level: HOTM_MINING_SPEED_MAX_LEVEL, stat_bonus: HOTM_MINING_SPEED_STAT, powder_cost_mithril: HOTM_MINING_SPEED_POWDER_COST },
      mining_fortune_node: { max_level: HOTM_MINING_FORTUNE_MAX_LEVEL, stat_bonus: HOTM_MINING_FORTUNE_STAT, powder_cost_mithril: HOTM_MINING_FORTUNE_POWDER_COST },
      scope_note: "Seuls les 2 nodes déjà mappés à nos stats trackées sont inclus -- au moins 7 autres nodes réels donnant Mining Speed/Fortune existent (Gemstone Expertise, Deep Caves, Tungsten Affinity, Mineshaft Depth, Hard Stone Mastery, Mineshaft Loot, Pickaxe Enchantments) mais ne sont pas encore mappés à un perk_id précis de hotm_perks.",
      ...scoreSetup(withHotmSpeed, withHotmFortune),
    },
    slot_breakdown: breakdown,
  })
}
