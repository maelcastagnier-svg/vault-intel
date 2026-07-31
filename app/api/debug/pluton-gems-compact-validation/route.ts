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

export async function GET() {
  const [{ data: itemRarities }, { data: slots }, { data: gems }, { data: block }, { data: armorStats }, { data: toolStats }, { data: bazaarPrice }, { data: petRows }] = await Promise.all([
    supabase.from('item_stats').select('item_id, rarity').in('item_id', [...ARMOR_PIECES, DRILL]),
    supabase.from('gemstone_slot_costs').select('item_id, slot_id').in('item_id', [...ARMOR_PIECES, DRILL]),
    supabase.from('gemstones').select('gem_type, stat_name, gear_rarity, bonus_value').eq('quality', 'PERFECT'),
    supabase.from('pluton_target_blocks').select('*').eq('block_id', 'TITANIUM_ORE').single(),
    supabase.from('pluton_mining_armor_stats').select('*').eq('set_prefix', 'DIVAN'),
    supabase.from('pluton_mining_tool_stats').select('*').eq('item_id', DRILL).single(),
    supabase.from('price_history').select('sell_price').eq('item_id', 'TITANIUM_ORE').gt('sell_price', 0).order('bucket_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('pet_stat_progression').select('pet_id, rarity, stat_nums').eq('level', 100).in('pet_id', PET_CANDIDATES.map(p => p.pet_id)),
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

  return NextResponse.json({
    target_block: block?.block_name,
    before: { total_mining_speed: baseMiningSpeed, total_mining_fortune: baseMiningFortune, ...scoreSetup(baseMiningSpeed, baseMiningFortune) },
    after_gems_and_compact: { total_mining_speed: gemsCompactSpeed, total_mining_fortune: gemsCompactFortune, gem_mining_speed_bonus: gemMiningSpeedBonus, gem_mining_fortune_bonus: gemMiningFortuneBonus, compact_bonus: COMPACT_X_MINING_SPEED, ...scoreSetup(gemsCompactSpeed, gemsCompactFortune) },
    after_gems_compact_efficiency_jaded: { total_mining_speed: gemsCompactEfficiencyJadedSpeed, total_mining_fortune: gemsCompactEfficiencyJadedFortune, efficiency_bonus: EFFICIENCY_X_MINING_SPEED, jaded_speed_bonus: jadedMiningSpeedBonus, jaded_fortune_bonus: jadedMiningFortuneBonus, ...scoreSetup(gemsCompactEfficiencyJadedSpeed, gemsCompactEfficiencyJadedFortune) },
    pet_comparison_all_candidates: petComparison,
    after_best_pet: { ...petComparison[0], note: 'Prix marché réel indisponible (pipeline AH ne capture les pets que sous un base_item_id générique, jamais nommément) -- pet ajouté sans gate budget cette passe, comme gemmes/enchants/reforge.' },
    slot_breakdown: breakdown,
  })
}
