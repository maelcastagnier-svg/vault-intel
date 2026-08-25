// lib/pluton-foraging.ts
// Pluton Foraging (17 aout) -- meme discipline que lib/pluton-mining.ts et
// lib/pluton-farming.ts (jamais de constante de jeu reconstituee de memoire,
// tout source wiki officiel/Supabase), mecanique hybride des deux precedentes :
//
// - Comme Mining : une vraie stat de gear (Sweep) determine le rendement PAR
//   ACTION (logs par swing), via une formule reelle sourcee wiki "Sweep" --
//   Logs = 4*log10(1 + max(0, (Sweep+sqrt(Sweep)-Toughness)/Toughness^0.511)^1.9),
//   plafonne a 35 logs bonus + 1 log garanti = 36 logs/swing max (page wiki
//   "Sweep", tabber "Values"/description). Toughness = la meme stat que
//   Mining's Block Strength, cote-arbre (Fig Trunk=10, Mangrove Trunk/Root=50,
//   Helix=150 -- valeurs Trunk/dominantes deja stockees dans
//   pluton_target_blocks.block_strength au moment de la cartographie Foraging).
// - Comme Farming : AUCUNE stat de gear ne determine la cadence de swing --
//   confirme par l'absence totale d'un stat "Foraging Speed"/"Axe Speed" dans
//   toute la cartographie Sweep/Foraging Fortune (contrairement a Mining Speed,
//   bel et bien une vraie stat cote serveur). Decision explicite de
//   l'utilisateur (17 aout, generalisation de la regle actee le 5 aout pour
//   Farming) : reutiliser le meme plafond moteur Minecraft (20 actions/seconde,
//   20 TPS) comme debit universel de swing, qu'il soit atteint par un joueur
//   manuel optimal ou une macro -- aucune des deux methodes ne peut depasser ce
//   plafond physique, donc il sert de ceiling commun sans arbitrer laquelle est
//   utilisee (meme raisonnement que CROPS_PER_SECOND_ENGINE_CAP de Farming).
// - Foraging Fortune (stat separee de Sweep, "100 FF = chance de +1 log",
//   formule identique a Mining/Farming Fortune : ExpectedLogs = LogsPerSwing *
//   (1 + FF/100)) multiplie le rendement par swing, exactement comme Mining
//   Fortune multiplie le nombre de drops par bloc casse.
//
// Design reel confirme en sourcant (pas suppose) : le gear Torrhus/Helix
// (Toughness=150, le plus eleve) investit à 100% en Sweep, ZERO Foraging
// Fortune (absent de la table wiki "Foraging Fortune#Armor"/"#Tools") --
// coherent avec un bloc a tres haute resistance ou le vrai goulot d'etranglement
// est le rendement par swing, pas le multiplicateur de drop.
//
// MVP volontairement simplifie (documente, pas cache) :
// - Ordre de coupe (Trunk->Branches pour Fig, Branches->Trunk->Roots pour
//   Mangrove) et jet de hache : les deux infligent -50% Sweep si mal executes
//   (wiki "Sweep"). Assume toujours l'ordre optimal / jamais de jet de hache --
//   meme hypothese "joueur optimal" que le reste du calculateur Pluton.
// - Gecko Shard (Echo of Sharpening, +2%/niveau, max +20%) et Tiamat Shard
//   (Echo of Echoes, +5%/niveau, max +50%) multiplient Crow/Heron/Vulture
//   Sharpening en cascade (Tiamat boost Gecko, Gecko boost Crow/Heron/Vulture)
//   -- systeme d'Attribute Shards a slots/niveaux propre, pas encore construit
//   cote Pluton (aucune table `attribute_shard_loadouts` n'existe). Sharpening
//   modelise ici a sa valeur de base max SANS cette amplification -- gap
//   documente, meme categorie que le taux de coffre au tresor jamais modelise
//   par Mining.
// - Phanpyre/Groundhog Shard (jour/nuit), Tadgang Shard (scale avec collection
//   d'attributs communs non cataloguee), Mochibear/Bambuleaf Shard (melee/jet,
//   croisement Combat ambigu) et Agatha Starlyn Personal Best (conditionnel
//   Jacob's Contest) exclus -- situationnels/non verifies, meme discipline que
//   les "Temporary Sources" deja exclues par Farming.
// - Spruce Axe (outil starter, +4 Sweep) exclu du solveur : non trouve dans
//   item_stats/price_history_ah_variant_base (outil de tutoriel donne
//   gratuitement, jamais tradeable), coherent avec l'exclusion deja actee de
//   LEAFLET/PARK Armor (non-tradeable) pour Foraging Fortune.

