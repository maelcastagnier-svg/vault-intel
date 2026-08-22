// lib/pluton-fishing.ts
// Pluton Fishing (17 aout) -- 4e activite generalisee apres Mining/Farming/
// Foraging, meme discipline (jamais de constante de jeu reconstituee de
// memoire, tout source wiki officiel/Supabase). Mecanique la plus complexe
// des 4 : une capture se resout en 4 rolls successifs (wiki "Fishing#Drops"
// et page "Fishing", section d'intro) :
//   1. Sea Creature (chance = Sea Creature Chance stat, base 20, ÷4 sur
//      Private Island/Garden, effet max a 100)
//   2. Trophy (Lotus Atoll/Crimson Isle uniquement -- hors scope, notre cible
//      "Water" generique ne les propose pas)
//   3. Treasure (chance = Treasure Chance stat, si pas de Sea Creature),
//      qualite 89%/10%/1% good/great/outstanding (wiki page "Treasure")
//   4. sinon, capture Fish/Junk normale
//
// **Sea Creature EXCLU du calcul de coins_per_hour_raw_block_only** -- gap
// documente, pas un oubli : tuer un Sea Creature necessite un modele de
// combat (PV du mob, degats/seconde du joueur, temps de kill) qui n'existe
// pas encore dans Pluton -- c'est precisement le sujet de la prochaine
// activite (Slayer/Combat). Meme discipline que Mining qui exclut le taux de
// coffre au tresor (jamais sourcable) : on ne force jamais une valeur non
// calculable plutot que de l'inventer. Sea Creature Chance reste neanmoins
// modelisee comme UNE FRACTION DE CAPTURES PERDUES (jamais retirees du
// denominateur des captures/heure), donc le nombre final sous-estime le vrai
// revenu Fishing (Sea Creature loot est souvent la vraie source principale
// de revenu en jeu) -- documente honnetement, meme categorie que
// "raw_block_only" de Mining qui exclut aussi les coffres au tresor.
//
// Formule bite-time (wiki "Fishing Speed#Mechanics", page "Fishing Speed") :
//   BaseTicks = nombre aleatoire entre 200 et 400 (sans Lure, non modelise)
//   Ticks = BaseTicks - (FishingSpeed/FishingSpeedCap) x BaseTicks
//   Secondes = Ticks / 20 (TicksPerSecond)
//   Si FishingSpeed >= FishingSpeedCap : Ticks = 0 (capture instantanee)
// FishingSpeedCap = 300 "Everywhere else" (notre cible Water generique,
// distinct des caps speciaux Backwater Bayou=200/Lotus Atoll=250/Crimson
// Isle=350, non pertinents pour cette cible).
// Apres la morsure, un decompte aleatoire 1-4s (moyenne 2.5s) precede la
// prise -- PAS affecte par Fishing Speed, reductible jusqu'a -25% via
// l'enchant Quick Bite (applique uniquement END/LATE, cout d'investissement
// realiste a ce palier).
//
// Aucune stat de gear ne determine la cadence de swing/lancer elle-meme
// (contrairement a Mining Speed) -- le plafond moteur Minecraft (20
// TPS) n'intervient PAS ici comme chez Farming/Foraging : la formule
// bite-time ci-dessus EST deja le vrai mecanisme de cadence source (pas un
// palier a defaut d'alternative), donc pas de reutilisation du principe
// "20 actions/seconde" cette fois -- une vraie formule existe.
import { createClient } from '@supabase/supabase-js'
import { loadPricedItems, type PricedItem } from './gear-pricing'
import { TIER_CONFIG, type TierKey } from './money-making-constants'
import { recombobulatedRarity } from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Couche NBT rod (22 aout, recadrage "ne rien laisser a moitie") -- avant
// cette passe, Piscary/Expertise/reforges/gemme n'etaient appliques QUE
// end/late (tout ou rien), un joueur starter/mid n'avait STRICTEMENT AUCUN
// enchant/reforge/gemme dans son setup Fishing -- incoherent avec le reste
// de Pluton (Combat scale Sharpness III/V/VII par tier, jamais 0). Sourcee
// wiki (`piscary`/`expertise`/`sea_creature_chance`#Reforges), agent dedie.
//
// Piscary -- +Fishing Speed par niveau, additif confirme ("Fs stacks
// additively"), I-V Table+Anvil, VI/VII drop rare/item special. Palier par
// tier, meme convention que Sharpness Combat.
const PISCARY_FS_BY_TIER: Record<TierKey, number> = { early: 3, mid: 5, end: 7, late: 7 }
// Expertise -- +Sea Creature Chance par niveau (I-X, 0.6% a 6%), additif.
// Palier par tier.
const EXPERTISE_SCC_BY_TIER: Record<TierKey, number> = { early: 1.8, mid: 3.6, end: 6, late: 6 }
// Reforges rod (Salty/Treacherous/Stiff/Lucky, page wiki dediee
// "reforge_stones_fishing_rod" + section Reforges de "sea_creature_chance")
// -- **PAS de table par rarete sourcee** (contrairement aux reforges Combat/
// `reforges` qui ont un jsonb par rarete) : seule la valeur MAX ("+7 SCC")
// est documentee, valeur plate non-scalee par rarete. Cout d'application
// reel modique (2.5k-600k selon le reforge, wiki "Cost to Apply") --
// applique a TOUS les tiers (pas de raison reelle de le reserver a end/
// late, contrairement a Piscary/Expertise qui ont un vrai palier de niveau
// gate par Enchanting/drop rare).
const ROD_REFORGE_SCC = 7
// Submerged (armure, +1% SCC/piece, x4 pieces) -- meme raisonnement, cout
// modique, applique a tous les tiers.
const ARMOR_REFORGE_SCC = 4
// Aquamarine PERFECT par rarete (table `gemstones`, verifiee 22 aout).
const AQUAMARINE_PERFECT_BY_RARITY: Record<string, number> = { COMMON: 2.5, UNCOMMON: 2.5, RARE: 3.5, EPIC: 4, LEGENDARY: 4.5, MYTHIC: 5 }
// Emplacements de gemme reels par rod -- verifie AVANT de coder (agent
// dedie) : SEULS Rod of Champions (1)/Rod of Legends (2)/Rod of the Sea (2)
// ont un vrai emplacement Aquamarine -- Fishing Rod/Challenging Rod n'en
// ont AUCUN, pas un trou. Bug reel corrige ici : la version precedente
// appliquait PERFECT_AQUAMARINE_GEMSTONE_FS APRES la recherche budget,
// SANS verifier que la rod reellement choisie avait un emplacement --
// desormais calcule par rod, avec la rarete RECOMBOBULEE (Recombobulator
// applicable aux rods, aucune exclusion documentee contrairement a Hot
// Potato Book/The Art of War -- voir plus bas).
const ROD_GEM_SLOTS: Record<string, number> = { CHAMP_ROD: 1, LEGEND_ROD: 2, ROD_OF_THE_SEA: 2 }
const ROD_RARITY: Record<string, string> = { CHALLENGE_ROD: 'UNCOMMON', CHAMP_ROD: 'RARE', LEGEND_ROD: 'EPIC', ROD_OF_THE_SEA: 'LEGENDARY' }
// Hot Potato Book/The Art of War -- confirmes EXCLUS des rods (textes wiki
// respectifs : "Swords and Armor" / "Weapons/Axes", aucune mention Rods) --
// verifie explicitement, pas suppose. Non appliques ici, a dessein.

