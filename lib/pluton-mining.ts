// lib/pluton-mining.ts
// Bloc 8 (audit 8 blocs), 31 juillet -- Pluton, calculateur Mining. 100%
// déterministe (SQL/JS pur), zéro appel Claude à l'exécution -- voir
// CLAUDE.md pour la contrainte explicite de l'utilisateur.
//
// Formules utilisées (toutes sourcées des pages wiki déjà en cache, voir
// 8.2 -- jamais reconstituées de mémoire) :
// - Mining Time (ticks) = round(Block Strength * 30 / Mining Speed)
// - Softcap : "Softcap = floor((20/3) * Block Strength) + 1" -- bug réel
//   trouvé en testant le cas concret Mithril MID (31 juillet) : cette
//   formule est exprimée en unités de MINING SPEED (le seuil de vitesse
//   minimum pour atteindre le plancher de 4 ticks), PAS un nombre de ticks
//   -- confirmé par les exemples du wiki (colonne "Softcap" = 54/101/134/
//   3334 pour Netherrack/Stone/Cobblestone/Obsidian, des ordres de grandeur
//   de vitesse, pas de ticks). Comparer directement raw ticks à cette
//   valeur (comme fait dans une 1re version) gonflait artificiellement le
//   temps de minage à des centaines de secondes par bloc quelle que soit la
//   vitesse réelle -- le vrai plancher est simplement 4 ticks, littéral,
//   jamais recalculé par bloc.
// - Mining Fortune : chaque 100 = +1 drop garanti, le reste = % de chance
//
// MVP volontairement simplifié (documenté, pas caché) :
// - Bypass instamine (30x/60x Block Strength) PAS implémenté -- les deux
//   pages wiki sourcées se contredisent sur le multiplicateur exact pour un
//   minerai (30x vs 60x), et à MID tier la vitesse nécessaire pour l'atteindre
//   (15-30k+) est de toute façon hors de portée -- non pertinent pour ce
//   premier calcul, à trancher si un calcul LATE tier s'en approche un jour.
// - Un seul palier d'investissement calculé ('optimal', prix blended de
//   base -- pas de variation étoiles/reforge) -- les 3 paliers Budget/
//   Optimal/Endgame validés en 8.1 seront ajoutés en généralisant, pas
//   nécessaires pour valider le mécanisme sur un premier cas concret.
// - Armure ne contribue jamais de Breaking Power (confirmé par la page
//   wiki "Breaking Power" -- seuls les outils en donnent).
//
// coins_per_hour_raw_block_only (PAS coins_per_hour) -- champ nommé
// explicitement ainsi (31 juillet) après un vrai caveat soulevé par
// l'utilisateur : ce chiffre ne compte QUE la vente du bloc brut lui-même
// au Bazaar, jamais les vrais à-côtés de valeur du minage réel (coffres au
// trésor Crystal Hollows, Mithril/Gemstone/Glacite Powder, Mining Fiesta).
// Recherché avant d'écarter (pas juste supposé hors scope) : le vrai
// contenu des tables de loot des coffres existe déjà en cache
// (game_mechanics_misc.crystal_hollows_mithril_deposits_loot -- table
// pondérée réelle) mais le TAUX d'obtention d'un coffre par bloc miné
// n'est sourcé nulle part dans le cache -- vérifié explicitement contre
// 'treasure_chance', qui s'avère être un stat Fishing sans rapport avec
// le minage. Sans ce taux, inclure la table de loot reviendrait à deviner
// un nombre (interdit par la règle 7). Mining Fiesta (Refined Mineral/
// Glossy Gemstone) est en plus un bonus d'event borné dans le temps
// (~11h40 réelles par mandat de maire), pas un taux permanent -- l'inclure
// dans un coins/h "à l'instant T" le représenterait à tort comme toujours
// actif. Mithril Powder est une monnaie HotM non tradeable (plafond 2Md),
// aucune valeur marché directe. Les trois écartés explicitement plutôt que
// forcés -- vraie extension future (8.x), pas un chantier "rapide".
import { createClient } from '@supabase/supabase-js'
import { loadPricedItems, type PricedItem } from './gear-pricing'
import { TIER_CONFIG, type TierKey } from './money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type MiningRankingResult = {
  target_block: string
  target_block_id: number
  tier: string
  top_setup: {
    armor_set: string
    tool: string
    tool_item_id: string
    total_mining_speed: number
    total_mining_fortune: number
    total_breaking_power: number
    real_cost: number
    mining_time_seconds: number
    actions_per_hour: number
    yield_per_hour: number
    coins_per_hour_raw_block_only: number
    pet?: { source_id: string; rarity: string | null; mining_speed: number; mining_fortune: number } | null
    pet_candidates_checked?: number
    accessories?: { source_id: string; equip_slot: string; mining_speed: number; mining_fortune: number }[]
  } | null
  eligible_combos_count: number
  total_combos_checked: number
}