import { createClient } from '@supabase/supabase-js'
import { loadPricedItems, type PricedItem } from './gear-pricing'
import type { SevenTierConfig } from './money-making-constants'
import {
  recombobulatedRarity, CITRINE_PERFECT_BY_RARITY, SEVEN_TIER_KEYS, type SevenTier, loadSevenTierConfig, INVESTMENT_MAX_TIERS,
  FIRST_IMPRESSION_SWEEP_BY_TIER,
} from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const FORAGING_TARGET_BLOCK_IDS = [
  'FIG_LOG', 'MANGROVE_LOG', 'HELIX_LOG',
  // Oak/Spruce/Birch/Jungle/Acacia/Dark Oak (The Park, Toughness=0) -- 25 aout,
  // audit exhaustivite Collections officielles (15 items FORAGING reels,
  // 3/15 couverts avant ce fix, pas 3/3 comme confirme a tort le 23 aout).
  // Toughness=0 -> formule lineaire simple (voir computeLogsPerSwing).
  'OAK_LOG', 'SPRUCE_LOG', 'BIRCH_LOG', 'JUNGLE_LOG', 'ACACIA_LOG', 'DARK_OAK_LOG',
] as const
// Basic foraging deja accessible des Starter (TIER_CONFIG.early.access),
// contrairement a Farming ou Garden est explicitement interdit -- les 7
// tiers reels sont eligibles, le filtre de budget suffit a exclure
// naturellement le gear hors de portee (meme mecanisme que Mining, aucun
// forbidden explicite requis). 7 tiers reels (starter->master, 23 aout).
export const FORAGING_TIER_KEYS: readonly SevenTier[] = SEVEN_TIER_KEYS

// Plafond moteur Minecraft (20 TPS) -- voir doc d'en-tete, identique au
// principe deja valide et approuve par l'utilisateur pour Farming.
const SWING_PER_SECOND_ENGINE_CAP = 20
const ACTIONS_PER_HOUR_FIXED = SWING_PER_SECOND_ENGINE_CAP * 3600 // 72 000
const BONUS_LOGS_CAP = 35 // + 1 log garanti = 36 logs/swing max (wiki "Sweep")

// Logs par swing = 1 (garanti) + bonus, formule reelle wiki "Sweep#Formula".
// max(0, ...) avant l'exposant 1.9 -- evite un NaN si Sweep < Toughness (le
// bonus est alors legitimement nul, pas une puissance de nombre negatif).
// 🔴 Bug reel corrige (25 aout, trouve en ajoutant les arbres de base
// Oak/Spruce/Birch/Jungle/Acacia/Dark Oak -- jamais testes avant car seuls
// Fig/Mangrove/Helix, tous Toughness>0, etaient modelises). La branche
// toughness<=0 retournait 1 log fixe, ignorant Sweep entierement -- faux :
// wiki "Sweep#Formula" section "Basic Trees" confirme explicitement "Trees
// in the Forest and The Park have Toughness 0. For these trees, Sweep
// simply represents the number of extra logs that will be cut, but
// players will always cut at least 1 and at most 36 logs" -- formule
// lineaire simple (1+Sweep, plafond 36), pas le formule log10 des arbres
// Galatea (Fig/Mangrove/Helix, Toughness>0, section "Galatea Trees"
// distincte, formule inchangee).
export function computeLogsPerSwing(sweep: number, toughness: number): number {
  if (toughness <= 0) return 1 + Math.min(BONUS_LOGS_CAP, Math.max(0, sweep))
  const raw = (sweep + Math.sqrt(Math.max(0, sweep)) - toughness) / Math.pow(toughness, 0.511)
  if (raw <= 0) return 1
  const bonus = 4 * Math.log10(1 + Math.pow(raw, 1.9))
  return 1 + Math.min(BONUS_LOGS_CAP, bonus)
}