export const FISHING_TARGET_BLOCK_IDS = ['WATER_POOL'] as const
export const FISHING_TIER_KEYS: TierKey[] = ['early', 'mid', 'end', 'late']

const BASE_TICKS_AVG = 300 // moyenne du random 200-400, sans Lure (non source)
const FISHING_SPEED_CAP = 300 // "Everywhere else" (wiki "Fishing Speed#Mechanics")
const TICKS_PER_SECOND = 20
const REEL_IN_SECONDS_BASE = 2.5 // moyenne du random 1-4s, non affectee par Fishing Speed
const QUICK_BITE_MAX_REDUCTION = 0.25 // END/LATE uniquement

function computeSecondsPerCatch(fishingSpeed: number, applyQuickBite: boolean): { biteSeconds: number; reelInSeconds: number; secondsPerCatch: number } {
  const ticks = fishingSpeed >= FISHING_SPEED_CAP
    ? 0
    : Math.max(0, BASE_TICKS_AVG - (fishingSpeed / FISHING_SPEED_CAP) * BASE_TICKS_AVG)
  const biteSeconds = ticks / TICKS_PER_SECOND
  const reelInSeconds = REEL_IN_SECONDS_BASE * (applyQuickBite ? (1 - QUICK_BITE_MAX_REDUCTION) : 1)
  return { biteSeconds, reelInSeconds, secondsPerCatch: biteSeconds + reelInSeconds }
}

