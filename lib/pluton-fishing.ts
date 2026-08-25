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
import type { SevenTierConfig } from './money-making-constants'
import {
  recombobulatedRarity, SEVEN_TIER_KEYS, type SevenTier, loadSevenTierConfig, INVESTMENT_MAX_TIERS,
  ANGLER_SCC_PCT_BY_TIER, LUCK_OF_THE_SEA_TC_PCT_BY_TIER, ULTIMATE_FLASH_INSTANT_CHANCE_PCT_BY_TIER,
} from './pluton-engine'

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
// additively"), I-VII Table+Anvil/drop rare/item special. Palier par tier,
// meme convention que Sharpness Combat. 7 vrais niveaux (I-VII) correspondent
// maintenant exactement aux 7 tiers reels (23 aout) -- value=tier_order,
// mapping direct, plus naturel que l'ancienne interpolation 4 paliers.
const PISCARY_FS_BY_TIER: Record<SevenTier, number> = {
  starter: 1, amateur: 2, intermediate: 3, skilled: 4, expert: 5, professional: 6, master: 7,
}
// Expertise -- +Sea Creature Chance par niveau (I-X, 0.6% a 6% par niveau),
// additif. Interpolation sur 7 paliers (23 aout) -- ancres reelles
// preservees : amateur=ancien early (niveau 3=1.8%), professional/master=
// ancien end/late (niveau 10 max=6%).
const EXPERTISE_SCC_BY_TIER: Record<SevenTier, number> = {
  starter: 0.6, amateur: 1.8, intermediate: 3.0, skilled: 4.2, expert: 5.4, professional: 6.0, master: 6.0,
}
// Rod Parts (Hooks/Lines/Sinkers, table `rod_parts`, 18 pieces reelles) --
// NBT layer jamais consommee avant le 25 aout, trouvee en auditant le gap
// "Junk Ring" (Sinker). Slot Lines audite en entier (4 pieces reelles) :
// Speedy Line (+10 Fishing Speed, Fishing 5, aucune restriction de zone) --
// seule piece avec une stat computable dans ce modele. Shredded Line
// (Damage+250/Ferocity+50) ne s'applique pas ici -- pluton-sea-creatures.ts
// reutilise le gear Zombie Slayer pour le combat, pas la rod. Titan Line
// (Double Hook Chance +2) et Trophy Line (Trophy Fish Chance +5) restent
// non modelisables : DHC n'a aucune formule sourcee (mecanisme meme pas
// documente), Trophy deja hors-scope (voir construction Fishing du 17
// aout). Speedy Line retenue comme seul candidat reel du slot Lines,
// applique a TOUS les tiers (Fishing 5 = deblocage tres precoce, contrairement
// aux autres bonus gates a INVESTMENT_MAX_TIERS).
// Slot Sinkers audite aussi : Chum/Icy/Prismarine/Sponge Sinkers
// "materialisent" un item gratuit par capture mais AUCUNE quantite/formule
// n'est sourcee nulle part (juste "materializes X into your inventory") --
// inventer une quantite violerait la regle #7, gap documente pas ferme.
// Junk/Hotspot/Festive Sinkers confirmes zone/evenement-gates (Backwater
// Bayou/Hotspot/Jerry's Workshop) -- meme statut que les pools event_gated
// deja traitees ailleurs, non integres a WATER_POOL (cible generique,
// explicitement hors Backwater Bayou).
const SPEEDY_LINE_FISHING_SPEED = 10
// Reforges rod (Salty/Treacherous/Stiff/Lucky) et armure (Submerged) --
// 🔴 CORRIGE (24 aout, audit exhaustivite reforge_stones/star_upgrades) :
// la version precedente affirmait "pas de table par rarete sourcee,
// seule la valeur MAX (+7 SCC) documentee" -- FAUX, la vraie table
// `reforge_stones` a un jsonb complet par rarete pour les 4 reforges rod
// (COMMON->MYTHIC, tous identiques en SCC : 1/2/2/3/5/7) et pour Submerged
// (armure). Le code appliquait donc la valeur MYTHIC a TOUS les tiers,
// surestimant le SCC reel aux tiers bas (starter/amateur, rod/armure encore
// COMMON/UNCOMMON) de jusqu'a +4.5%pts. Desormais scale par la rarete
// RECOMBOBULEE de l'item reellement choisi (meme discipline que la gemme
// Aquamarine juste en dessous). Submerged porte aussi du Fishing Speed
// (jamais capte avant ce fix) et du Crit Chance (hors-scope, aucun combat
// modelise dans ce fichier) -- seuls SCC+FS sont donc appliques ici.
const ROD_REFORGE_SCC_BY_RARITY: Record<string, number> = { COMMON: 1, UNCOMMON: 2, RARE: 2, EPIC: 3, LEGENDARY: 5, MYTHIC: 7 }
const ARMOR_REFORGE_SUBMERGED_BY_RARITY: Record<string, { fishingSpeed: number; scc: number }> = {
  COMMON: { fishingSpeed: 1, scc: 0.5 }, UNCOMMON: { fishingSpeed: 1, scc: 0.6 }, RARE: { fishingSpeed: 2, scc: 0.7 },
  EPIC: { fishingSpeed: 3, scc: 0.8 }, LEGENDARY: { fishingSpeed: 4, scc: 0.9 }, MYTHIC: { fishingSpeed: 5, scc: 1.0 },
}
// Rarete de base des 6 armures Fishing -- absente de item_stats pour Angler
// (item starter jamais catalogue avec stats), COMMON de notoriete Skyblock
// etablie (meme categorie de defaut deja utilisee pour FISHING_ROD).
const ARMOR_RARITY: Record<string, string> = {
  ANGLER: 'COMMON', BACKWATER: 'UNCOMMON', DIVER: 'EPIC', SPONGE: 'EPIC', SHARK_SCALE: 'LEGENDARY', ABYSSAL: 'LEGENDARY',
  THUNDER: 'EPIC', MAGMA_LORD: 'LEGENDARY',
}
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
const ROD_RARITY: Record<string, string> = { FISHING_ROD: 'COMMON', CHALLENGE_ROD: 'UNCOMMON', CHAMP_ROD: 'RARE', LEGEND_ROD: 'EPIC', ROD_OF_THE_SEA: 'LEGENDARY' }
// Hot Potato Book/The Art of War -- confirmes EXCLUS des rods (textes wiki
// respectifs : "Swords and Armor" / "Weapons/Axes", aucune mention Rods) --
// verifie explicitement, pas suppose. Non appliques ici, a dessein.