// Sharpening Attribute Shards -- Crow(+5/niveau max+50 vs Fig), Heron(+10/niveau
// max+100 vs Mangrove), Vulture(+15/niveau max+150 vs Helix), wiki "Sweep#Sources"
// -- bonus cible-specifique (comme Farming's Crop Fortune vs FF generique),
// valeur de base max SANS l'amplification Gecko/Tiamat (voir doc d'en-tete).
const SHARPENING_SHARD_MAX: Record<string, number> = {
  FIG_LOG: 50, MANGROVE_LOG: 100, HELIX_LOG: 150,
}
// Sweep Booster (enchant), Swoop (Tree Gift Milestone) et Long-Expired Century
// Cake (consommable, effet maintenu) sont deja des lignes stat_bonus_sources
// (equip_slot='passive') appliquees a TOUS les tiers via
// applyForagingPetsAndAccessories -- PAS repetes ici. Bug reel trouve en
// verifiant en prod (17 aout) : une premiere version les re-additionnait dans
// cette couche, comptant leur +64 en double a END/LATE (confirme par calcul
// manuel sur le total_sweep persiste : 308+114 au lieu de 308+50 attendu).
// Seul le Sharpening Shard (cible-specifique, jamais dans stat_bonus_sources
// faute de colonne target_block) appartient a cette couche.
function maxInvestmentSweepBonus(blockId: string): number {
  return SHARPENING_SHARD_MAX[blockId] ?? 0
}

// Gemmes Citrine + Frenzy (outil) -- 22 aout, trouve en auditant "tout le
// NBT du skill" (jamais modelise avant, trou reel confirme wiki : ni
// gemstone_slots ni item ability n'existaient dans ce fichier). Sourcee
// wiki (agent dedie, 6 items -- 3 outils + 3 armures) :
// - Citrine (Foraging Fortune, PAS Sweep) -- emplacements REELS verifies
//   AVANT de coder : Fig Hew=1, Figstone Splitter=2, Helix Chopper=2 (outils) ;
//   Canopy=0 (confirme absent de l'infobox), Fig=1, Helix=2 (armure -- 1
//   seul champ gemstone_slots sur la page de SET, pas par piece -- traite
//   comme un total pour l'objet "armure" complet, meme convention que
//   Reaper Armor/Combat qui n'a jamais ete per-piece non plus dans ce
//   calculateur). Applique a TOUS les tiers ou l'item concerne est reellement
//   choisi (contrairement au Sharpening Shard, ces slots existent des Fig/
//   mid-tier, pas seulement Helix/end-late).
// - Frenzy (item ability outil, PERMANENT une fois le seuil de logs coupes
//   atteint) : Fig Hew +1 Sweep/2000 logs (max 20), Figstone Splitter
//   +1/10000 (max 20, plus lent malgre l'upgrade -- verifie tel quel, pas
//   une contradiction), Helix Chopper +1/20000 (max 40). Investissement reel
//   tres important (Helix = 800 000 logs coupes pour le cap) -- meme
//   discipline "investissement max END/LATE" que Sharpening Shard.
const CITRINE_SLOTS_BY_TOOL: Record<string, number> = { FIG_AXE: 1, FIGSTONE_AXE: 2, HELIX_CHOPPER: 2 }
const TOOL_RARITY: Record<string, string> = { FIG_AXE: 'UNCOMMON', FIGSTONE_AXE: 'RARE', HELIX_CHOPPER: 'EPIC' }
const CITRINE_SLOTS_BY_ARMOR: Record<string, number> = { 'Fig Armor': 1, 'Helix Armor': 2 }
const ARMOR_RARITY: Record<string, string> = { 'Fig Armor': 'RARE', 'Helix Armor': 'EPIC' }
const FRENZY_BY_TOOL: Record<string, { cap: number }> = { FIG_AXE: { cap: 20 }, FIGSTONE_AXE: { cap: 20 }, HELIX_CHOPPER: { cap: 40 } }