// Table de loot reelle "Water" (37 lignes distinctes, wiki "Treasure/Loot/Water" --
// dedoublonnee depuis pluton_elements qui portait 4 copies identiques par ligne,
// artefact de classification anterieur, non corrige ici -- hors scope de ce
// chantier). "Total Chance" du wiki deja normalise a 100% par palier, utilise
// tel quel comme poids. item_id=null => catch non pricee (Raw Salmon/Tropical
// Fish/Pufferfish base, Enchanted Tropical Fish, pets Squid : aucun prix
// Bazaar/AH fiable trouve ou hors scope -- jamais invente, contribue 0 a l'EV
// plutot qu'une valeur devinee).
type LootRow = { itemId: string | null; qty: number; chancePct: number }
const WATER_LOOT_GOOD: LootRow[] = [
  { itemId: 'RAW_FISH', qty: 16, chancePct: 22.00 },
  { itemId: null, qty: 16, chancePct: 15.00 }, // Raw Salmon
  { itemId: null, qty: 12, chancePct: 10.00 }, // Tropical Fish
  { itemId: 'CLAY_BALL', qty: 32, chancePct: 10.00 },
  { itemId: 'SPONGE', qty: 16, chancePct: 10.00 },
  { itemId: null, qty: 12, chancePct: 8.00 }, // Pufferfish
  { itemId: 'PRISMARINE_SHARD', qty: 8, chancePct: 5.00 },
  { itemId: 'PRISMARINE_CRYSTALS', qty: 8, chancePct: 5.00 },
  { itemId: 'GRAND_EXP_BOTTLE', qty: 4, chancePct: 5.00 },
  { itemId: 'COIN', qty: 37500, chancePct: 10.00 },
]
const WATER_LOOT_GREAT: LootRow[] = [
  { itemId: 'ENCHANTED_RAW_FISH', qty: 4, chancePct: 19.64 },
  { itemId: 'ENCHANTED_RAW_SALMON', qty: 4, chancePct: 13.39 },
  { itemId: null, qty: 3, chancePct: 8.93 }, // Enchanted Tropical Fish
  { itemId: 'ENCHANTED_PUFFERFISH', qty: 3, chancePct: 8.93 },
  { itemId: 'ENCHANTED_CLAY_BALL', qty: 8, chancePct: 8.93 },
  { itemId: 'ENCHANTED_SPONGE', qty: 1, chancePct: 8.93 },
  { itemId: 'TITANIC_EXP_BOTTLE', qty: 1, chancePct: 8.93 },
  { itemId: null, qty: 1, chancePct: 6.70 }, // Common Squid Pet
  { itemId: null, qty: 1, chancePct: 4.46 }, // Uncommon Squid Pet
  { itemId: null, qty: 1, chancePct: 2.23 }, // Rare Squid Pet
  { itemId: 'COIN', qty: 175000, chancePct: 8.93 },
]
const WATER_LOOT_OUTSTANDING: LootRow[] = [
  { itemId: 'ENCHANTED_RAW_FISH', qty: 32, chancePct: 17.39 },
  { itemId: 'ENCHANTED_RAW_SALMON', qty: 32, chancePct: 11.86 },
  { itemId: null, qty: 24, chancePct: 7.91 }, // Enchanted Tropical Fish
  { itemId: 'ENCHANTED_PUFFERFISH', qty: 24, chancePct: 7.91 },
  { itemId: 'ENCHANTED_CLAY_BALL', qty: 64, chancePct: 7.91 },
  { itemId: 'ENCHANTED_SPONGE', qty: 8, chancePct: 7.91 },
  { itemId: 'ENCHANTED_WET_SPONGE', qty: 1, chancePct: 1.98 },
  { itemId: 'TITANIC_EXP_BOTTLE', qty: 1, chancePct: 3.95 },
  { itemId: null, qty: 1, chancePct: 15.81 }, // Epic Squid Pet
  { itemId: null, qty: 1, chancePct: 7.91 }, // Legendary Squid Pet
  { itemId: 'WATER_ORB', qty: 1, chancePct: 1.58 },
  { itemId: 'COIN', qty: 750000, chancePct: 7.91 },
]
const WATER_LOOT_NORMAL: LootRow[] = [
  { itemId: 'RAW_FISH', qty: 1, chancePct: 40.00 },
  { itemId: null, qty: 1, chancePct: 27.27 }, // Raw Salmon
  { itemId: null, qty: 1, chancePct: 18.18 }, // Tropical Fish
  { itemId: null, qty: 1, chancePct: 14.55 }, // Pufferfish
]
// Qualite Treasure : base 89%/10%/1% good/great/outstanding (wiki "Treasure"),
// boosts (Blessed Bait/Blessing enchant/Hermit Crab Legendary+) non modelises --
// bonus conditionnel a un consommable/enchant specifique non encore integre a
// la couche investissement max, gap documente plutot qu'invente.
const TREASURE_QUALITY_CHANCE = { good: 0.89, great: 0.10, outstanding: 0.01 }