export const FISHING_TARGET_BLOCK_IDS = ['WATER_POOL'] as const
// 7 tiers reels (starter->master, 23 aout).
export const FISHING_TIER_KEYS: readonly SevenTier[] = SEVEN_TIER_KEYS

const BASE_TICKS_AVG = 300 // moyenne du random 200-400, sans Lure (non source)
const FISHING_SPEED_CAP = 300 // "Everywhere else" (wiki "Fishing Speed#Mechanics")
const TICKS_PER_SECOND = 20
const REEL_IN_SECONDS_BASE = 2.5 // moyenne du random 1-4s, non affectee par Fishing Speed
const QUICK_BITE_MAX_REDUCTION = 0.25 // END/LATE uniquement

function computeSecondsPerCatch(fishingSpeed: number, applyQuickBite: boolean, instantChancePct: number = 0): { biteSeconds: number; reelInSeconds: number; secondsPerCatch: number } {
  const ticks = fishingSpeed >= FISHING_SPEED_CAP
    ? 0
    : Math.max(0, BASE_TICKS_AVG - (fishingSpeed / FISHING_SPEED_CAP) * BASE_TICKS_AVG)
  // Ultimate Flash (23 aout) -- "X% chance d'attraction instantanee" sourcee
  // wiki (key='flash', ENCHANTMENT_ULTIMATE_FLASH) -- reduit le temps de
  // morsure moyen : ExpectedTicks = (1-P)xTicks, une capture sur P% des
  // essais saute directement la morsure.
  const biteSeconds = (ticks / TICKS_PER_SECOND) * (1 - instantChancePct / 100)
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
  tier: SevenTier
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
  // equip_slot='passive' EXCLU ici (22 aout) -- ce sont exactement les 5
  // sources Piscary/Expertise/reforges rod+armure/gemme Aquamarine, deja
  // couvertes explicitement plus bas dans computeFishingRanking() avec un
  // vrai palier par tier + verification d'eligibilite de la rod (gemme).
  // BUG REEL TROUVE ET CORRIGE : ce filtre les incluait deja ici (a TOUS
  // les tiers, `applyFishingPetsAndAccessories` ne filtre pas par tier) --
  // combine a l'ancien bloc "end/late only" qui les ajoutait UNE 2e fois,
  // Fishing double-comptait deja ces 5 sources en END/LATE avant cette
  // passe. Exclu ici, la nouvelle logique explicite devient la seule source.
  const { data: sources } = await supabase
    .from('stat_bonus_sources')
    .select('source_id, equip_slot, stat_name, rarity, bonus_numeric')
    .in('stat_name', ['fishing_speed', 'sea_creature_chance', 'treasure_chance'])
    .in('equip_slot', ['pet', 'necklace', 'cloak', 'belt', 'bracelet', 'accessory_bag'])

  const rows = sources || []

  // 🔴 CORRIGE (24 aout, audit exhaustivite ressources nuit) : le commentaire
  // d'origine ("un seul candidat deja pre-selectionne par slot") etait une
  // hypothese non garantie -- necklace/cloak/belt/bracelet ont chacun
  // max_count=1 reel (meme discipline que le fix Mining/Foraging plus tot
  // cette nuit). Sommer tous les candidats du meme slot porterait 2 colliers
  // a la fois des qu'un 2e candidat existe pour le meme equip_slot. Arbitrage
  // desormais par impact reel coins/h (via scoreCandidate, deja definie plus
  // haut). accessory_bag reste additif sans arbitrage (empilable, mecanique
  // reelle confirmee ailleurs dans le projet).
  const grouped = new Map<string, { equip_slot: string; source_id: string; fs: number; scc: number; tc: number }>()
  for (const r of rows) {
    if (r.equip_slot === 'pet') continue
    const key = `${r.equip_slot}:${r.source_id}`
    const cur = grouped.get(key) || { equip_slot: r.equip_slot, source_id: r.source_id, fs: 0, scc: 0, tc: 0 }
    if (r.stat_name === 'fishing_speed') cur.fs = Number(r.bonus_numeric)
    if (r.stat_name === 'sea_creature_chance') cur.scc = Number(r.bonus_numeric)
    if (r.stat_name === 'treasure_chance') cur.tc = Number(r.bonus_numeric)
    grouped.set(key, cur)
  }
  const candidates = Array.from(grouped.values())
  const accessories: FishingPetAndAccessoryLayer['accessories'] = []
  let accFs = 0, accScc = 0, accTc = 0
  for (const c of candidates.filter(c => c.equip_slot === 'accessory_bag')) {
    accessories.push({ source_id: c.source_id, equip_slot: c.equip_slot, fishing_speed: c.fs, sea_creature_chance: c.scc, treasure_chance: c.tc })
    accFs += c.fs; accScc += c.scc; accTc += c.tc
  }
  const bestBySlot = new Map<string, typeof candidates[number]>()
  for (const c of candidates.filter(c => c.equip_slot !== 'accessory_bag')) {
    const score = await scoreCandidate(baseFs + accFs + c.fs, baseScc + accScc + c.scc, baseTc + accTc + c.tc, treasureEV, fishEV, applyQuickBite)
    const current = bestBySlot.get(c.equip_slot)
    const currentScore = current
      ? await scoreCandidate(baseFs + accFs + current.fs, baseScc + accScc + current.scc, baseTc + accTc + current.tc, treasureEV, fishEV, applyQuickBite)
      : -1
    if (!current || score > currentScore) bestBySlot.set(c.equip_slot, c)
  }
  for (const c of bestBySlot.values()) {
    accessories.push({ source_id: c.source_id, equip_slot: c.equip_slot, fishing_speed: c.fs, sea_creature_chance: c.scc, treasure_chance: c.tc })
    accFs += c.fs; accScc += c.scc; accTc += c.tc
  }

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

export async function computeFishingRanking(tier: SevenTier, blockId: string, tierConfig?: SevenTierConfig): Promise<FishingRankingResult> {
  const [{ data: block }, { data: rodStats }, { data: armorStats }, priced, treasureGoodEV, treasureGreatEV, treasureOutstandingEV, fishEV, resolvedTierConfig] = await Promise.all([
    supabase.from('pluton_target_blocks').select('*').eq('activity_key', 'fishing').eq('block_id', blockId).single(),
    supabase.from('pluton_fishing_rod_stats').select('*').eq('verified', true),
    supabase.from('pluton_fishing_armor_stats').select('*'),
    loadPricedItems(),
    computeLootTableEV(WATER_LOOT_GOOD),
    computeLootTableEV(WATER_LOOT_GREAT),
    computeLootTableEV(WATER_LOOT_OUTSTANDING),
    computeLootTableEV(WATER_LOOT_NORMAL),
    tierConfig ? Promise.resolve(tierConfig) : loadSevenTierConfig().then(cfg => cfg[tier]),
  ])

  if (!block) throw new Error(`Unknown target block: ${blockId}`)

  const treasureEV = TREASURE_QUALITY_CHANCE.good * treasureGoodEV
    + TREASURE_QUALITY_CHANCE.great * treasureGreatEV
    + TREASURE_QUALITY_CHANCE.outstanding * treasureOutstandingEV

  const priceById = new Map<string, PricedItem>(priced.map(p => [p.item_id, p]))
  const armorMax = resolvedTierConfig.max_gear_cost * 3
  const rodMax = resolvedTierConfig.max_gear_cost * 3
  const applyQuickBite = INVESTMENT_MAX_TIERS.has(tier)

  const combos: {
    armor_set: string; armor_set_prefix: string; rod: string; rod_item_id: string
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
        armor_set_prefix: armor.set_prefix,
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

    // Rod Part Speedy Line (25 aout, audit Rod Parts) -- +10 Fishing Speed,
    // Fishing 5, applicable tous tiers, aucune alternative computable dans
    // ce modele (voir doc de la constante).
    finalFs += SPEEDY_LINE_FISHING_SPEED
    nbtModifiers.push(`Rod Part Speedy Line (+${SPEEDY_LINE_FISHING_SPEED} Fishing Speed, sourcee table rod_parts, tous tiers)`)

    // Angler + Luck of the Sea (23 aout, audit exhaustivite enchants) --
    // additifs simples, memes valeurs sourcees wiki que Piscary/Expertise.
    const anglerScc = ANGLER_SCC_PCT_BY_TIER[tier]
    const luckOfSeaTc = LUCK_OF_THE_SEA_TC_PCT_BY_TIER[tier]
    finalScc += anglerScc
    finalTc += luckOfSeaTc
    nbtModifiers.push(`Angler (+${anglerScc}% Sea Creature Chance, sourcee wiki, palier ${tier})`)
    nbtModifiers.push(`Luck of the Sea (+${luckOfSeaTc}% Treasure Chance, sourcee wiki, palier ${tier})`)

    // Reforge rod (Salty/Treacherous/Stiff/Lucky) + reforge armure
    // (Submerged) -- scale par la rarete RECOMBOBULEE reelle de l'item
    // choisi (voir doc des constantes, corrige le flat-MYTHIC applique a
    // tous les tiers avant ce fix).
    const rodRarityForReforge = recombobulatedRarity(ROD_RARITY[topSetup.rod_item_id] ?? 'COMMON')
    const rodReforgeScc = ROD_REFORGE_SCC_BY_RARITY[rodRarityForReforge] ?? 0
    const armorRarityForReforge = recombobulatedRarity(ARMOR_RARITY[topSetup.armor_set_prefix] ?? 'COMMON')
    const armorReforge = ARMOR_REFORGE_SUBMERGED_BY_RARITY[armorRarityForReforge] ?? { fishingSpeed: 0, scc: 0 }
    const armorReforgeScc = armorReforge.scc * 4
    finalScc += rodReforgeScc + armorReforgeScc
    finalFs += armorReforge.fishingSpeed * 4
    nbtModifiers.push(`Reforge rod Salty (${rodRarityForReforge}, +${rodReforgeScc}% SCC, sourcee reforge_stones)`)
    nbtModifiers.push(`Reforge armure Submerged x4 (${armorRarityForReforge}, +${armorReforgeScc}% SCC / +${armorReforge.fishingSpeed * 4} Fishing Speed, sourcee reforge_stones)`)

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

    // Ultimate Flash (23 aout, enchant ULTIMATE emplacement ROD) -- "X%
    // chance d'attraction instantanee", sourcee wiki, reduit le temps de
    // morsure moyen.
    const flashChancePct = ULTIMATE_FLASH_INSTANT_CHANCE_PCT_BY_TIER[tier]
    nbtModifiers.push(`Ultimate Flash (+${flashChancePct}% chance d'attraction instantanee, sourcee wiki, palier ${tier})`)
    const { secondsPerCatch } = computeSecondsPerCatch(finalFs, applyQuickBite, flashChancePct)
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
  tier: SevenTier
  block_id: string
  target_block: string
  has_setup: boolean
  coins_per_hour_raw_block_only: number | null
}

export async function computeAndPersistAllFishingRankings(): Promise<PersistedFishingResult[]> {
  const out: PersistedFishingResult[] = []

  // 🔴 Bug réel trouvé le 23 août (audit exhaustivité, même famille que le
  // fix appliqué à lib/pluton-mining.ts le même jour) : ce DELETE était
  // scopé sur activity_key='fishing' SEUL -- or Sea Creature kills
  // (lib/pluton-sea-creatures.ts, 21 août) partage cette même activity_key
  // (11 pools distinctes) sans que ce fichier-ci en tienne compte. Tout
  // appel isolé de computeAndPersistAllFishingRankings() effaçait
  // silencieusement les rankings Sea Creatures déjà en base sans les
  // reconstruire. Corrigé en scopant le DELETE au seul target_block réel de
  // Fishing (WATER_POOL), jamais un blanket activity_key -- même discipline
  // déjà appliquée par Sea Creatures lui-même sur ses propres lignes.
  const { data: fishingBlocks } = await supabase
    .from('pluton_target_blocks')
    .select('id')
    .eq('activity_key', 'fishing')
    .in('block_id', FISHING_TARGET_BLOCK_IDS)
  const fishingBlockIds = (fishingBlocks || []).map(b => b.id)
  if (fishingBlockIds.length > 0) {
    const { data: staleRankings } = await supabase
      .from('pluton_rankings')
      .select('setup_id')
      .in('target_block_id', fishingBlockIds)
    const staleSetupIds = (staleRankings || []).map(r => r.setup_id).filter(Boolean)
    await supabase.from('pluton_rankings').delete().in('target_block_id', fishingBlockIds)
    if (staleSetupIds.length > 0) await supabase.from('pluton_setups').delete().in('id', staleSetupIds)
  }

  const sevenTierConfig = await loadSevenTierConfig()
  for (const tier of FISHING_TIER_KEYS) {
    for (const blockId of FISHING_TARGET_BLOCK_IDS) {
      const result = await computeFishingRanking(tier, blockId, sevenTierConfig[tier])

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