// Heart of the Forest (HOTF) -- 22 aout, trouve suite a question explicite
// de l'utilisateur ("on a bien pris en compte HOTM et HOTF ??"). Verifie :
// Mining a bien HOTM (HOTM_MAX dans pluton-mining.ts), mais Foraging n'avait
// JAMAIS touche HOTF (`hotf_perks`, 30 lignes, arbre analogue a HOTM,
// monnaie Forest Whispers) -- trou reel confirme par grep (0 reference).
// 3 perks DIRECTS/permanents une fois debloques retenus (niveau max
// applique END/LATE, meme convention "investissement max atteignable" que
// HOTM_MAX de Mining) :
// - "sweep" (max niveau 50, formule "id level" = +50 Sweep a L50)
// - "foraging_fortune" (max niveau 50, formule "level*3" = +150 FF a L50)
// - "foraging_madness" (1 seul palier, +10 Sweep +50 FF flat)
// Perks EXCLUS, documentes plutot qu'invente :
// - "forest_strength" (jusqu'a +1000 Sweep/+1000 FF a 1000 Strength) --
//   conditionnel a la stat Strength du joueur, jamais trackee par ce
//   calculateur Foraging (stat Combat), aucune valeur de reference sourcee
//   pour un setup Foraging pur -- inventer un total Strength violerait la
//   regle #7, gap documente plutot que force.
// - "half_full"/"half_empty" -- necessitent un 2e joueur a proximite avec
//   l'effet complementaire actif, situationnel/multijoueur, meme famille
//   que les bonus multijoueur deja exclus ailleurs dans Pluton.
// - "early_bird" (+20 Sweep/+100 FF mais SEULEMENT les 250 premiers arbres
//   coupes par jour) -- fraction negligeable du volume horaire vise par ce
//   calculateur (72 000 actions/h), meme categorie que les "Temporary
//   Sources" deja exclues par Farming.
// - "collector" (double Berries/Island Resources) -- pas Sweep/FF, drop
//   different hors scope de ce calculateur (logs uniquement).
const HOTF_SWEEP_MAX = 50 // perk "sweep", niveau 50 * 1
const HOTF_FORAGING_FORTUNE_MAX = 150 // perk "foraging_fortune", niveau 50 * 3
const HOTF_FORAGING_MADNESS = { sweep: 10, fortune: 50 } // palier unique

// "Logger" -- gap reel trouve (24 aout, audit exhaustivite ressources) :
// chaque niveau de Foraging accorde +4 Foraging Fortune (sourcee wiki page
// "Foraging" + table foraging_leveling_rewards, "{{Stat|foraging_fortune|
// +4}}" par niveau), cumulatif jusqu'au niveau max actuel 57 = +228 FF --
// jamais modelise, alors que cette source depasse a elle seule HOTF+
// Lumberjack+Citrine combines. Meme convention que MINING_SKILL_60_FORTUNE/
// niveau Combat max ailleurs dans Pluton (skill suppose progresse en
// parallele du joueur) -- applique seulement en investissement max
// (comme HOTF juste au-dessus), pas une valeur inventee par tier
// intermediaire faute d'une courbe de progression Foraging reelle sourcee.
const LOGGER_FORAGING_FORTUNE_MAX = 228 // +4/niveau x 57 niveaux max

// Center of the Forest (23 aout, trouve en corrigeant la corruption
// "[object Object]" de hotf_perks.lore -- lore reconstruite depuis la
// vraie page wiki "Heart of the Forest#Tier 5" apres avoir trouve que
// hotf_perks.perk_id='center_of_the_forest' n'etait jamais consomme par
// ce fichier, alors que ses 5 niveaux de recompense sont bien reels).
// Perk PERMANENT (non reinitialisable, confirme explicitement par la page
// "Heart of the Forest" elle-meme : "The Center of the Forest cannot be
// reset, making it a permanent perk once upgraded"). Niveau max 5 :
// - Lvl 2 : Sweep +5%
// - Lvl 4 : Sweep +10%
// Multiplicatif sur le Sweep total (pas un flat, confirme par le template
// wiki {{Stat|swp|+5%}} -- Sweep est un nombre brut, jamais lui-meme un
// pourcentage, donc "+X%" ne peut se lire que comme une augmentation
// relative du total deja accumule). Applique meme convention "investissement
// max END/LATE" que le reste des perks HOTF de ce fichier.
// Lvl 1 (+1 Axe Ability Level) et Lvl 3 (Forest Whispers/Tree Gift, monnaie
// non pricee) explicitement PAS integres : aucun systeme d'Axe Ability n'est
// modelise cote Pluton Foraging (meme categorie de gap que le systeme de
// Classes non modelise sur Dungeons), et le gain de Forest Whispers ne
// touche aucune stat de rendement.
const CENTER_OF_THE_FOREST_SWEEP_MULT = 1 + 5 / 100 + 10 / 100

// Forest Essence Shop, perk "Lumberjack" (22 aout, trouve en auditant les
// Essence Shops) -- +2/4/6/8/10/12/14/16/18/20 Foraging Fortune (10
// paliers, niveau max), AUCUNE restriction de lieu dans le texte du perk
// lui-meme (contrairement a sa "soeur" Forest Training, "while on Foraging
// Islands" -- verifie explicitement, pas suppose identique).
const LUMBERJACK_FORAGING_FORTUNE_MAX = 20