async function computeLootTableEV(rows: LootRow[]): Promise<number> {
  const realItemIds = Array.from(new Set(rows.map(r => r.itemId).filter((id): id is string => !!id && id !== 'COIN')))
  const { data: prices } = await supabase
    .from('price_history')
    .select('item_id, sell_price, bucket_date')
    .in('item_id', realItemIds)
    .gt('sell_price', 0)
    .order('bucket_date', { ascending: false })
  const priceMap = new Map<string, number>()
  for (const p of prices || []) {
    if (!priceMap.has(p.item_id)) priceMap.set(p.item_id, Number(p.sell_price))
  }
  let ev = 0
  for (const row of rows) {
    if (!row.itemId) continue // catch non pricee, contribue 0
    const unitPrice = row.itemId === 'COIN' ? 1 : (priceMap.get(row.itemId) ?? 0)
    ev += (row.chancePct / 100) * row.qty * unitPrice
  }
  return ev
}

export type FishingRankingResult = {
  target_block: string
  target_block_id: number
  tier: TierKey
  top_setup: {
    armor_set: string
    rod: string
    rod_item_id: string
    total_fishing_speed: number
    total_sea_creature_chance: number
    total_treasure_chance: number
    real_cost: number
    seconds_per_catch: number
    catches_per_hour: number
    sea_creature_fraction_excluded: number
    coins_per_hour_raw_block_only: number
    pet?: { source_id: string; rarity: string | null; fishing_speed: number; sea_creature_chance: number; treasure_chance: number } | null
    pet_candidates_checked?: number
    accessories?: { source_id: string; equip_slot: string; fishing_speed: number; sea_creature_chance: number; treasure_chance: number }[]
    nbt_modifiers?: string[]
  } | null
  eligible_combos_count: number
  total_combos_checked: number
}