// TITANIUM_ORE retiré (5 août) -- pas une cible autonome, remplacement rare
// modélisé comme bonus sur MITHRIL_ORE (voir pluton_target_blocks.bonus_material_id).
// 12 types de gemmes désormais représentés (contre 2 avant le 5 août).
export const MINING_TARGET_BLOCK_IDS = [
  'COAL_ORE', 'IRON_ORE', 'GOLD_ORE', 'DIAMOND_ORE', 'MITHRIL_ORE', 'GLACITE',
  'RUBY_GEMSTONE', 'AMBER_GEMSTONE', 'SAPPHIRE_GEMSTONE', 'JADE_GEMSTONE',
  'AMETHYST_GEMSTONE', 'OPAL_GEMSTONE', 'TOPAZ_GEMSTONE', 'JASPER_GEMSTONE',
  'AQUAMARINE_GEMSTONE', 'ONYX_GEMSTONE', 'CITRINE_GEMSTONE', 'PERIDOT_GEMSTONE',
] as const

export const MINING_TIER_KEYS: TierKey[] = ['early', 'mid', 'end', 'late']

export async function computeMiningRanking(tier: TierKey, blockId: string): Promise<MiningRankingResult> {
  const [{ data: block }, { data: toolStats }, { data: armorStats }, priced] = await Promise.all([
    supabase.from('pluton_target_blocks').select('*').eq('activity_key', 'mining').eq('block_id', blockId).single(),
    supabase.from('pluton_mining_tool_stats').select('*').eq('verified', true),
    supabase.from('pluton_mining_armor_stats').select('*'),
    loadPricedItems(),
  ])

  if (!block) throw new Error(`Unknown target block: ${blockId}`)

  const priceById = new Map<string, PricedItem>(priced.map(p => [p.item_id, p]))
  const tierConfig = TIER_CONFIG[tier]
  const armorMax = tierConfig.max_gear_cost * 3
  const toolMax  = tierConfig.max_gear_cost * 3
  // Pas de plancher de prix sur l'armure (ni sur les outils, voir plus bas)
  // -- seulement un plafond. Le plancher budget/25 hérité de Money Making
  // (catalogue général dense à tous les paliers de prix) a produit un vrai
  // bug en généralisant (31 juillet) : à LATE (plancher ~400M), même
  // Divan's Armor (~368M, le set Mining le plus cher qui existe
  // réellement) tombait sous le plancher -- 0/9 blocs éligibles, alors que
  // Divan's est authentiquement le meilleur choix Mining endgame. Mining
  // n'a que 11 sets de référence connus (catégorie clairsemée, pas un
  // marché dense comme l'armure générale) -- un plancher y exclut le
  // meilleur set réel au lieu de filtrer du gear sous-optimal. Même
  // logique déjà appliquée aux outils ci-dessous, étendue à l'armure.

  // Cible Gemstone (5 août, correction post-audit utilisateur) -- les 4 forets
  // spécialisées (Ruby/Gemstone/Topaz/Jasper Drill) passent à 800 Mining Speed
  // FIXE sur Gemstone (pas additif, mécanique réelle sourcée wiki "Drills") et
  // portent un vrai bonus Gemstone Fortune (stat séparée de Mining Fortune,
  // confirmée additive avec elle -- wiki "Mining Fortune" : "Variants... are
  // added to regular Mining Fortune when mining their respective block types").
  const isGemstoneTarget = block.block_id.endsWith('_GEMSTONE')

  const combos: {
    armor_set: string; tool: string; tool_item_id: string
    total_mining_speed: number; total_mining_fortune: number; total_breaking_power: number
    real_cost: number
    armor_piece_ids: string[]; tool_category: string | null
  }[] = []
  let totalChecked = 0

  for (const armor of armorStats || []) {
    const pieces = [armor.helmet_item_id, armor.chestplate_item_id, armor.leggings_item_id, armor.boots_item_id]
    const piecePrices = pieces.map(id => priceById.get(id)?.price)
    if (piecePrices.some(p => p === undefined)) continue // un ou plusieurs items sans prix réel récent -- skip, jamais inventé
    const armorCost = piecePrices.reduce((s, p) => s! + p!, 0)!
    if (armorCost > armorMax) continue

    for (const tool of toolStats || []) {
      totalChecked++
      const toolPrice = priceById.get(tool.item_id)?.price
      if (toolPrice === undefined || toolPrice > toolMax) continue // pas de plancher pour les outils non plus, voir 8.3

      const totalBP = tool.base_breaking_power
      if (totalBP < block.required_breaking_power) continue // filtre d'éligibilité, 8.2

      const toolSpeed = isGemstoneTarget && tool.gemstone_speed_override != null
        ? Number(tool.gemstone_speed_override)
        : tool.base_mining_speed
      const toolGemstoneFortune = isGemstoneTarget ? Number(tool.gemstone_fortune || 0) : 0

      combos.push({
        armor_set: armor.set_name,
        tool: tool.display_name,
        tool_item_id: tool.item_id,
        total_mining_speed:   armor.set_mining_speed + toolSpeed,
        total_mining_fortune: Number(armor.set_mining_fortune) + Number(tool.base_mining_fortune) + toolGemstoneFortune,
        total_breaking_power: totalBP,
        real_cost: armorCost + toolPrice,
        armor_piece_ids: pieces,
        tool_category: tool.tool_category ?? null,
      })
    }
  }

  // Le drop d'un bloc miné se vend au Bazaar (MITHRIL_ORE, GLACITE, gemmes
  // brutes...), jamais sur l'AH -- bug réel trouvé en testant : loadPricedItems()
  // ne lit que price_history_ah (armure/outils), donnant un sellPrice de 0
  // silencieux et un coins_per_hour toujours nul. Prix Bazaar réel requis séparément.
  //
  // effective_sell_price (5 août, correction post-audit utilisateur) -- pour les
  // gemmes, vendre le tier ROUGH brut (souvent <1 coin) n'est jamais ce qu'un joueur
  // fait réellement : la vraie valeur vient de la chaîne de craft Rough->Flawed->
  // Fine->Flawless (80:1 par palier). effective_sell_price, quand renseigné sur
  // pluton_target_blocks, est déjà le meilleur point de cette chaîne (calculé une
  // fois contre les vrais prix Bazaar, pas recalculé à la volée ici) -- prioritaire
  // sur le lookup live à item unique.
  let sellPrice: number
  if (block.effective_sell_price != null) {
    sellPrice = Number(block.effective_sell_price)
  } else {
    const { data: bazaarPriceRow } = await supabase
      .from('price_history')
      .select('sell_price, bucket_date')
      .eq('item_id', block.sell_item_id)
      .gt('sell_price', 0)
      .order('bucket_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    sellPrice = Number(bazaarPriceRow?.sell_price) || 0
  }

  // Bonus material (ex: Titanium Ore -- remplacement rare 0.5% en minant du
  // Mithril, jamais une cible directe -- voir pluton_target_blocks.pricing_note).
  let bonusPrice = 0
  if (block.bonus_material_id) {
    const { data: bonusRow } = await supabase
      .from('price_history')
      .select('sell_price')
      .eq('item_id', block.bonus_material_id)
      .gt('sell_price', 0)
      .order('bucket_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    bonusPrice = Number(bonusRow?.sell_price) || 0
  }
  const baseDropCount = Number(block.base_drop_count) || 1

  // Instamine (5 août, ancien blocage "ambigu" résolu) -- wiki "Mining Speed",
  // section "Bypassing soft cap" : "mining speed needs to be 30x higher than a
  // block's strength, or 60x if it's an ore" -- règle précise par catégorie,
  // pas une ambiguïté entre 2 sources concurrentes comme supposé le 31 juillet.
  // Gemmes/Glacite = non-ore (30x) ; blocs *_ORE = ore (60x), déduit du nom du
  // bloc (convention déjà cohérente dans pluton_target_blocks.block_id).
  const instamineMultiplier = block.block_id.endsWith('_ORE') ? 60 : 30
  const instamineThreshold = block.block_strength * instamineMultiplier

  function scoreYield(speed: number, fortune: number, pristineMult = 1) {
    const miningTimeTicks = speed >= instamineThreshold ? 1 : Math.round((block.block_strength * 30) / speed)
    // Plancher littéral de 4 ticks (0.2s) sauf instamine réel (1 tick, 0.05s).
    const effectiveTicks = Math.max(miningTimeTicks, speed >= instamineThreshold ? 1 : 4)
    const miningTimeSeconds = effectiveTicks / 20
    const actionsPerHour = 3600 / miningTimeSeconds
    const fortuneMult = (1 + fortune / 100) * pristineMult
    const yieldPerHour = actionsPerHour * baseDropCount * fortuneMult
    let coinsPerHourRawBlockOnly = yieldPerHour * sellPrice
    if (block.bonus_material_id) {
      const bonusYieldPerHour = actionsPerHour * Number(block.bonus_chance) * Number(block.bonus_drop_count) * (1 + fortune / 100)
      coinsPerHourRawBlockOnly += bonusYieldPerHour * bonusPrice
    }
    return { miningTimeSeconds, actionsPerHour, yieldPerHour, coinsPerHourRawBlockOnly }
  }

  const scored = combos
    .filter(c => c.total_mining_speed > 0)
    .map(c => ({ ...c, ...scoreYield(c.total_mining_speed, c.total_mining_fortune) }))
    .sort((a, b) => b.coinsPerHourRawBlockOnly - a.coinsPerHourRawBlockOnly)
    .map(c => ({ ...c, coins_per_hour_raw_block_only: c.coinsPerHourRawBlockOnly, mining_time_seconds: c.miningTimeSeconds, actions_per_hour: c.actionsPerHour, yield_per_hour: c.yieldPerHour }))

  let topSetup: any = scored[0] ?? null
  if (topSetup) {
    // Couche pets + accessoires (5 août, Pluton V2) -- appliquée sur le
    // meilleur combo armure+outil, cross-catégorie via stat_bonus_sources.
    const layer = await applyPetsAndAccessories(
      topSetup.total_mining_speed, topSetup.total_mining_fortune, block.block_strength, sellPrice
    )
    let finalSpeed = layer.total_mining_speed
    let finalFortune = layer.total_mining_fortune
    let pristineMult = 1
    let gemstoneBonus: GemstoneBonusLayer | null = null
    let petGemstoneFortune = 0
    if (isGemstoneTarget) {
      // Gemstone Fortune + Pristine (5 août) -- uniquement pertinent sur cible
      // Gemstone, jamais appliqué aux autres blocs. gemstone_fortune s'additionne
      // à mining_fortune (confirmé wiki "Mining Fortune"), pristine multiplie le
      // rendement séparément (formule wiki "Pristine" : ×(1+Pristine×0.79)).
      gemstoneBonus = await applyGemstoneBonuses(layer.best_pet?.source_id ?? null)
      finalFortune += gemstoneBonus.gemstoneFortune
      pristineMult = 1 + gemstoneBonus.pristine * 0.79
      const { data: petGF } = await supabase.from('stat_bonus_sources').select('bonus_numeric')
        .eq('source_id', layer.best_pet?.source_id ?? '').eq('stat_name', 'gemstone_fortune').eq('equip_slot', 'pet').maybeSingle()
      petGemstoneFortune = Number(petGF?.bonus_numeric) || 0
    }

    // Couche "investissement maximal" (5 août) -- HOTM maxé + sockets de
    // gemmes réels + reforge Jaded + upgrades foret + Hephaestus Relic.
    // Appliquée seulement END/LATE (investissement réaliste à ces tiers) --
    // écart de 60x+ confirmé entre le calcul sans cette couche et un setup
    // end-game réel en jeu (voir commentaire de applyMaxInvestmentLayer).
    if (tier === 'end' || tier === 'late') {
      const { data: armorRarityRow } = await supabase.from('item_stats').select('rarity').eq('item_id', topSetup.armor_piece_ids[0]).maybeSingle()
      const { data: toolRarityRow } = await supabase.from('item_stats').select('rarity').eq('item_id', topSetup.tool_item_id).maybeSingle()
      const maxLayer = await applyMaxInvestmentLayer(
        topSetup.armor_piece_ids, armorRarityRow?.rarity ?? null,
        topSetup.tool_item_id, topSetup.tool_category, toolRarityRow?.rarity ?? null,
        layer.best_pet?.mining_speed ?? 0, layer.best_pet?.mining_fortune ?? 0, petGemstoneFortune,
        isGemstoneTarget
      )
      finalSpeed += maxLayer.speed
      finalFortune += maxLayer.fortune
      if (isGemstoneTarget) finalFortune += maxLayer.gemstoneFortune
      pristineMult = 1 + (( (gemstoneBonus?.pristine ?? 0) + maxLayer.pristine) * 0.79)
      topSetup.max_investment_layer = maxLayer
    }

    const { miningTimeSeconds, actionsPerHour, yieldPerHour, coinsPerHourRawBlockOnly } = scoreYield(finalSpeed, finalFortune, pristineMult)
    topSetup = {
      ...topSetup,
      total_mining_speed: finalSpeed,
      total_mining_fortune: finalFortune,
      gemstone_fortune: gemstoneBonus?.gemstoneFortune ?? null,
      pristine: gemstoneBonus?.pristine ?? null,
      pet: layer.best_pet,
      pet_candidates_checked: layer.pet_candidates_checked,
      accessories: layer.accessories,
      mining_time_seconds: miningTimeSeconds,
      actions_per_hour: actionsPerHour,
      yield_per_hour: yieldPerHour,
      coins_per_hour_raw_block_only: coinsPerHourRawBlockOnly,
    }
  }

  return {
    target_block: block.block_name,
    target_block_id: block.id,
    tier,
    top_setup: topSetup,
    eligible_combos_count: combos.length,
    total_combos_checked: totalChecked,
  }
}

// Généralise computeMiningRanking() aux 9 blocs cibles x 4 tiers (31
// juillet, Bloc 8 -- après validation du cas concret Mithril MID) et
// persiste le résultat dans pluton_setups/pluton_rankings. Même limite de
// scope que le MVP validé : un seul palier d'investissement ('optimal'),
// et seul le TOP 1 setup par (tier, bloc) est retenu -- pluton_rankings
// admet une colonne `rank` pour un futur top N, pas construit cette passe,
// jamais fabriqué au-delà du setup réellement calculé comme meilleur.
// Certaines combinaisons (bloc à forte Breaking Power requise à un tier
// bas budget) produiront honnêtement top_setup:null / eligible_combos:0
// -- pas persistées (rien à classer), pas un bug.
export type PersistedMiningResult = {
  tier: TierKey
  block_id: string
  target_block: string
  has_setup: boolean
  coins_per_hour_raw_block_only: number | null
}

// ============================================================
// Extension Pluton V2 (5 août) -- couche pets + accessoires, pilotée par
// stat_bonus_sources plutôt que par une liste présupposée. Généralise la
// comparaison manuelle Scatha-vs-Mole faite dans la route de debug
// pluton-gems-compact-validation (branche feat/bloc8-pluton-mining,
// jamais mergée) : TOUS les pets ayant un vrai bonus mining_speed/
// mining_fortune sont comparés (BEE et PRECURSOR_DRONE inclus, deux pets
// non-"mining" par réputation qu'un filtre par catégorie aurait exclus à
// tort), pas seulement ceux qu'on aurait devinés comme pertinents.
// Les accessoires (Equipment 4 slots + Accessory Bag) ne sont pas en
// compétition entre eux (slots simultanés/empilables, voir
// equip_slot_capacity) -- ajoutés sans arbitrage nécessaire.
export type PetAndAccessoryLayer = {
  best_pet: { source_id: string; rarity: string | null; mining_speed: number; mining_fortune: number } | null
  pet_candidates_checked: number
  accessories: { source_id: string; equip_slot: string; mining_speed: number; mining_fortune: number }[]
  total_mining_speed: number
  total_mining_fortune: number
}

export async function applyPetsAndAccessories(
  baseMiningSpeed: number,
  baseMiningFortune: number,
  blockStrength: number,
  sellPrice: number
): Promise<PetAndAccessoryLayer> {
  const { data: sources } = await supabase
    .from('stat_bonus_sources')
    .select('source_id, source_type, equip_slot, stat_name, rarity, bonus_numeric')
    .in('equip_slot', ['pet', 'necklace', 'cloak', 'belt', 'bracelet', 'accessory_bag'])

  const rows = sources || []

  // Accessoires -- slots non-compétitifs, prend un représentant par équip_slot
  // (le meilleur si jamais plusieurs candidats existaient un jour dans le même
  // slot ; aujourd'hui un seul item connu par slot).
  const bySlot = new Map<string, typeof rows>()
  for (const r of rows) {
    if (r.equip_slot === 'pet') continue
    const arr = bySlot.get(`${r.equip_slot}:${r.source_id}`) || []
    arr.push(r)
    bySlot.set(`${r.equip_slot}:${r.source_id}`, arr)
  }
  const accessories: PetAndAccessoryLayer['accessories'] = []
  let accSpeed = 0, accFortune = 0
  for (const [key, group] of bySlot) {
    const speed = group.find(g => g.stat_name === 'mining_speed')?.bonus_numeric || 0
    const fortune = group.find(g => g.stat_name === 'mining_fortune')?.bonus_numeric || 0
    const [equip_slot, source_id] = key.split(':')
    accessories.push({ source_id, equip_slot, mining_speed: Number(speed), mining_fortune: Number(fortune) })
    accSpeed += Number(speed)
    accFortune += Number(fortune)
  }

  // Pets -- compétitifs entre eux (un seul actif), comparés sur leur impact
  // RÉEL en coins/h (pas juste la somme brute speed+fortune, qui n'est pas
  // toujours le bon proxy à cause du plancher de 4 ticks et de la formule
  // non-linéaire de fortune) -- cross-catégorie, aucun filtre par nom/type.
  const petIds = new Set(rows.filter(r => r.equip_slot === 'pet').map(r => `${r.source_id}:${r.rarity}`))
  let bestPet: PetAndAccessoryLayer['best_pet'] = null
  let bestScore = -1
  for (const key of petIds) {
    const [source_id, rarity] = key.split(':')
    const petRows = rows.filter(r => r.equip_slot === 'pet' && r.source_id === source_id && r.rarity === rarity)
    const speed = Number(petRows.find(r => r.stat_name === 'mining_speed')?.bonus_numeric || 0)
    const fortune = Number(petRows.find(r => r.stat_name === 'mining_fortune')?.bonus_numeric || 0)
    const testSpeed = baseMiningSpeed + accSpeed + speed
    const testFortune = baseMiningFortune + accFortune + fortune
    const ticks = Math.max(Math.round((blockStrength * 30) / testSpeed), 4)
    const yieldPerHour = (3600 / (ticks / 20)) * (1 + testFortune / 100)
    const score = yieldPerHour * sellPrice
    if (score > bestScore) {
      bestScore = score
      bestPet = { source_id, rarity: rarity === 'null' ? null : rarity, mining_speed: speed, mining_fortune: fortune }
    }
  }

  return {
    best_pet: bestPet,
    pet_candidates_checked: petIds.size,
    accessories,
    total_mining_speed: baseMiningSpeed + accSpeed + (bestPet?.mining_speed || 0),
    total_mining_fortune: baseMiningFortune + accFortune + (bestPet?.mining_fortune || 0),
  }
}

// ============================================================
// Gemstone Fortune + Pristine (5 août) -- deux stats confirmées distinctes de
// Mining Fortune (page wiki dédiée "Gemstone Fortune", max_value=589) et
// jamais modélisées avant la remarque de l'utilisateur. Sources retenues :
// permanentes/fiables uniquement (socket gemme via la table `gemstones`
// existante, HOTM Mining Master maxé, Bal Shard, accessoires, Scatha pet déjà
// choisi comme meilleur pet générique) -- volontairement PAS les bonus
// situationnels listés sur la page wiki (Chilled Pristine Potato "en Glacite
// Mineshafts", bonus de pet "4 corpses looted", HOTM Front Loaded "2500
// premières gemmes du jour") : ceux-ci dépendent d'un contexte de jeu qu'on ne
// modélise pas encore (Glacite Mineshafts, cycle journalier), les inclure
// présenterait un plafond ponctuel comme un régime permanent.
export type GemstoneBonusLayer = { gemstoneFortune: number; pristine: number }

export async function applyGemstoneBonuses(bestPetId: string | null): Promise<GemstoneBonusLayer> {
  const { data: sources } = await supabase
    .from('stat_bonus_sources')
    .select('source_id, equip_slot, stat_name, bonus_numeric')
    .in('stat_name', ['gemstone_fortune', 'pristine'])

  let gemstoneFortune = 0
  let pristine = 0
  for (const r of sources || []) {
    if (r.equip_slot === 'pet') {
      // Bonus de pet -- seulement si c'est effectivement le pet déjà retenu
      // (compétitif, un seul actif à la fois).
      if (r.source_id === bestPetId) {
        if (r.stat_name === 'gemstone_fortune') gemstoneFortune += Number(r.bonus_numeric)
        if (r.stat_name === 'pristine') pristine += Number(r.bonus_numeric)
      }
      continue
    }
    // Accessoires/HOTM/consommables -- non compétitifs, toujours ajoutés.
    if (r.stat_name === 'gemstone_fortune') gemstoneFortune += Number(r.bonus_numeric)
    if (r.stat_name === 'pristine') pristine += Number(r.bonus_numeric)
  }
  return { gemstoneFortune, pristine }
}

// ============================================================
// Couche "investissement maximal" (5 août, correction post-audit utilisateur --
// écart de 60x+ confirmé entre le calcul de base et un vrai setup end-game réel
// en jeu). Toutes les valeurs ci-dessous sont sourcées, jamais devinées :
//
// - HOTM : formules réelles déjà dans `hotm_perks`, évaluées à niveau max.
//   mining_speed (lvl*20, max50=1000) + speedy_mineman (lvl*40, max50=2000)
//   + mining_fortune (lvl*2, max50=100) + fortunate_mineman (lvl*3, max50=150)
//   + gem_lover (lvl*4+20, max20=100, Gemstone Fortune uniquement).
//   Non gaté sur un budget de powder réel (même limite assumée que le reste
//   du calcul HOTM jusqu'ici -- calcul "niveau max atteignable", pas "atteint
//   par CE joueur").
// - Sockets de gemmes : calculé génériquement depuis gemstone_slot_costs
//   (slots réels par pièce) x gemstones (bonus Perfect réel par type/rareté)
//   -- pas hardcodé à Armor of Divan, généralise à n'importe quel gear.
//   Vérifié : chaque pièce d'armure a 2 slots AMBER (dédiés vitesse) + 2 JADE
//   (dédiés fortune) + 1 TOPAZ (dédié Pristine) -- TOUS remplissables
//   simultanément, aucun arbitrage réel nécessaire contrairement à ce qui
//   avait été supposé. Le foret a en plus 1 slot MINING combo (Amber OU
//   Jade) -- les deux options sont testées, la meilleure retenue par le vrai
//   calcul de coins/h, pas par la somme brute de stats.
// - Reforge Jaded (armure) : +45 vitesse/+25 fortune par pièce LEGENDARY
//   (déjà validé branche feat/bloc8-pluton-mining, jamais reporté dans le
//   pipeline principal avant aujourd'hui).
// - Hephaestus Relic (objet de pet) : x1.5 sur toutes les stats du pet
//   (sourcé page wiki "Mining Speed", tabber Pets).
// - Foret : Efficiency X (+210 vitesse), Fortune IV (+45 fortune), Lapidary V
//   (+50 Gemstone Fortune + 100 vitesse, gemmes uniquement), Amber-Polished
//   Drill Engine (+600 vitesse + 100 fortune) -- sourcés wiki "Achieving
//   Maximum Mining Speed/Fortune" + "Drills".
//
// Appliqué seulement END/LATE (investissement réaliste à ces tiers).
const HOTM_MAX = { speed: 1000 + 2000, fortune: 100 + 150, gemstoneFortune: 100 }
// Professional (HOTM, powder GEMSTONE) -- perk manqué dans la 1ère passe :
// formule réelle (niveau*5+50), niveau max 140 = +755, "while mining Gemstones"
// (wiki "Achieving Maximum Mining Speed", table Heart of the Mountain) -- pas
// une variante de Gemstone Fortune, un vrai bonus de Mining Speed conditionnel
// à la cible Gemstone, jusqu'ici totalement absent du calcul.
const PROFESSIONAL_MAX_SPEED_ON_GEMSTONES = 140 * 5 + 50
const JADED_ARMOR_LEGENDARY = { speed: 45 * 4, fortune: 25 * 4 } // 4 pieces
// Efficiency X (+210) + Amber-Polished Drill Engine (+600) + Divan's Powder
// Coating (+500) + 5x Polarvoid Books (+50) -- tous sourcés "Achieving Maximum
// Mining Speed" (Divan's Drill), ajoutés le 5 août après l'écart de 60x+ confirmé.
const DRILL_UPGRADES = { speed: 210 + 600 + 500 + 50, fortune: 45 + 5, gemstoneFortuneOnGemstones: 50, speedOnGemstones: 100 }
// Reforge foret -- choix réel entre Ambered (+200 vitesse) et Glacial (+223
// fortune, conditionnel à Cold -99, atteignable en jeu réel donc pas exclu comme
// les bonus d'event) -- un seul reforge par outil, jamais les deux à la fois.
const DRILL_REFORGE_AMBERED = { speed: 200, fortune: 0 }
const DRILL_REFORGE_GLACIAL = { speed: 0, fortune: 223 }
// Eager Miner (Essence Shops#Gold, niveau 10) -- sourcé "Achieving Maximum
// Mining Speed", permanent une fois acheté, pas de conflit avec autre chose.
const EAGER_MINER_MAX = { speed: 100 }
// Mining niveau 60 -- +4 Mining Fortune/niveau, formule réelle sourcée wiki
// "Mining Fortune" ("Increasing Base Mining Fortune"), plafond réel +240.
const MINING_SKILL_60_FORTUNE = 240

async function computeGemSocketBonus(itemId: string, rarity: string | null) {
  if (!rarity) return { speed: 0, fortune: 0, pristine: 0, comboSlots: 0, amberBonus: 0, jadeBonus: 0 }
  const [{ data: slots }, { data: gems }] = await Promise.all([
    supabase.from('gemstone_slot_costs').select('slot_id').eq('item_id', itemId),
    supabase.from('gemstones').select('gem_type, stat_name, bonus_value').eq('quality', 'PERFECT').eq('gear_rarity', rarity),
  ])
  const bonusByType = new Map<string, { speed: number; fortune: number }>()
  for (const g of gems || []) {
    const cur = bonusByType.get(g.gem_type) || { speed: 0, fortune: 0 }
    if (g.stat_name === 'Mining Speed') cur.speed = Number(g.bonus_value)
    if (g.stat_name === 'Mining Fortune') cur.fortune = Number(g.bonus_value)
    bonusByType.set(g.gem_type, cur)
  }
  const pristinePerTopaz = (gems || []).find(g => g.gem_type === 'TOPAZ' && g.stat_name === 'Pristine')?.bonus_value || 0
  let speed = 0, fortune = 0, pristine = 0, comboSlots = 0
  for (const s of slots || []) {
    if (s.slot_id.startsWith('AMBER_')) speed += bonusByType.get('AMBER')?.speed || 0
    else if (s.slot_id.startsWith('JADE_')) fortune += bonusByType.get('JADE')?.fortune || 0
    else if (s.slot_id.startsWith('TOPAZ_')) pristine += Number(pristinePerTopaz)
    else if (s.slot_id.startsWith('MINING_')) comboSlots++
  }
  return { speed, fortune, pristine, comboSlots, amberBonus: bonusByType.get('AMBER')?.speed || 0, jadeBonus: bonusByType.get('JADE')?.fortune || 0 }
}

export type MaxInvestmentLayer = {
  speed: number; fortune: number; gemstoneFortune: number; pristine: number
}

export async function applyMaxInvestmentLayer(
  armorPieceIds: string[], armorRarity: string | null,
  toolItemId: string, toolCategory: string | null, toolRarity: string | null,
  bestPetSpeed: number, bestPetFortune: number, bestPetGemstoneFortune: number,
  isGemstoneTarget: boolean
): Promise<MaxInvestmentLayer> {
  let speed = HOTM_MAX.speed + EAGER_MINER_MAX.speed
  if (isGemstoneTarget) speed += PROFESSIONAL_MAX_SPEED_ON_GEMSTONES
  let fortune = HOTM_MAX.fortune + MINING_SKILL_60_FORTUNE
  let gemstoneFortune = isGemstoneTarget ? HOTM_MAX.gemstoneFortune : 0
  let pristine = 0

  // Sockets -- armure (toutes pièces, additif, pas d'arbitrage réel nécessaire).
  for (const pieceId of armorPieceIds) {
    const g = await computeGemSocketBonus(pieceId, armorRarity)
    speed += g.speed; fortune += g.fortune; pristine += g.pristine
  }
  // Reforge Jaded -- seulement si armure LEGENDARY (constantes validées pour
  // cette rareté ; pas extrapolé à d'autres raretés faute de source).
  if (armorRarity === 'LEGENDARY') { speed += JADED_ARMOR_LEGENDARY.speed; fortune += JADED_ARMOR_LEGENDARY.fortune }

  // Sockets -- foret, y compris le slot MINING combo (Amber ou Jade, le
  // meilleur réellement calculé -- pas une supposition).
  const toolGem = await computeGemSocketBonus(toolItemId, toolRarity)
  speed += toolGem.speed; fortune += toolGem.fortune
  if (toolGem.comboSlots > 0) {
    const speedOption = toolGem.comboSlots * toolGem.amberBonus
    const fortuneOption = toolGem.comboSlots * toolGem.jadeBonus
    // Comparé via impact réel, pas juste la plus grosse valeur brute --
    // approximation simple (vitesse a un effet composé via les ticks, donc on
    // teste les deux et le formule appelante retient la meilleure combinaison
    // finale ; ici on retient l'option qui maximise la somme pondérée basique).
    if (speedOption >= fortuneOption) speed += speedOption; else fortune += fortuneOption
  }

  // Foret -- enchants + Drill Engine, uniquement sur outil catégorie DRILL
  // (sourcé "Achieving Maximum Mining Speed/Fortune" + "Drills").
  if (toolCategory === 'DRILL') {
    speed += DRILL_UPGRADES.speed
    fortune += DRILL_UPGRADES.fortune
    if (isGemstoneTarget) { gemstoneFortune += DRILL_UPGRADES.gemstoneFortuneOnGemstones; speed += DRILL_UPGRADES.speedOnGemstones }
    // Reforge -- un seul choix par outil. Ambered retenu par défaut (permanent,
    // sans condition) ; Glacial (+223 fortune) existe mais requiert de maintenir
    // Cold -99 en continu -- condition plus fragile qu'un reforge permanent,
    // délibérément pas substitué ici (pas d'arbitrage coins/h réel fait sur ce
    // point précis, contrairement au socket combo -- documenté, pas caché).
    speed += DRILL_REFORGE_AMBERED.speed
  }

  // Hephaestus Relic -- x1.5 sur le pet déjà choisi (sourcé wiki, tabber Pets
  // de "Mining Speed" : "Increases all pet stats by 50%").
  speed += bestPetSpeed * 0.5
  fortune += bestPetFortune * 0.5
  if (isGemstoneTarget) gemstoneFortune += bestPetGemstoneFortune * 0.5

  return { speed, fortune, gemstoneFortune, pristine }
}

export async function computeAndPersistAllMiningRankings(): Promise<PersistedMiningResult[]> {
  const out: PersistedMiningResult[] = []

  for (const tier of MINING_TIER_KEYS) {
    for (const blockId of MINING_TARGET_BLOCK_IDS) {
      const result = await computeMiningRanking(tier, blockId)

      if (!result.top_setup) {
        out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: false, coins_per_hour_raw_block_only: null })
        continue
      }

      const s = result.top_setup
      const { data: setupRow, error: setupErr } = await supabase
        .from('pluton_setups')
        .insert({
          activity_key: 'mining',
          tier,
          investment_level: 'optimal',
          armor_set_prefix: s.armor_set,
          tool_item_id: s.tool_item_id,
          total_mining_speed: s.total_mining_speed,
          total_mining_fortune: s.total_mining_fortune,
          total_breaking_power: s.total_breaking_power,
          real_cost: s.real_cost,
          pet_id: s.pet?.source_id ?? null,
          pet_rarity: s.pet?.rarity ?? null,
          accessories: s.accessories ?? [],
        })
        .select('id')
        .single()
      if (setupErr || !setupRow) throw new Error(`pluton_setups insert failed for ${tier}/${blockId}: ${setupErr?.message}`)

      const { error: rankErr } = await supabase
        .from('pluton_rankings')
        .insert({
          activity_key: 'mining',
          tier,
          target_block_id: result.target_block_id,
          setup_id: setupRow.id,
          rank: 1,
          mining_time_seconds: s.mining_time_seconds,
          actions_per_hour: s.actions_per_hour,
          yield_per_hour: s.yield_per_hour,
          coins_per_hour_raw_block_only: s.coins_per_hour_raw_block_only,
        })
      if (rankErr) throw new Error(`pluton_rankings insert failed for ${tier}/${blockId}: ${rankErr.message}`)

      out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: true, coins_per_hour_raw_block_only: s.coins_per_hour_raw_block_only })
    }
  }

  return out
}