function citrineForagingFortuneBonus(toolItemId: string, armorSetPrefix: string): number {
  let bonus = 0
  const toolSlots = CITRINE_SLOTS_BY_TOOL[toolItemId]
  if (toolSlots) {
    const rarity = recombobulatedRarity(TOOL_RARITY[toolItemId])
    bonus += toolSlots * (CITRINE_PERFECT_BY_RARITY[rarity] ?? 0)
  }
  const armorSlots = CITRINE_SLOTS_BY_ARMOR[armorSetPrefix]
  if (armorSlots) {
    const rarity = recombobulatedRarity(ARMOR_RARITY[armorSetPrefix])
    bonus += armorSlots * (CITRINE_PERFECT_BY_RARITY[rarity] ?? 0)
  }
  return bonus
}

export type ForagingRankingResult = {
  target_block: string
  target_block_id: number
  tier: SevenTier
  top_setup: {
    armor_set: string
    tool: string
    tool_item_id: string
    total_sweep: number
    total_foraging_fortune: number
    real_cost: number
    logs_per_swing: number
    actions_per_hour: number
    yield_per_hour: number
    coins_per_hour_raw_block_only: number
    pet?: { source_id: string; rarity: string | null; sweep: number; foraging_fortune: number } | null
    pet_candidates_checked?: number
    accessories?: { source_id: string; equip_slot: string; sweep: number; foraging_fortune: number }[]
    max_investment_sweep_bonus?: number
  } | null
  eligible_combos_count: number
  total_combos_checked: number
}

// Pets (competitifs, un seul actif) + accessoires (competition REELLE par
// equip_slot ici, contrairement a Mining ou chaque slot n'avait qu'un seul
// candidat connu -- Necklace/Belt/Bracelet ont chacun 2 items reels en
// concurrence, voir migration insert_pluton_foraging_extra_gear) -- pilote
// par stat_bonus_sources, jamais une liste presupposee.
//
// 🔴 Bug reel corrige (24 aout, audit exhaustivite ressources) : cette
// fonction ne lisait QUE stat_name='sweep' -- le Foraging Fortune de TOUS
// les accessoires/pets/passifs (Torrhus Belt +10FF, Veilshroom Bracelet
// +25FF, Mangrove Locket/Vine/Grippers +5FF chacun, JADE_DRAGON pet +50FF,
// MONKEY pet +60FF, reforges Groovy/Moonglade +7/+15FF, enchant Absorb
// +20FF) etait silencieusement ignore -- seul le Sweep de ces memes items
// etait compare/applique, le meilleur item par slot pouvait donc etre
// choisi a tort sur le Sweep seul en ignorant une FF superieure d'un
// candidat concurrent. Corrige : chaque candidat par slot est desormais
// retenu par son impact REEL en coins/h (Sweep+FF combines), pas par le
// Sweep seul -- meme discipline "recherche reelle" deja appliquee aux pets.
// PERFECT_CITRINE_GEMSTONE exclu explicitement (deja modelise separement
// via citrineForagingFortuneBonus/CITRINE_PERFECT_BY_RARITY, eviterait un
// double-compte sinon).
export type ForagingPetAndAccessoryLayer = {
  best_pet: { source_id: string; rarity: string | null; sweep: number; foraging_fortune: number } | null
  pet_candidates_checked: number
  accessories: { source_id: string; equip_slot: string; sweep: number; foraging_fortune: number }[]
  total_sweep: number
  total_foraging_fortune: number
}