// Pets (competitifs) + equipement (necklace/cloak/belt/bracelet -- un seul
// candidat pre-selectionne par slot, voir doc migration) + accessory_bag
// (talismans/rings/artifacts, tous additifs simultanement).
export type FishingPetAndAccessoryLayer = {
  best_pet: { source_id: string; rarity: string | null; fishing_speed: number; sea_creature_chance: number; treasure_chance: number } | null
  pet_candidates_checked: number
  accessories: { source_id: string; equip_slot: string; fishing_speed: number; sea_creature_chance: number; treasure_chance: number }[]
  total_fishing_speed: number
  total_sea_creature_chance: number
  total_treasure_chance: number
}

async function scoreCandidate(fs: number, scc: number, tc: number, treasureEV: number, fishEV: number, applyQuickBite: boolean): Promise<number> {
  const { secondsPerCatch } = computeSecondsPerCatch(fs, applyQuickBite)
  const catchesPerHour = 3600 / secondsPerCatch
  const sccFraction = Math.min(1, scc / 100)
  const remaining = 1 - sccFraction
  const tcFraction = remaining * Math.min(1, tc / 100)
  const fishFraction = remaining - tcFraction
  return catchesPerHour * (tcFraction * treasureEV + fishFraction * fishEV)
}

export async function applyFishingPetsAndAccessories(
  baseFs: number, baseScc: number, baseTc: number,
  treasureEV: number, fishEV: number, applyQuickBite: boolean
): Promise<FishingPetAndAccessoryLayer> {
  const { data: sources } = await supabase
    .from('stat_bonus_sources')
    .select('source_id, equip_slot, stat_name, rarity, bonus_numeric')
    .in('stat_name', ['fishing_speed', 'sea_creature_chance', 'treasure_chance'])
    .in('equip_slot', ['pet', 'necklace', 'cloak', 'belt', 'bracelet', 'accessory_bag', 'passive'])

  const rows = sources || []

  // Equipement/accessory_bag/passive -- tous additifs (un seul candidat deja
  // pre-selectionne par necklace/cloak/belt/bracelet, accessory_bag/passive
  // n'ont jamais de competition -- voir doc migration).
  const bySource = new Map<string, { equip_slot: string; fs: number; scc: number; tc: number }>()
  for (const r of rows) {
    if (r.equip_slot === 'pet') continue
    const key = `${r.equip_slot}:${r.source_id}`
    const cur = bySource.get(key) || { equip_slot: r.equip_slot, fs: 0, scc: 0, tc: 0 }
    if (r.stat_name === 'fishing_speed') cur.fs = Number(r.bonus_numeric)
    if (r.stat_name === 'sea_creature_chance') cur.scc = Number(r.bonus_numeric)
    if (r.stat_name === 'treasure_chance') cur.tc = Number(r.bonus_numeric)
    bySource.set(key, cur)
  }
  const accessories = Array.from(bySource.entries()).map(([key, v]) => ({
    source_id: key.split(':')[1], equip_slot: v.equip_slot,
    fishing_speed: v.fs, sea_creature_chance: v.scc, treasure_chance: v.tc,
  }))
  const accFs = accessories.reduce((s, a) => s + a.fishing_speed, 0)
  const accScc = accessories.reduce((s, a) => s + a.sea_creature_chance, 0)
  const accTc = accessories.reduce((s, a) => s + a.treasure_chance, 0)

  // Pets -- competitifs (un seul actif), compares sur leur impact REEL en
  // coins/h (meme methode que Mining/Foraging, jamais juste la somme brute).
  const petRows = rows.filter(r => r.equip_slot === 'pet')
  const petIds = new Set(petRows.map(r => `${r.source_id}:${r.rarity}`))
  let bestPet: FishingPetAndAccessoryLayer['best_pet'] = null
  let bestScore = -1
  for (const key of petIds) {
    const [source_id, rarity] = key.split(':')
    const fs = Number(petRows.find(r => r.source_id === source_id && r.rarity === rarity && r.stat_name === 'fishing_speed')?.bonus_numeric || 0)
    const scc = Number(petRows.find(r => r.source_id === source_id && r.rarity === rarity && r.stat_name === 'sea_creature_chance')?.bonus_numeric || 0)
    const tc = Number(petRows.find(r => r.source_id === source_id && r.rarity === rarity && r.stat_name === 'treasure_chance')?.bonus_numeric || 0)
    const score = await scoreCandidate(baseFs + accFs + fs, baseScc + accScc + scc, baseTc + accTc + tc, treasureEV, fishEV, applyQuickBite)
    if (score > bestScore) {
      bestScore = score
      bestPet = { source_id, rarity: rarity === 'null' ? null : rarity, fishing_speed: fs, sea_creature_chance: scc, treasure_chance: tc }
    }
  }

  return {
    best_pet: bestPet,
    pet_candidates_checked: petIds.size,
    accessories,
    total_fishing_speed: baseFs + accFs + (bestPet?.fishing_speed || 0),
    total_sea_creature_chance: baseScc + accScc + (bestPet?.sea_creature_chance || 0),
    total_treasure_chance: baseTc + accTc + (bestPet?.treasure_chance || 0),
  }
}