export async function applyForagingPetsAndAccessories(
  baseSweep: number,
  baseForagingFortune: number,
  toughness: number,
  sellPrice: number
): Promise<ForagingPetAndAccessoryLayer> {
  const { data: sources } = await supabase
    .from('stat_bonus_sources')
    .select('source_id, equip_slot, stat_name, rarity, bonus_numeric')
    .in('stat_name', ['sweep', 'foraging_fortune'])
    .in('equip_slot', ['pet', 'necklace', 'cloak', 'belt', 'bracelet', 'passive'])

  const rows = (sources || []).filter(r => r.source_id !== 'PERFECT_CITRINE_GEMSTONE')

  const localScore = (sweep: number, ff: number) => {
    const logsPerSwing = computeLogsPerSwing(sweep, toughness)
    return ACTIONS_PER_HOUR_FIXED * logsPerSwing * (1 + ff / 100) * sellPrice
  }

  // Regroupe chaque (slot, source_id, rarity) sur ses 2 stats potentielles.
  type Combined = { source_id: string; equip_slot: string; rarity: string | null; sweep: number; foraging_fortune: number }
  const bySlotSource = new Map<string, Combined>()
  for (const r of rows) {
    const key = `${r.equip_slot}:${r.source_id}:${r.rarity}`
    const cur = bySlotSource.get(key) || { source_id: r.source_id, equip_slot: r.equip_slot, rarity: r.rarity ?? null, sweep: 0, foraging_fortune: 0 }
    if (r.stat_name === 'sweep') cur.sweep = Number(r.bonus_numeric) || 0
    if (r.stat_name === 'foraging_fortune') cur.foraging_fortune = Number(r.bonus_numeric) || 0
    bySlotSource.set(key, cur)
  }
  const combined = Array.from(bySlotSource.values())

  // Accessoires (necklace/cloak/belt/bracelet) -- 1 seul candidat retenu par
  // slot, arbitre par impact REEL en coins/h (Sweep+FF combines), pas par le
  // Sweep seul (voir doc du type ci-dessus).
  const bestBySlot = new Map<string, Combined>()
  for (const c of combined) {
    if (c.equip_slot === 'pet' || c.equip_slot === 'passive') continue
    const score = localScore(baseSweep + c.sweep, baseForagingFortune + c.foraging_fortune)
    const current = bestBySlot.get(c.equip_slot)
    const currentScore = current ? localScore(baseSweep + current.sweep, baseForagingFortune + current.foraging_fortune) : -1
    if (!current || score > currentScore) bestBySlot.set(c.equip_slot, c)
  }
  // 'passive' -- toujours additif (plusieurs sources distinctes coexistent :
  // enchant + milestone + consommable + reforge), pas de competition.
  const passiveItems = combined.filter(c => c.equip_slot === 'passive')

  const accessories = [...Array.from(bestBySlot.values()), ...passiveItems]
    .map(c => ({ source_id: c.source_id, equip_slot: c.equip_slot, sweep: c.sweep, foraging_fortune: c.foraging_fortune }))
  const accSweep = accessories.reduce((s, a) => s + a.sweep, 0)
  const accFF = accessories.reduce((s, a) => s + a.foraging_fortune, 0)

  // Pets -- compares sur leur impact REEL en coins/h (Sweep+FF combines,
  // meme methode que les accessoires ci-dessus -- corrige le meme bug pour
  // MONKEY, pet Foraging Fortune pur sans aucun Sweep, jamais comparable
  // avant ce fix car la requete ne fetchait meme pas sa ligne).
  const petCombined = combined.filter(c => c.equip_slot === 'pet')
  let bestPet: ForagingPetAndAccessoryLayer['best_pet'] = null
  let bestScore = -1
  for (const p of petCombined) {
    const testSweep = baseSweep + accSweep + p.sweep
    const testFF = baseForagingFortune + accFF + p.foraging_fortune
    const score = localScore(testSweep, testFF)
    if (score > bestScore) {
      bestScore = score
      bestPet = { source_id: p.source_id, rarity: p.rarity, sweep: p.sweep, foraging_fortune: p.foraging_fortune }
    }
  }

  return {
    best_pet: bestPet,
    pet_candidates_checked: petCombined.length,
    accessories,
    total_sweep: baseSweep + accSweep + (bestPet?.sweep || 0),
    total_foraging_fortune: baseForagingFortune + accFF + (bestPet?.foraging_fortune || 0),
  }
}

export async function computeForagingRanking(tier: SevenTier, blockId: string, tierConfig?: SevenTierConfig): Promise<ForagingRankingResult> {
  const [{ data: block }, { data: toolStats }, { data: armorStats }, priced, resolvedTierConfig] = await Promise.all([
    supabase.from('pluton_target_blocks').select('*').eq('activity_key', 'foraging').eq('block_id', blockId).single(),
    supabase.from('pluton_foraging_tool_stats').select('*').eq('verified', true),
    supabase.from('pluton_foraging_armor_stats').select('*'),
    loadPricedItems(),
    tierConfig ? Promise.resolve(tierConfig) : loadSevenTierConfig().then(cfg => cfg[tier]),
  ])

  if (!block) throw new Error(`Unknown target block: ${blockId}`)

  // 🔴 Bug reel corrige (25 aout, meme decouverte que computeLogsPerSwing) :
  // le fallback `|| 1` transformait un vrai Toughness=0 (arbres de base
  // Oak/Spruce/Birch/Jungle/Acacia/Dark Oak, The Park/Forest) en 1,
  // routant a tort vers la formule Galatea au lieu de la formule lineaire
  // simple des arbres de base. `?? 0` prend le block_strength reel tel
  // quel (0 est une valeur legitime, pas une absence de donnee).
  const toughness = Number(block.block_strength ?? 0)
  const priceById = new Map<string, PricedItem>(priced.map(p => [p.item_id, p]))
  const armorMax = resolvedTierConfig.max_gear_cost * 3
  const toolMax = resolvedTierConfig.max_gear_cost * 3
  // Pas de plancher de prix -- meme raisonnement que Mining (5 aout) :
  // Foraging n'a que 3 sets d'armure et 6 outils reels connus (categorie
  // clairsemee), un plancher exclurait a tort le meilleur set/outil reel a
  // un tier donne au lieu de filtrer du gear sous-optimal.

  const combos: {
    armor_set: string; tool: string; tool_item_id: string
    total_sweep: number; total_foraging_fortune: number
    real_cost: number
  }[] = []
  let totalChecked = 0

  for (const armor of armorStats || []) {
    const pieces = [armor.helmet_item_id, armor.chestplate_item_id, armor.leggings_item_id, armor.boots_item_id]
    const piecePrices = pieces.map(id => priceById.get(id)?.price)
    if (piecePrices.some(p => p === undefined)) continue
    const armorCost = piecePrices.reduce((s, p) => s! + p!, 0)!
    if (armorCost > armorMax) continue

    for (const tool of toolStats || []) {
      totalChecked++
      const toolPrice = priceById.get(tool.item_id)?.price
      if (toolPrice === undefined || toolPrice > toolMax) continue

      combos.push({
        armor_set: armor.set_name,
        tool: tool.display_name,
        tool_item_id: tool.item_id,
        total_sweep: Number(armor.set_sweep) + Number(tool.base_sweep),
        total_foraging_fortune: Number(armor.set_foraging_fortune) + Number(tool.base_foraging_fortune),
        real_cost: armorCost + toolPrice,
      })
    }
  }

  // Prix reel deja calcule au moment de la cartographie (effective_sell_price,
  // meme convention que Mining pour les gemmes) -- prix Bazaar du log brut.
  const sellPrice = block.effective_sell_price != null ? Number(block.effective_sell_price) : 0

  function scoreYield(sweep: number, ff: number) {
    const logsPerSwing = computeLogsPerSwing(sweep, toughness)
    const yieldPerHour = ACTIONS_PER_HOUR_FIXED * logsPerSwing * (1 + ff / 100)
    const coinsPerHourRawBlockOnly = yieldPerHour * sellPrice
    return { logsPerSwing, yieldPerHour, coinsPerHourRawBlockOnly }
  }

  const scored = combos
    .map(c => ({ ...c, ...scoreYield(c.total_sweep, c.total_foraging_fortune) }))
    .sort((a, b) => b.coinsPerHourRawBlockOnly - a.coinsPerHourRawBlockOnly)

  let topSetup: any = scored[0] ?? null
  if (topSetup) {
    // 🔴 BUG REEL CORRIGE (25 aout, meme famille que Mining/Fishing/Combat) :
    // cette couche etait appliquee a TOUS les tiers sans verification de
    // budget -- des accessoires/pets tres haut de gamme (Torrhus Belt,
    // Veilshroom Bracelet, pet Jade Dragon/Monkey...) se retrouvaient dans
    // le setup "optimal" starter, irrealiste. Gate desormais a
    // INVESTMENT_MAX_TIERS, meme convention que Mining/Combat.
    const layer = INVESTMENT_MAX_TIERS.has(tier)
      ? await applyForagingPetsAndAccessories(topSetup.total_sweep, topSetup.total_foraging_fortune, toughness, sellPrice)
      : { best_pet: null, pet_candidates_checked: 0, accessories: [], total_sweep: topSetup.total_sweep, total_foraging_fortune: topSetup.total_foraging_fortune }
    let finalSweep = layer.total_sweep
    let finalFF = layer.total_foraging_fortune
    let maxInvestmentBonus: number | undefined

    // Gemmes Citrine (Foraging Fortune) -- appliquees des que l'outil/
    // armure reellement choisi a un emplacement reel, a TOUS les tiers
    // (contrairement au Sharpening Shard ci-dessous, ces slots existent
    // deja des Fig/mid-tier). Voir doc de citrineForagingFortuneBonus.
    finalFF += citrineForagingFortuneBonus(topSetup.tool_item_id, topSetup.armor_set)

    // First Impression (23 aout, audit exhaustivite enchants) -- enchant
    // ULTIMATE Foraging (AXE), +Sweep sur les Log Breaks -- applique a tous
    // les tiers (pas seulement investissement max), voir doc de la constante.
    finalSweep += FIRST_IMPRESSION_SWEEP_BY_TIER[tier]

    if (INVESTMENT_MAX_TIERS.has(tier)) {
      maxInvestmentBonus = maxInvestmentSweepBonus(blockId)
      finalSweep += maxInvestmentBonus
      // Frenzy (item ability outil, PERMANENT une fois le seuil de logs
      // coupes atteint) -- investissement reel tres important (voir doc),
      // meme discipline "investissement max END/LATE" que Sharpening Shard.
      const frenzy = FRENZY_BY_TOOL[topSetup.tool_item_id]
      if (frenzy) finalSweep += frenzy.cap
      // Heart of the Forest (HOTF) -- 3 perks directs/permanents, niveau
      // max atteignable (voir doc des constantes).
      finalSweep += HOTF_SWEEP_MAX + HOTF_FORAGING_MADNESS.sweep
      finalFF += HOTF_FORAGING_FORTUNE_MAX + HOTF_FORAGING_MADNESS.fortune
      // Forest Essence Shop, "Lumberjack" -- meme discipline "investissement
      // max END/LATE" que HOTF (voir doc de la constante).
      finalFF += LUMBERJACK_FORAGING_FORTUNE_MAX
      // "Logger" (niveau de skill Foraging) -- voir doc de la constante.
      finalFF += LOGGER_FORAGING_FORTUNE_MAX
      // Center of the Forest (HOTF, perk permanent) -- multiplicatif,
      // applique apres tous les bonus additifs de Sweep (voir doc constante).
      finalSweep *= CENTER_OF_THE_FOREST_SWEEP_MULT
    }

    const { logsPerSwing, yieldPerHour, coinsPerHourRawBlockOnly } = scoreYield(finalSweep, finalFF)
    topSetup = {
      ...topSetup,
      total_sweep: finalSweep,
      total_foraging_fortune: finalFF,
      pet: layer.best_pet,
      pet_candidates_checked: layer.pet_candidates_checked,
      accessories: layer.accessories,
      max_investment_sweep_bonus: maxInvestmentBonus,
      logs_per_swing: logsPerSwing,
      actions_per_hour: ACTIONS_PER_HOUR_FIXED,
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

export type PersistedForagingResult = {
  tier: SevenTier
  block_id: string
  target_block: string
  has_setup: boolean
  coins_per_hour_raw_block_only: number | null
}

export async function computeAndPersistAllForagingRankings(): Promise<PersistedForagingResult[]> {
  const out: PersistedForagingResult[] = []

  await supabase.from('pluton_rankings').delete().eq('activity_key', 'foraging')
  await supabase.from('pluton_setups').delete().eq('activity_key', 'foraging')

  const sevenTierConfig = await loadSevenTierConfig()
  for (const tier of FORAGING_TIER_KEYS) {
    for (const blockId of FORAGING_TARGET_BLOCK_IDS) {
      const result = await computeForagingRanking(tier, blockId, sevenTierConfig[tier])

      if (!result.top_setup) {
        out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: false, coins_per_hour_raw_block_only: null })
        continue
      }

      const s = result.top_setup
      const { data: setupRow, error: setupErr } = await supabase
        .from('pluton_setups')
        .insert({
          activity_key: 'foraging',
          tier,
          investment_level: 'optimal',
          armor_set_prefix: s.armor_set,
          tool_item_id: s.tool_item_id,
          // Colonnes reutilisees (entieres cote DB) -- total_mining_speed porte
          // le Sweep total, total_mining_fortune la Foraging Fortune totale
          // (meme convention de reutilisation deja appliquee par Farming pour
          // ses propres stats non-Mining).
          total_mining_speed: Math.round(s.total_sweep),
          total_mining_fortune: Math.round(s.total_foraging_fortune),
          total_breaking_power: 0,
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
          activity_key: 'foraging',
          tier,
          target_block_id: result.target_block_id,
          setup_id: setupRow.id,
          rank: 1,
          mining_time_seconds: 1 / SWING_PER_SECOND_ENGINE_CAP,
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