export async function computeFishingRanking(tier: TierKey, blockId: string): Promise<FishingRankingResult> {
  const [{ data: block }, { data: rodStats }, { data: armorStats }, priced, treasureGoodEV, treasureGreatEV, treasureOutstandingEV, fishEV] = await Promise.all([
    supabase.from('pluton_target_blocks').select('*').eq('activity_key', 'fishing').eq('block_id', blockId).single(),
    supabase.from('pluton_fishing_rod_stats').select('*').eq('verified', true),
    supabase.from('pluton_fishing_armor_stats').select('*'),
    loadPricedItems(),
    computeLootTableEV(WATER_LOOT_GOOD),
    computeLootTableEV(WATER_LOOT_GREAT),
    computeLootTableEV(WATER_LOOT_OUTSTANDING),
    computeLootTableEV(WATER_LOOT_NORMAL),
  ])

  if (!block) throw new Error(`Unknown target block: ${blockId}`)

  const treasureEV = TREASURE_QUALITY_CHANCE.good * treasureGoodEV
    + TREASURE_QUALITY_CHANCE.great * treasureGreatEV
    + TREASURE_QUALITY_CHANCE.outstanding * treasureOutstandingEV

  const priceById = new Map<string, PricedItem>(priced.map(p => [p.item_id, p]))
  const tierConfig = TIER_CONFIG[tier]
  const armorMax = tierConfig.max_gear_cost * 3
  const rodMax = tierConfig.max_gear_cost * 3
  const applyQuickBite = tier === 'end' || tier === 'late'

  const combos: {
    armor_set: string; rod: string; rod_item_id: string
    total_fs: number; total_scc: number; total_tc: number
    real_cost: number
  }[] = []
  let totalChecked = 0

  for (const armor of armorStats || []) {
    const pieces = [armor.helmet_item_id, armor.chestplate_item_id, armor.leggings_item_id, armor.boots_item_id]
    const piecePrices = pieces.map(id => priceById.get(id)?.price)
    if (piecePrices.some(p => p === undefined)) continue
    const armorCost = piecePrices.reduce((s, p) => s! + p!, 0)!
    if (armorCost > armorMax) continue

    for (const rod of rodStats || []) {
      totalChecked++
      const rodPrice = priceById.get(rod.item_id)?.price
      if (rodPrice === undefined || rodPrice > rodMax) continue

      combos.push({
        armor_set: armor.set_name,
        rod: rod.display_name,
        rod_item_id: rod.item_id,
        total_fs: Number(rod.base_fishing_speed),
        total_scc: Number(armor.set_sea_creature_chance) + Number(rod.base_sea_creature_chance),
        total_tc: Number(armor.set_treasure_chance) + Number(rod.base_treasure_chance),
        real_cost: armorCost + rodPrice,
      })
    }
  }

  const scored: any[] = []
  for (const c of combos) {
    const coins = await scoreCandidate(c.total_fs, c.total_scc, c.total_tc, treasureEV, fishEV, applyQuickBite)
    scored.push({ ...c, coins })
  }
  scored.sort((a, b) => b.coins - a.coins)

  let topSetup: any = scored[0] ?? null
  if (topSetup) {
    const layer = await applyFishingPetsAndAccessories(topSetup.total_fs, topSetup.total_scc, topSetup.total_tc, treasureEV, fishEV, applyQuickBite)
    let finalFs = layer.total_fishing_speed
    let finalScc = layer.total_sea_creature_chance
    let finalTc = layer.total_treasure_chance
    const nbtModifiers: string[] = []

    // Piscary + Expertise -- enchants rod, palier par tier (III/V/VII-equiv
    // niveau, jamais 0 a aucun tier -- corrige le trou reel trouve cette
    // session, voir doc des constantes).
    const piscaryFs = PISCARY_FS_BY_TIER[tier]
    const expertiseScc = EXPERTISE_SCC_BY_TIER[tier]
    finalFs += piscaryFs
    finalScc += expertiseScc
    nbtModifiers.push(`Piscary (+${piscaryFs} Fishing Speed, sourcee wiki, palier ${tier})`)
    nbtModifiers.push(`Expertise (+${expertiseScc}% Sea Creature Chance, sourcee wiki, palier ${tier})`)

    // Reforge rod (Salty/Treacherous/Stiff/Lucky, +7 SCC flat, pas de table
    // par rarete sourcee -- voir doc) + reforge armure (Submerged, +4 SCC
    // x4 pieces) -- tous les tiers, cout d'application reel modique.
    finalScc += ROD_REFORGE_SCC + ARMOR_REFORGE_SCC
    nbtModifiers.push(`Reforge rod (Salty/Treacherous/Stiff/Lucky, +${ROD_REFORGE_SCC}% SCC, sourcee wiki)`)
    nbtModifiers.push(`Reforge armure Submerged x4 (+${ARMOR_REFORGE_SCC}% SCC, sourcee wiki)`)

    // Gemme Aquamarine -- UNIQUEMENT si la rod reellement choisie a un vrai
    // emplacement (verifie AVANT de coder, voir doc) -- corrige un bug reel
    // de la version precedente qui l'appliquait sans verifier la rod.
    // Recombobulator applicable aux rods (aucune exclusion documentee),
    // decale la rarete d'1 cran pour ce lookup.
    const gemSlots = ROD_GEM_SLOTS[topSetup.rod_item_id] ?? 0
    if (gemSlots > 0) {
      const rodRarity = ROD_RARITY[topSetup.rod_item_id]
      const recombRarity = recombobulatedRarity(rodRarity)
      const perGem = AQUAMARINE_PERFECT_BY_RARITY[recombRarity]
      const gemFs = gemSlots * perGem
      finalFs += gemFs
      nbtModifiers.push(`Recombobulator 3000 (${topSetup.rod}, ${rodRarity}->${recombRarity}, sourcee wiki)`)
      nbtModifiers.push(`Gemme Aquamarine PERFECT x${gemSlots} (+${gemFs} Fishing Speed, sourcee table gemstones, rarete recombobulee)`)
    }

    const { secondsPerCatch } = computeSecondsPerCatch(finalFs, applyQuickBite)
    const catchesPerHour = 3600 / secondsPerCatch
    const sccFraction = Math.min(1, finalScc / 100)
    const remaining = 1 - sccFraction
    const tcFraction = remaining * Math.min(1, finalTc / 100)
    const fishFraction = remaining - tcFraction
    const coinsPerHour = catchesPerHour * (tcFraction * treasureEV + fishFraction * fishEV)

    topSetup = {
      ...topSetup,
      total_fishing_speed: finalFs,
      total_sea_creature_chance: finalScc,
      total_treasure_chance: finalTc,
      pet: layer.best_pet,
      pet_candidates_checked: layer.pet_candidates_checked,
      accessories: layer.accessories,
      nbt_modifiers: nbtModifiers,
      seconds_per_catch: secondsPerCatch,
      catches_per_hour: catchesPerHour,
      sea_creature_fraction_excluded: sccFraction,
      coins_per_hour_raw_block_only: coinsPerHour,
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

export type PersistedFishingResult = {
  tier: TierKey
  block_id: string
  target_block: string
  has_setup: boolean
  coins_per_hour_raw_block_only: number | null
}

export async function computeAndPersistAllFishingRankings(): Promise<PersistedFishingResult[]> {
  const out: PersistedFishingResult[] = []

  await supabase.from('pluton_rankings').delete().eq('activity_key', 'fishing')
  await supabase.from('pluton_setups').delete().eq('activity_key', 'fishing')

  for (const tier of FISHING_TIER_KEYS) {
    for (const blockId of FISHING_TARGET_BLOCK_IDS) {
      const result = await computeFishingRanking(tier, blockId)

      if (!result.top_setup) {
        out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: false, coins_per_hour_raw_block_only: null })
        continue
      }

      const s = result.top_setup
      const { data: setupRow, error: setupErr } = await supabase
        .from('pluton_setups')
        .insert({
          activity_key: 'fishing',
          tier,
          investment_level: 'optimal',
          armor_set_prefix: s.armor_set,
          tool_item_id: s.rod_item_id,
          // Colonnes reutilisees -- total_mining_speed porte Fishing Speed,
          // total_mining_fortune porte Sea Creature Chance (meme convention de
          // reutilisation deja appliquee par Farming/Foraging). Treasure Chance
          // n'a pas de colonne dediee -- stockee dans accessories (JSON) pour
          // ne pas perdre l'info, pas critique pour l'affichage top-level.
          total_mining_speed: Math.round(s.total_fishing_speed),
          total_mining_fortune: Math.round(s.total_sea_creature_chance),
          total_breaking_power: 0,
          real_cost: s.real_cost,
          pet_id: s.pet?.source_id ?? null,
          pet_rarity: s.pet?.rarity ?? null,
          accessories: [...(s.accessories ?? []), { source_id: '__treasure_chance_total__', equip_slot: 'meta', treasure_chance: s.total_treasure_chance, nbt_modifiers: s.nbt_modifiers }],
        })
        .select('id')
        .single()
      if (setupErr || !setupRow) throw new Error(`pluton_setups insert failed for ${tier}/${blockId}: ${setupErr?.message}`)

      const { error: rankErr } = await supabase
        .from('pluton_rankings')
        .insert({
          activity_key: 'fishing',
          tier,
          target_block_id: result.target_block_id,
          setup_id: setupRow.id,
          rank: 1,
          mining_time_seconds: s.seconds_per_catch,
          actions_per_hour: s.catches_per_hour,
          yield_per_hour: s.catches_per_hour, // pas de "yield" distinct ici (EV deja en coins), catches/h le proxy le plus proche
          coins_per_hour_raw_block_only: s.coins_per_hour_raw_block_only,
        })
      if (rankErr) throw new Error(`pluton_rankings insert failed for ${tier}/${blockId}: ${rankErr.message}`)

      out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: true, coins_per_hour_raw_block_only: s.coins_per_hour_raw_block_only })
    }
  }

  return out
}
