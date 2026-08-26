// lib/pluton-farming.ts
// Pluton Farming (5 août) -- même discipline que lib/pluton-mining.ts (jamais de
// constante de jeu reconstituée de mémoire, tout sourcé wiki officiel/Supabase),
// mécanique de rendement fondamentalement différente de Mining :
//
// - Mining : vitesse (stat de gear) détermine le nombre de ticks par bloc cassé,
//   Mining Fortune multiplie le nombre de drops.
// - Farming : AUCUNE stat de gear ne détermine la vitesse de cassage -- confirmé
//   par la page wiki "Farming" ("the number of Crops broken per second") et par
//   Rancher's Boots/Sundial (permettent de PLAFONNER sa vitesse de déplacement à un
//   optimum par culture, sans qu'aucune source chiffrée -- ni wiki, ni SkyHanni-REPO
//   -- ne documente cet optimum précis par culture). Décision explicite de
//   l'utilisateur (5 août, après consultation) : traiter le plafond moteur Minecraft
//   lui-même (20 ticks/seconde = 1 action par tick au maximum physique, le même
//   principe que le mécanisme "instamine" déjà implémenté pour Mining) comme le débit
//   universel d'un setup parfaitement optimisé, qu'il soit joué manuellement à vitesse
//   plafonnée ou via une ferme automatisée -- AUCUNE des deux méthodes ne peut
//   dépasser ce plafond moteur, donc il sert de ceiling commun sans qu'il soit
//   nécessaire de trancher laquelle des deux est utilisée.
//   actionsPerHour = 20 * 3600 = 72 000, FIXE, ne dépend d'aucun stat de gear.
//
// - Farming Fortune + Crop Fortune (formule réelle, page wiki "Crop Fortune") :
//   ExpectedDrop = BaseDrop * (1 + (FarmingFortune + CropFortune) / 100)
//   Chaque point = 1% de chance de +100% drops, garanti tous les 100 points --
//   IDENTIQUE à la formule Mining Fortune (même système de jeu sous-jacent).
//
// - baseDropCount = 1 pour les 13 cultures -- mécanique vanilla Minecraft : une
//   culture cassée à hauteur 1 (jamais laissée pousser plus haut, design de ferme
//   optimal aussi bien manuel qu'automatisé) donne exactement 1 item par cassure.
//
// - Farming Fortune n'a AUCUN effet sur Private Island (confirmé page wiki
//   "Farming Fortune") -- Garden est donc la seule zone pertinente pour ce calcul,
//   cohérent avec TIER_CONFIG (lib/money-making-constants.ts) qui interdit
//   explicitement le Garden au tier EARLY ("forbidden: ... Garden ...") et ne
//   l'autorise qu'à partir de MID ("access: ... Garden basic ..."). EARLY est donc
//   honnêtement NON ÉLIGIBLE pour Farming (top_setup:null, eligible_combos:0),
//   même traitement que les combos Mining structurellement impossibles à un tier
//   donné -- pas un bug, pas un oubli.

import { createClient } from '@supabase/supabase-js'
import type { SevenTierConfig } from './money-making-constants'
import { SEVEN_TIER_KEYS, type SevenTier, loadSevenTierConfig, INVESTMENT_MAX_TIERS, MID_INVESTMENT_TIERS, EARLY_INVESTMENT_TIERS } from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Plafond moteur Minecraft -- 20 ticks/seconde, 1 action par tick au maximum
// physique. Source : mécanique de tick vanilla Minecraft (20 TPS), confirmée
// comme le vrai plafond par l'utilisateur (5 août) après qu'aucune source
// chiffrée (wiki, SkyHanni-REPO) n'ait documenté de vitesse "optimale" par
// culture pour la variante manuelle, et qu'aucun débit canonique de ferme
// automatisée n'existe (dépend de l'ingénierie redstone du joueur, jamais un
// vrai palier de jeu comme le cooldown fixe de Mining Speed Boost).
const CROPS_PER_SECOND_ENGINE_CAP = 20
const ACTIONS_PER_HOUR_FIXED = CROPS_PER_SECOND_ENGINE_CAP * 3600 // 72 000

// Rare Crop bonus drops ("Overbloom") -- 24 aout, audit exhaustivite
// ressources Farming. Gap reel trouve : la page wiki source du
// "Theoretical Maximum" (base du calcul ci-dessous depuis le 5 aout) porte
// un bandeau {{Outdated}} -- un patch a scinde ce mecanisme hors de Farming
// Fortune vers un stat "Overbloom" jamais modelisee depuis, laissant ce
// revenu entierement absent (jusqu'a ~1.38M coins/h au tier master sur
// Helianthus seul). Chance de drop BASE (independante d'un multiplicateur
// Overbloom non sourcee, jamais invente -- regle #7) par piece d'armure de
// PROGRESSION reelle portee, sourcee wiki page de chaque Rare Crop -- 2
// ancres seulement (2/4 et 4/4 pieces), interpolation lineaire interdite
// faute d'un 3e point, donc traitee comme un palier binaire MID/MAX comme
// le reste des bonus "investissement" de ce fichier -- conservateur,
// sous-estime le vrai total si Overbloom scale au-dela de ces 2 points.
const RARE_CROP_BY_CATEGORY: Record<string, { itemId: string; chance2of4Pct: number; chance4of4Pct: number }> = {
  CROPIE: { itemId: 'CROPIE', chance2of4Pct: 0.03, chance4of4Pct: 0.05 },
  SQUASH: { itemId: 'SQUASH', chance2of4Pct: 0.01, chance4of4Pct: 0.03 },
  FERMENTO: { itemId: 'FERMENTO', chance2of4Pct: 0.005, chance4of4Pct: 0.007 },
  HELIANTHUS: { itemId: 'HELIANTHUS', chance2of4Pct: 0.002, chance4of4Pct: 0.004 },
}
const CROP_TO_RARE_CROP_CATEGORY: Record<string, keyof typeof RARE_CROP_BY_CATEGORY> = {
  WHEAT: 'CROPIE', CARROT: 'CROPIE', POTATO: 'CROPIE',
  PUMPKIN: 'SQUASH', MELON_SLICE: 'SQUASH', COCOA_BEANS: 'SQUASH',
  CACTUS: 'FERMENTO', SUGAR_CANE: 'FERMENTO', MUSHROOM: 'FERMENTO', NETHER_WART: 'FERMENTO',
  SUNFLOWER: 'HELIANTHUS', MOONFLOWER: 'HELIANTHUS', WILD_ROSE: 'HELIANTHUS',
}

// 7 tiers reels (starter->master, 23 aout) -- starter/amateur restent
// toujours non eligibles en pratique (voir doc plus bas, Garden interdit a
// ces 2 tiers, meme mecanique que l'ancien 'early').
export const ALL_FARMING_TIER_KEYS: readonly SevenTier[] = SEVEN_TIER_KEYS
export type FarmingTierKey = SevenTier

// Les 8 crops sur la liste d'export de Carrolyn (+12 Crop Fortune permanent,
// sourcé wikitext "Farming Fortune#Theoretical Maximum") -- Cocoa Beans a EN
// PLUS le Chocolate Fortune perk (+25), donc traité à part.
const CARROLYN_EXPORT_CROPS = new Set([
  'WHEAT', 'CARROT', 'PUMPKIN', 'CACTUS', 'MUSHROOM', 'NETHER_WART', 'WILD_ROSE',
])

// ============================================================
// Couche "investissement maximal" END/LATE -- reproduit EXACTEMENT le
// "Theoretical Maximum" déjà calculé et vérifié par la communauté wiki
// (page "Farming Fortune", section dédiée, fetchée en wikitext le 5 août)
// plutôt que de reconstruire chaque sous-composant depuis les tables brutes
// (Tools/Armor/Equipment/Enchantments/Reforges/Pets/Attributes/Chips) --
// contrairement à Mining où aucune synthèse officielle n'existait, ce total
// est déjà public, sourcé et self-consistent (la page donne elle-même le
// sous-total après chaque section, vérifiable ligne par ligne).
//
// Composition du setup retenu par la page (choix déjà arbitrés par le wiki,
// pas par nous) :
// - Farming LX (60) : +240 FF
// - Extra Farming Fortune perk (Anita, 15 tiers) : +60 FF
// - Garden Farming Fortune Account Upgrade (Elizabeth) : +40 FF
// - Crop Analyzer Milestones (Jake) : +30 FF
// - Garden Plot Land (24 plots) : +72 FF
// - Garden Bestiary (17 Pest Bestiary) : +102 FF
// - 5x Refined Dark Cacao Truffle consommés (effet permanent) : +5 FF
// - 5x Rosewater Flask consommés (effet permanent) : +5 FF
// - Personal Best (Anita) : +100 Crop Fortune
// - Garden Crop Upgrades (9 tiers) : +45 Crop Fortune
// - Carrolyn (8 cultures, +12 chacune) + Chocolate Fortune perk (+25 Cocoa
//   Beans uniquement)
// - Pet : Rose Dragon Lv200 (+40 base, +180 Garden Power @Farming60, +89.7
//   Rosy Scales @tous les Crop Milestones maxés, +27 Symbiosis @9 autres pets
//   Farming maxés) = +336.7 FF -- bat le meilleur pet crop-spécifique
//   (Mosquito Sugar Cane +175, Bee Sunflower/Moonflower/Wild Rose +160, Pig
//   Potato ~+95) sur TOUTES les cultures simultanément puisque Rose Dragon
//   alimente le pool Farming Fortune générique, pas un pool crop-spécifique
//   -- vérifié : 336.7 > 175 > 160 > 95, donc jamais dominé.
// - Armure : Helianthus complet recombobulé + reforge Mossy + 8 Perfect
//   Peridot + Pesterminator VI (+225+120+80+48 = +473 FF)
// - Équipement (necklace/cloak/belt/bracelet) : Blossom Set @2500 visiteurs
//   + reforge Rooted + Green Thumb V @140 visiteurs (+118+72+140 = +330 FF)
// - Talismans/Attributs/Chips : Farming Talisman + Helianthus Relic + Relic
//   of Power (Peridot) + Lunar Moth/Firefly Shard + Galaxy Fish Shard +
//   Cropshot Chip (+3+40+5+50+10+100 = +208 FF)
// - Outil : Specialized Farming Tool niveau 50 Mk.III + reforge
//   Overpriced/Earthy + 4 Perfect Peridot + Harvesting VI + Cultivating X +
//   5x Farming for Dummies (+200+25+32+75+20+5 = +357, dont +200 en Crop
//   Fortune crop-spécifique, le reste en FF générique) + Turbo-Crop VII
//   (+35 Crop Fortune) + Dedication IV @tous les paliers maxés (+92 Crop
//   Fortune) -- les 3 derniers (+200/+35/+92 = +327) sont crop-spécifiques,
//   le reste (+25+32+75+20+5 = +157) est FF générique.
//
// Total officiel (vérifié wiki, PAS recalculé à la main pour éviter une
// divergence d'arrondi) : +2012.7 Farming Fortune générique, +472 Crop
// Fortune (cultures hors liste Carrolyn), +484 Crop Fortune (les 7 autres
// cultures Carrolyn), +509 Cocoa Beans Fortune (Carrolyn + Chocolate perk).
//
// Correction post-audit (5 août, 2e passe demandée explicitement par
// l'utilisateur : "es-tu sûr d'avoir tout maxé") -- la page wiki
// "Farming Fortune" s'annonce elle-même partiellement obsolète depuis la
// mise à jour Greenhouse ("A lot of the information on this page is
// currently outdated"). Vérification faite en croisant TOUS les Attribute
// Shards taggés skill=Farming (5 pages de rareté, wikitext brut) contre le
// build de référence de la page -- 1 vrai trou trouvé : le shard Fly
// (Common, attribut "Fortunate Farmer") donne +2.5 à +25 Farming Fortune,
// inconditionnel, jamais mentionné dans le build de référence de la page
// elle-même. Les autres shards Farming trouvés dans le même audit sont soit
// déjà comptés (Lunar Moth/Firefly/Galaxy Fish, déjà dans le build
// d'origine), soit conditionnels à un Pest présent dans la parcelle
// (Cricket/Earthworm -- même famille que Termite Shard déjà exclu comme
// situationnel, cohérent). Golden Dragon Pet vérifié et écarté : c'est un
// pet de type Combat (confirmé page wiki dédiée), aucun Farming Fortune,
// Rose Dragon reste le meilleur pet réel.
const FLY_SHARD_FORTUNATE_FARMER_MAX = 25
const FARMING_FORTUNE_MAX_PERMANENT = 2012.7 + FLY_SHARD_FORTUNATE_FARMER_MAX
const CROP_FORTUNE_MAX_GENERIC = 472       // Potato, Melon Slice, Sugar Cane, Sunflower, Moonflower
const CROP_FORTUNE_MAX_CARROLYN = 484      // Wheat, Carrot, Pumpkin, Cactus, Mushroom, Nether Wart, Wild Rose
const CROP_FORTUNE_MAX_COCOA_BEANS = 509   // Cocoa Beans (Carrolyn + Chocolate Fortune perk)

// Sources temporaires (Temporary Sources, page wiki) -- explicitement EXCLUES
// de ce plafond "toujours actif" : la plupart sont soit conditionnées à un
// contexte de jeu ponctuel qu'on ne modélise pas en continu (saison Spring
// uniquement pour Atmospheric Filter, saison aléatoire pour Magic 8 Ball,
// mutuellement exclusifs avec Harvest Feast selon la page elle-même), soit
// réservées au Jacob's Farming Contest (Anita's Artifact/Overdrive Chip
// doublés, Zorro's Cape doublé pendant le concours -- hors scope "ferme
// continue en Garden"), soit basées sur du RNG à très faible taux (Crop
// Fever, 0.001%/niveau). Le "Pesthunter Phillip pest turn-in" (+200 FF max)
// N'EST PLUS exclu -- voir PEST_KILL_ECONOMY ci-dessous, reclassé et modélisé
// correctement (5 août, 3e passe) après avoir réalisé que c'est un vrai
// buff à taux d'arrivée constant (même famille de calcul que Mining Speed
// Boost), pas une ressource ponctuelle comme supposé à tort en 2e passe.
// Refined Dark Cacao Truffle/Rosewater Flask restent comptés séparément
// (effet permanent après 5x consommés, explicitement listé dans "Permanent
// & Unchangeable" par le wiki lui-même, distinct de leur buff 60 min).
// Documenté ici comme gap honnête, pas oublié : jusqu'à +776.5 FF restants
// (hors Pesthunter Phillip, désormais modélisé) existent en jeu mais
// nécessitent un contexte non-continu (saison, Jacob's Contest).

// ============================================================
// Pest Farming (5 août, 3e passe -- trouvé omis, signalé explicitement par
// l'utilisateur : "tu omés des méthodes, le pest farm par exemple"). Un Pest
// a une chance de spawn à chaque culture cassée en Garden (dès Garden V),
// MAIS le vrai débit est plafonné par un cooldown entre spawns (pas par le
// taux de casse de culture) -- sourcé page wiki "Pest#Spawn Cooldown" :
// cooldown de base 5 min, réductions réelles listées (Finnegan/Pesthunter
// gear/reforge Squeaky/Moth Shard), plancher réel 2min10s SANS le perk
// Mayor "Pest Eradicator" (Finnegan), 1min10s AVEC. Le perk Mayor est
// conditionnel à une élection (même famille que Mining Fiesta de Cole,
// jamais compté comme actif en continu dans ce projet) -- baseline retenue :
// 2min10s (130s), SANS Finnegan, cohérence avec le reste du calculateur.
// "The Pest spawned is not affected by the crop broken" (même page) --
// confirmé : le meilleur Pest peut être ciblé (Sprayonator + vinyle dédié)
// quelle que soit la culture activement farmée, donc ce bonus s'additionne
// à TOUTES les cultures de façon identique, pas seulement à sa "culture
// associée".
//
// Chaque page wiki dédiée par Pest (13 pages individuelles fetchées et
// lues le 5 août, PAS le résumé "Rare Drops" pré-existant en base qui
// s'est révélé faux -- garden_pest_rare_drops donnait 33% pour le Slug là
// où la vraie page indique 0.75%, erreur de données trouvée et non
// utilisée ici) donne un "Mob Drops Table" uniforme :
// - 1 000 coins fixes par kill
// - 1 drop GARANTI (100%) d'un item Enchanted de la culture associée,
//   quantité = base + floor(FarmingFortune / diviseur) -- scale avec la
//   VRAIE Farming Fortune générique du joueur, pas la Crop Fortune
// - 1 drop rare (0.75%, uniforme sur les 13 pests) d'un item en gros lot
// - le reste (vinyles, cosmétiques, Pest Bait, Dung Dye 1/250k) exclu :
//   valeur négligible ou non-monétaire
type PestEntry = {
  name: string; commonItemId: string; commonBase: number; commonDivisor: number
  rareItemId: string; rareCount: number
}
const PESTS: PestEntry[] = [
  { name: 'Fly', commonItemId: 'ENCHANTED_WHEAT', commonBase: 1, commonDivisor: 52.5, rareItemId: 'ENCHANTED_HAY_BALE', rareCount: 3 },
  { name: 'Cricket', commonItemId: 'ENCHANTED_CARROT', commonBase: 3, commonDivisor: 15.75, rareItemId: 'ENCHANTED_GOLDEN_CARROT', rareCount: 10 },
  { name: 'Locust', commonItemId: 'ENCHANTED_POTATO', commonBase: 3, commonDivisor: 15.75, rareItemId: 'ENCHANTED_BAKED_POTATO', rareCount: 10 },
  { name: 'Rat', commonItemId: 'ENCHANTED_PUMPKIN', commonBase: 1, commonDivisor: 52.5, rareItemId: 'POLISHED_PUMPKIN', rareCount: 3 },
  { name: 'Mosquito', commonItemId: 'ENCHANTED_SUGAR', commonBase: 3, commonDivisor: 26.25, rareItemId: 'ENCHANTED_SUGAR_CANE', rareCount: 10 },
  { name: 'Earthworm', commonItemId: 'ENCHANTED_MELON', commonBase: 5, commonDivisor: 10.5, rareItemId: 'ENCHANTED_MELON_BLOCK', rareCount: 15 },
  { name: 'Mite', commonItemId: 'ENCHANTED_CACTUS_GREEN', commonBase: 2, commonDivisor: 26.25, rareItemId: 'ENCHANTED_CACTUS', rareCount: 6 },
  { name: 'Moth', commonItemId: 'ENCHANTED_COCOA', commonBase: 3, commonDivisor: 18, rareItemId: 'ENCHANTED_COOKIE', rareCount: 9 },
  { name: 'Slug', commonItemId: 'ENCHANTED_BROWN_MUSHROOM', commonBase: 1, commonDivisor: 52.5, rareItemId: 'ENCHANTED_HUGE_MUSHROOM_1', rareCount: 3 },
  { name: 'Beetle', commonItemId: 'ENCHANTED_NETHER_STALK', commonBase: 3, commonDivisor: 18, rareItemId: 'MUTANT_NETHER_STALK', rareCount: 9 },
  { name: 'Dragonfly', commonItemId: 'ENCHANTED_SUNFLOWER', commonBase: 2, commonDivisor: 26.25, rareItemId: 'COMPACTED_SUNFLOWER', rareCount: 6 },
  { name: 'Firefly', commonItemId: 'ENCHANTED_MOONFLOWER', commonBase: 2, commonDivisor: 26.25, rareItemId: 'COMPACTED_MOONFLOWER', rareCount: 6 },
  { name: 'Praying Mantis', commonItemId: 'ENCHANTED_WILD_ROSE', commonBase: 2, commonDivisor: 26.25, rareItemId: 'COMPACTED_WILD_ROSE', rareCount: 6 },
]
const PEST_RARE_DROP_CHANCE = 0.0075 // 0.75%, uniforme sur les 13 pests, sourcé page individuelle de chaque pest
const PEST_BASE_COINS_PER_KILL = 1000
const PEST_SPAWN_COOLDOWN_SECONDS = 130 // 2min10s, plancher réel SANS Finnegan (Pest Eradicator exclu, mayor-conditionnel)
const PESTS_PER_HOUR = 3600 / PEST_SPAWN_COOLDOWN_SECONDS

// Pesthunter Phillip -- +5 FF par pest tué, buff 30 min, plafond 40 pests
// (+200 FF). Calcul en régime permanent (Little's Law) : masse moyenne de
// buff actif = taux d'arrivée × durée du buff -- même famille de calcul que
// le multiplicateur moyen pondéré de Mining Speed Boost, pas un "actif en
// continu" naïf. Sourcé page wiki "Pesthunter Phillip#Bonus Farming Fortune".
const PESTHUNTER_FF_PER_PEST = 5
const PESTHUNTER_FF_CAP = 200
const PESTHUNTER_BUFF_DURATION_SECONDS = 30 * 60
function pesthunterSteadyStateFF(pestsPerHour: number): number {
  const arrivalPerSecond = pestsPerHour / 3600
  return Math.min(PESTHUNTER_FF_CAP, arrivalPerSecond * PESTHUNTER_BUFF_DURATION_SECONDS * PESTHUNTER_FF_PER_PEST)
}

// Correction post-audit (5 août, 4e passe -- l'utilisateur a directement
// challengé le chiffre : "pest farming peut rapporter 40M+/h en vrai, pourquoi
// ton calcul est si bas ?"). Le vrai trou : "Bonus Pest Chance" (stat dédiée,
// page wiki propre) -- "By default, only one Pest will spawn at a time. This
// can be increased via Bonus Pest Chance... up to 8". Le modèle précédent
// supposait 1 seul Pest par cycle de spawn (130s), alors qu'un vrai build
// maxé fait spawn PLUSIEURS Pests par cycle. Formule réelle (même page) :
// chaque 100 BPC = +1 Pest garanti par spawn, le reste = % de chance d'un
// Pest supplémentaire.
//
// Plafond officiel déjà calculé et vérifié par le wiki (section "Theoretical
// Maximum" de la page "Bonus Pest Chance", réutilisé tel quel comme pour le
// plafond Farming Fortune, même méthodologie) : 551.5 BPC → 5 Pests garantis
// en plus du 1 par défaut (6 total) + 51.5% de chance d'un 7e = 6.515 Pests
// attendus par cycle de spawn, EN ÉVITANT la pénalité Farming Fortune (le
// seuil "avant pénalité" suit aussi le BPC, 4+floor(551.5/100)=9, au-dessus
// du max possible de 8 -- donc jamais déclenchée à ce niveau de BPC, pas
// besoin de la modéliser).
//
// Coût réel, pas caché : ce plafond BPC suppose l'Équipement Pesthunter's Set
// (Necklace/Cloak/Belt/Gloves, vérifié via leurs 4 pages wiki individuelles :
// 0 Farming Fortune, seulement BPC + réduction de cooldown) À LA PLACE du
// Blossom Set utilisé dans le plafond Farming Fortune ci-dessus (+330 FF).
// Comparaison réelle faite avant de trancher : perdre 330 FF sur un total
// d'environ 2000+ ne réduit le multiplicateur de rendement des cultures que
// d'environ 15% (~(1+total-330)/100) / (1+total/100)), alors que le gain en
// revenu de Pest Farming (×6.5 sur le taux, voir ci-dessous) est d'un ordre
// de grandeur supérieur en valeur absolue -- le swap est donc retenu. Note
// honnête : l'allocation précise pièce-par-pièce (quel Pesthunter exact
// remplace quelle pièce Blossom, arbitrage fin non refait ici) n'est pas
// vérifiée dans le détail comme l'a été le reforge Ambered/Glacial de
// Mining -- approximation par comparaison de totaux, pas un vrai calcul
// combinatoire. Documenté comme limite, pas caché.
const BLOSSOM_SET_FF = 118 + 72 + 140 // Blossom Set @2500 visiteurs + reforge Rooted + Green Thumb V @140 visiteurs (déjà dans FARMING_FORTUNE_MAX_PERMANENT)
const BONUS_PEST_CHANCE_MAX = 551.5
const PESTS_PER_SPAWN_EVENT = 1 + Math.floor(BONUS_PEST_CHANCE_MAX / 100) + (BONUS_PEST_CHANCE_MAX % 100) / 100

// Pièges (Pest Trap/Mouse Trap/Vermin Trap) -- source additionnelle,
// indépendante du cooldown de spawn organique, fonctionne même hors-ligne.
// Sourcé page wiki "Pest Trap" : max 3 pièges posés simultanément, ~15 min
// par Pest et par piège (indépendant du taux organique ci-dessus).
const TRAP_COUNT_MAX = 3
const TRAP_MINUTES_PER_PEST = 15
const TRAPS_PESTS_PER_HOUR = TRAP_COUNT_MAX * (60 / TRAP_MINUTES_PER_PEST)

export type FarmingMaxLayer = {
  farmingFortune: number
  cropFortune: number
  cropFortuneCategory: 'generic' | 'carrolyn' | 'cocoa_beans'
}

function cropFortuneCategoryFor(blockId: string): FarmingMaxLayer['cropFortuneCategory'] {
  if (blockId === 'COCOA_BEANS') return 'cocoa_beans'
  if (CARROLYN_EXPORT_CROPS.has(blockId)) return 'carrolyn'
  return 'generic'
}

function farmingMaxLayerFor(blockId: string): FarmingMaxLayer {
  const category = cropFortuneCategoryFor(blockId)
  const cropFortune = category === 'cocoa_beans' ? CROP_FORTUNE_MAX_COCOA_BEANS
    : category === 'carrolyn' ? CROP_FORTUNE_MAX_CARROLYN
    : CROP_FORTUNE_MAX_GENERIC
  return { farmingFortune: FARMING_FORTUNE_MAX_PERMANENT, cropFortune, cropFortuneCategory: category }
}

// Valeur espérée par kill = coins fixes + drop garanti (scale avec la vraie
// Farming Fortune du joueur) + drop rare (0.75%). Le meilleur Pest ciblé via
// Sprayonator/vinyle est identique pour toutes les cultures (voir doc plus
// haut) -- calculé une fois avec le prix réel le plus récent de chaque item,
// jamais moyenné ni deviné.
async function bestPestKillEV(farmingFortune: number): Promise<{ name: string; evPerKill: number }> {
  const itemIds = Array.from(new Set(PESTS.flatMap(p => [p.commonItemId, p.rareItemId])))
  const { data: prices } = await supabase
    .from('price_history')
    .select('item_id, sell_price, bucket_date')
    .in('item_id', itemIds)
    .gt('sell_price', 0)
    .order('bucket_date', { ascending: false })

  const latest = new Map<string, number>()
  for (const p of prices || []) {
    if (!latest.has(p.item_id)) latest.set(p.item_id, Number(p.sell_price))
  }

  let best = { name: '', evPerKill: -1 }
  for (const pest of PESTS) {
    const commonCount = pest.commonBase + Math.floor(farmingFortune / pest.commonDivisor)
    const commonValue = commonCount * (latest.get(pest.commonItemId) || 0)
    const rareValue = pest.rareCount * (latest.get(pest.rareItemId) || 0) * PEST_RARE_DROP_CHANCE
    const evPerKill = PEST_BASE_COINS_PER_KILL + commonValue + rareValue
    if (evPerKill > best.evPerKill) best = { name: pest.name, evPerKill }
  }
  return best
}

// ============================================================
// Couche MID -- pas de budget coins-only comme Mining : les Specialized
// Farming Tools ne sont PAS achetables à l'AH (confirmé : aucun prix trouvé
// dans price_history_ah pour les 13 outils dédiés -- sourcé wikitext "Farming
// Fortune#Specialized Farming Tools" : "Purchased from the SkyMart... leveled
// up by farming crops and upgraded using the corresponding crop and Jacob's
// Tickets", un investissement de TEMPS/XP, pas de coins). Seuls l'armure et
// l'équipement (Peony/Blossom) sont de vrais achats AH -- budget-gatés comme
// Mining. Le niveau d'outil est assumé proportionnel à l'objectif de Farming
// skill du tier (TIER_CONFIG.mid.target = 25), cohérent avec la progression
// de jeu réelle plutôt qu'un chiffre arbitraire.
//
// 8 tiers d'armure réels, valeur FF officielle (wikitext "Farming
// Fortune#Armor") + prix AH réel vérifié le 5 août (variant blended) :
const ARMOR_TIERS: Array<{ prefix: string; helmet: string; chestplate: string; leggings: string; boots: string; fmf: number }> = [
  { prefix: 'Farmhand', helmet: 'FARM_SUIT_HELMET', chestplate: 'FARM_SUIT_CHESTPLATE', leggings: 'FARM_SUIT_LEGGINGS', boots: 'FARM_SUIT_BOOTS', fmf: 20 },
  { prefix: 'Haymaker', helmet: 'FARM_ARMOR_HELMET', chestplate: 'FARM_ARMOR_CHESTPLATE', leggings: 'FARM_ARMOR_LEGGINGS', boots: 'FARM_ARMOR_BOOTS', fmf: 40 },
  { prefix: 'Sprout', helmet: 'PUMPKIN_HELMET', chestplate: 'PUMPKIN_CHESTPLATE', leggings: 'PUMPKIN_LEGGINGS', boots: 'PUMPKIN_BOOTS', fmf: 60 },
  { prefix: 'Tater', helmet: 'MELON_HELMET', chestplate: 'MELON_CHESTPLATE', leggings: 'MELON_LEGGINGS', boots: 'MELON_BOOTS', fmf: 100 },
  { prefix: 'Cropie', helmet: 'CROPIE_HELMET', chestplate: 'CROPIE_CHESTPLATE', leggings: 'CROPIE_LEGGINGS', boots: 'CROPIE_BOOTS', fmf: 135 },
  { prefix: 'Squash', helmet: 'SQUASH_HELMET', chestplate: 'SQUASH_CHESTPLATE', leggings: 'SQUASH_LEGGINGS', boots: 'SQUASH_BOOTS', fmf: 170 },
  { prefix: 'Fermento', helmet: 'FERMENTO_HELMET', chestplate: 'FERMENTO_CHESTPLATE', leggings: 'FERMENTO_LEGGINGS', boots: 'FERMENTO_BOOTS', fmf: 205 },
  { prefix: 'Helianthus', helmet: 'HELIANTHUS_HELMET', chestplate: 'HELIANTHUS_CHESTPLATE', leggings: 'HELIANTHUS_LEGGINGS', boots: 'HELIANTHUS_BOOTS', fmf: 225 },
]

// Specialized Farming Tool -- formule réelle +4/niveau, sourcée wikitext
// "Farming Fortune#Specialized Farming Tools". Niveau assumé = objectif de
// Farming skill du tier (TIER_CONFIG), cohérence de progression plutôt
// qu'un budget coins (impossible, voir ci-dessus).
const SPECIALIZED_TOOL_FMF_PER_LEVEL = 4
const SPECIALIZED_TOOL_MAX_LEVEL = 50

async function bestAffordableArmorTier(maxBudget: number): Promise<{ prefix: string; fmf: number; cost: number } | null> {
  const since = new Date(Date.now() - 4 * 86_400_000).toISOString().split('T')[0]
  const { data: prices } = await supabase
    .from('price_history_ah')
    .select('base_item_id, avg_price, bucket_date')
    .eq('variant_key', '__all_variants_blended__')
    .eq('granularity', 'DAILY')
    .gte('bucket_date', since)
    .gt('avg_price', 0)
    .order('bucket_date', { ascending: false })

  const latest = new Map<string, number>()
  for (const p of prices || []) {
    if (!latest.has(p.base_item_id)) latest.set(p.base_item_id, Number(p.avg_price))
  }

  let best: { prefix: string; fmf: number; cost: number } | null = null
  for (const tier of ARMOR_TIERS) {
    const pieces = [tier.helmet, tier.chestplate, tier.leggings, tier.boots]
    const costs = pieces.map(p => latest.get(p))
    if (costs.some(c => c == null)) continue
    const cost = costs.reduce((a, b) => a! + b!, 0)!
    if (cost <= maxBudget && (!best || tier.fmf > best.fmf)) {
      best = { prefix: tier.prefix, fmf: tier.fmf, cost }
    }
  }
  return best
}

// Équipement (necklace/cloak/belt/bracelet) -- gap réel trouvé (24 aout,
// audit exhaustivite ressources nuit) : ces 4 emplacements ne sont JAMAIS
// recherchés/achetés aux tiers MID (seulement absorbés dans la constante
// figée FARMING_FORTUNE_MAX_PERMANENT au tier MAX, via Blossom Set déjà
// documenté dans son détail plus haut). Un joueur MID a un budget réel
// (`resolvedTierConfig.max_gear_cost`) qui permet souvent Peony (~16M) ou
// Blossom (~64.5M) -- jamais modélisé avant ce fix. Chaîne à 2 paliers
// réels (item_id vérifiés wiki "Necklaces" + familles Belts/Cloaks/
// Bracelets), stats confirmées : Peony +5 FF/pièce, Blossom +7 FF/pièce
// (base, hors bonus "Salesperson" scalant avec les visiteurs Garden --
// non modélisé, contexte non-continu comme les autres Temporary Sources
// déjà exclues). PAS appliqué au tier MAX (déjà compté dans le total wiki
// "Theoretical Maximum" ci-dessus, l'ajouter là-bas doublerait le compte).
const ACCESSORY_TIERS: Array<{ prefix: string; necklace: string; cloak: string; belt: string; bracelet: string; ffPerPiece: number }> = [
  { prefix: 'Peony', necklace: 'LOTUS_NECKLACE', cloak: 'LOTUS_CLOAK', belt: 'LOTUS_BELT', bracelet: 'LOTUS_BRACELET', ffPerPiece: 5 },
  { prefix: 'Blossom', necklace: 'BLOSSOM_NECKLACE', cloak: 'BLOSSOM_CLOAK', belt: 'BLOSSOM_BELT', bracelet: 'BLOSSOM_BRACELET', ffPerPiece: 7 },
]
// Farming Talisman -- +3 FF universel, accessory_bag (empilable, aucun
// arbitrage de slot nécessaire), coût modique. Chaîne Cropie Talisman/
// Squash Ring (Crop Fortune crop-spécifique, gate crop-category différente
// du regroupement generic/carrolyn/cocoa_beans déjà utilisé) volontairement
// PAS incluse ici -- nécessiterait un remaniement du mapping crop-category,
// gain marginal (+10 à +30) très inférieur au gap fermé ci-dessus, documenté
// comme limite plutôt que masqué.
const FARMING_TALISMAN_FF = 3
const FARMING_TALISMAN_ITEM_ID = 'FARMING_TALISMAN'

async function bestAffordableAccessorySet(maxBudget: number): Promise<{ prefix: string; ff: number; cost: number } | null> {
  const since = new Date(Date.now() - 4 * 86_400_000).toISOString().split('T')[0]
  const { data: prices } = await supabase
    .from('price_history_ah')
    .select('base_item_id, avg_price, bucket_date')
    .eq('variant_key', '__all_variants_blended__')
    .eq('granularity', 'DAILY')
    .gte('bucket_date', since)
    .gt('avg_price', 0)
    .order('bucket_date', { ascending: false })

  const latest = new Map<string, number>()
  for (const p of prices || []) {
    if (!latest.has(p.base_item_id)) latest.set(p.base_item_id, Number(p.avg_price))
  }

  let best: { prefix: string; ff: number; cost: number } | null = null
  for (const set of ACCESSORY_TIERS) {
    const pieces = [set.necklace, set.cloak, set.belt, set.bracelet]
    const costs = pieces.map(p => latest.get(p))
    if (costs.some(c => c == null)) continue
    const cost = costs.reduce((a, b) => a! + b!, 0)!
    const ff = set.ffPerPiece * 4
    if (cost <= maxBudget && (!best || ff > best.ff)) {
      best = { prefix: set.prefix, ff, cost }
    }
  }
  return best
}

export type FarmingRankingResult = {
  target_block: string
  target_block_id: number
  tier: FarmingTierKey
  top_setup: any
}

export async function computeFarmingRanking(tier: FarmingTierKey, blockId: string, tierConfig?: SevenTierConfig): Promise<FarmingRankingResult> {
  const resolvedTierConfig = tierConfig ?? (await loadSevenTierConfig())[tier]
  const { data: block } = await supabase
    .from('pluton_target_blocks')
    .select('*')
    .eq('activity_key', 'farming')
    .eq('block_id', blockId)
    .single()

  if (!block) throw new Error(`pluton_target_blocks introuvable pour farming/${blockId}`)

  const baseDropCount = Number(block.base_drop_count) || 1

  // Prix réel via Bazaar (raw crop only, même doctrine que Mining --
  // "coins_per_hour_raw_block_only" exclut toute chaîne de craft/transformation).
  const { data: bazaarPriceRow } = await supabase
    .from('price_history')
    .select('sell_price, bucket_date')
    .eq('item_id', block.sell_item_id)
    .gt('sell_price', 0)
    .order('bucket_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sellPrice = Number(bazaarPriceRow?.sell_price) || 0

  let farmingFortune = 0
  let cropFortune = 0
  let armorSetPrefix: string | null = null
  let toolLevel = 0
  let realCost = 0
  let pestCoinsPerHour = 0
  let pestName: string | null = null

  if (INVESTMENT_MAX_TIERS.has(tier)) {
    const maxLayer = farmingMaxLayerFor(blockId)
    // Équipement swappé de Blossom Set vers Pesthunter's Set pour maximiser
    // le Bonus Pest Chance -- perte des +330 FF de Blossom (voir doc
    // BONUS_PEST_CHANCE_MAX ci-dessus), compensée très largement par le
    // revenu de Pest Farming.
    farmingFortune = maxLayer.farmingFortune - BLOSSOM_SET_FF
    cropFortune = maxLayer.cropFortune
    armorSetPrefix = 'Helianthus'
    toolLevel = SPECIALIZED_TOOL_MAX_LEVEL
    realCost = resolvedTierConfig.max_gear_cost // plafond du tier, pas un total pièce par pièce (voir doc)

    // Pest Farming (5 août, 3e et 4e passes) -- bonus additif, identique pour
    // toute culture (voir doc PESTS/BONUS_PEST_CHANCE ci-dessus). Taux réel =
    // (cycles de spawn/heure) × (Pests par cycle, via Bonus Pest Chance) +
    // pièges (indépendants, voir TRAPS_PESTS_PER_HOUR). Le meilleur Pest est
    // calculé à la Farming Fortune de base (avant le bonus Pesthunter
    // lui-même, qui ne dépend pas du choix de Pest) puis le bonus Pesthunter
    // Phillip est ajouté à la Fortune totale -- appliqué à END/LATE
    // seulement, même logique que le reste de la couche max investissement.
    const pestsPerHourTotal = PESTS_PER_HOUR * PESTS_PER_SPAWN_EVENT + TRAPS_PESTS_PER_HOUR
    const best = await bestPestKillEV(farmingFortune)
    pestName = best.name
    pestCoinsPerHour = pestsPerHourTotal * best.evPerKill
    farmingFortune += pesthunterSteadyStateFF(pestsPerHourTotal)
  } else if (MID_INVESTMENT_TIERS.has(tier)) {
    const armor = await bestAffordableArmorTier(resolvedTierConfig.max_gear_cost)
    if (armor) { armorSetPrefix = armor.prefix; farmingFortune += armor.fmf; realCost += armor.cost }
    // Farming skill au niveau objectif du tier (formule réelle +4/niveau).
    farmingFortune += resolvedTierConfig.target * 4
    // Outil spécialisé au même niveau objectif (formule réelle +4/niveau,
    // Crop Fortune crop-spécifique -- voir doc ci-dessus, pas de budget coins
    // possible pour cet item).
    toolLevel = resolvedTierConfig.target
    cropFortune += toolLevel * SPECIALIZED_TOOL_FMF_PER_LEVEL

    // Équipement necklace/cloak/belt/bracelet (Peony/Blossom) + Farming
    // Talisman -- gap réel ferme cette nuit, voir doc ACCESSORY_TIERS.
    // Budget restant après l'armure (même discipline que Mining : chaque
    // couche consomme le budget réel, pas un budget séparé par slot).
    const remainingBudget = resolvedTierConfig.max_gear_cost - (armor?.cost ?? 0)
    const accessorySet = await bestAffordableAccessorySet(remainingBudget)
    if (accessorySet) { farmingFortune += accessorySet.ff; realCost += accessorySet.cost }
    const { data: talismanPriceRow } = await supabase
      .from('price_history_ah_variant_base')
      .select('avg_price')
      .eq('base_item_id', FARMING_TALISMAN_ITEM_ID)
      .gt('avg_price', 0)
      .order('bucket_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const talismanCost = Number(talismanPriceRow?.avg_price) || 0
    if (talismanCost > 0 && talismanCost <= remainingBudget - (accessorySet?.cost ?? 0)) {
      farmingFortune += FARMING_TALISMAN_FF
      realCost += talismanCost
    }

    // Pest Farming -- 🔴 gap réel ferme cette nuit : jamais calculé aux
    // tiers MID alors que l'armure Cropie/Squash/Fermento (déjà utilisée à
    // ces tiers via bestAffordableArmorTier) porte un vrai Bonus Pest
    // Chance non nul (12.5/15/17.5 par pièce respectivement, sourcé wiki
    // audit exhaustivite nuit). Seuls ces 3 tiers ont une valeur BPC
    // reellement sourcee -- Farmhand/Haymaker/Sprout/Tater laisses a 0,
    // jamais invente faute de donnee.
    const armorBpcPerPiece: Record<string, number> = { Cropie: 12.5, Squash: 15, Fermento: 17.5 }
    const bpc = armorSetPrefix ? armorBpcPerPiece[armorSetPrefix] : undefined
    if (bpc) {
      const bpcTotal = bpc * 4
      const pestsPerSpawnEventMid = 1 + Math.floor(bpcTotal / 100) + (bpcTotal % 100) / 100
      const pestsPerHourTotal = PESTS_PER_HOUR * pestsPerSpawnEventMid + TRAPS_PESTS_PER_HOUR
      const best = await bestPestKillEV(farmingFortune)
      pestName = best.name
      pestCoinsPerHour = pestsPerHourTotal * best.evPerKill
      farmingFortune += pesthunterSteadyStateFF(pestsPerHourTotal)
    }
  }
  // starter/amateur : aucune branche -- Garden interdit a ces 2 tiers (meme
  // money_making_tier_key='early' que TIER_CONFIG.early.forbidden), Farming
  // Fortune sans effet hors Garden (wiki "Farming Fortune"), donc top_setup
  // reste null ci-dessous, honnetement non eligible.

  if (EARLY_INVESTMENT_TIERS.has(tier)) {
    return { target_block: block.block_name, target_block_id: block.id, tier, top_setup: null }
  }

  // Rare Crop bonus drops ("Overbloom") -- meme convention additive que Pest
  // Farming ci-dessus, palier binaire MID (2/4 pieces)/MAX (4/4 pieces),
  // voir doc RARE_CROP_BY_CATEGORY.
  let rareCropName: string | null = null
  let rareCropCoinsPerHour = 0
  const rareCropCategory = CROP_TO_RARE_CROP_CATEGORY[blockId]
  if (rareCropCategory && (MID_INVESTMENT_TIERS.has(tier) || INVESTMENT_MAX_TIERS.has(tier))) {
    const rareCrop = RARE_CROP_BY_CATEGORY[rareCropCategory]
    const chancePct = INVESTMENT_MAX_TIERS.has(tier) ? rareCrop.chance4of4Pct : rareCrop.chance2of4Pct
    const { data: rareCropPriceRow } = await supabase
      .from('price_history')
      .select('sell_price, bucket_date')
      .eq('item_id', rareCrop.itemId)
      .gt('sell_price', 0)
      .order('bucket_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const rareCropPrice = Number(rareCropPriceRow?.sell_price) || 0
    rareCropName = rareCrop.itemId
    rareCropCoinsPerHour = ACTIONS_PER_HOUR_FIXED * (chancePct / 100) * rareCropPrice
  }

  const totalFortune = farmingFortune + cropFortune
  const yieldPerHour = ACTIONS_PER_HOUR_FIXED * baseDropCount * (1 + totalFortune / 100)
  // Pest income + Rare Crop income additionnés directement (même convention
  // que le bonus Titanium de Mining sur Mithril Ore -- des revenus
  // secondaires réels qui accompagnent la boucle principale, pas des
  // méthodes concurrentes).
  const coinsPerHourRawBlockOnly = yieldPerHour * sellPrice + pestCoinsPerHour + rareCropCoinsPerHour

  return {
    target_block: block.block_name,
    target_block_id: block.id,
    tier,
    top_setup: {
      armor_set: armorSetPrefix,
      tool_level: toolLevel,
      farming_fortune: farmingFortune,
      crop_fortune: cropFortune,
      total_fortune: totalFortune,
      actions_per_hour: ACTIONS_PER_HOUR_FIXED,
      yield_per_hour: yieldPerHour,
      coins_per_hour_raw_block_only: coinsPerHourRawBlockOnly,
      pest_name: pestName,
      pest_coins_per_hour: pestCoinsPerHour,
      real_cost: realCost,
      sell_item_id: block.sell_item_id,
      sell_price: sellPrice,
    },
  }
}

export type PersistedFarmingResult = {
  tier: FarmingTierKey
  block_id: string
  target_block: string
  has_setup: boolean
  coins_per_hour_raw_block_only: number | null
}

export async function computeAndPersistAllFarmingRankings(): Promise<PersistedFarmingResult[]> {
  const out: PersistedFarmingResult[] = []

  const { data: blocks } = await supabase
    .from('pluton_target_blocks')
    .select('block_id')
    .eq('activity_key', 'farming')
  const blockIds = (blocks || []).map(b => b.block_id)

  await supabase.from('pluton_rankings').delete().eq('activity_key', 'farming')
  await supabase.from('pluton_setups').delete().eq('activity_key', 'farming')

  const sevenTierConfig = await loadSevenTierConfig()
  for (const tier of ALL_FARMING_TIER_KEYS) {
    for (const blockId of blockIds) {
      const result = await computeFarmingRanking(tier, blockId, sevenTierConfig[tier])

      if (!result.top_setup) {
        out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: false, coins_per_hour_raw_block_only: null })
        continue
      }

      const s = result.top_setup
      const { data: setupRow, error: setupErr } = await supabase
        .from('pluton_setups')
        .insert({
          activity_key: 'farming',
          tier,
          investment_level: 'optimal',
          armor_set_prefix: s.armor_set,
          tool_item_id: s.tool_level > 0 ? `LEVEL_${s.tool_level}` : null,
          total_mining_speed: Math.round(ACTIONS_PER_HOUR_FIXED / 3600), // 20, plafond moteur -- pas un stat de gear pour Farming
          total_mining_fortune: Math.round(s.total_fortune),
          total_breaking_power: 0,
          real_cost: s.real_cost,
          pet_id: INVESTMENT_MAX_TIERS.has(tier) ? 'ROSE_DRAGON' : null,
          pet_rarity: INVESTMENT_MAX_TIERS.has(tier) ? 'LEGENDARY' : null,
          accessories: [],
        })
        .select('id')
        .single()
      if (setupErr || !setupRow) throw new Error(`pluton_setups insert failed for ${tier}/${blockId}: ${setupErr?.message}`)

      const { error: rankErr } = await supabase
        .from('pluton_rankings')
        .insert({
          activity_key: 'farming',
          tier,
          target_block_id: result.target_block_id,
          setup_id: setupRow.id,
          rank: 1,
          mining_time_seconds: 1 / CROPS_PER_SECOND_ENGINE_CAP,
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

// ============================================================
// Composter (26 aout) -- Phase B du plan "pipeline finale v3", methode
// additive independante (target_block COMPOSTER dedie, meme discipline
// multi-methodes que Forge/Ruby Veilshroom) -- PAS un rendement Sweep/
// Fortune, c'est une marge crafting_margin (achat Organic Matter+Machine
// Fuel au Bazaar, vente du Compost produit), meme famille que Forge.
//
// Cadence de base sourcee wiki "Composter" : 1 Compost produit toutes les
// 10 minutes, consommant 4000 Organic Matter + 2000 Machine Fuel par
// Compost ("Items cannot be taken out of the Composter once inserted").
//
// Cout reel : moins cher candidat de la table "Compost/Organic Matter
// Table" (deja en base, pluton_elements) pour l'Organic Matter -- Box of
// Seeds domine (0.157 Box of Seeds = 4000 OM, ~12 146 coins/4000 OM au
// prix Bazaar buy_price courant) -- et de la table "Machine Fuel" (colonne
// Composter=Yes, sourcee live wiki le 26 aout, l'extraction pluton_elements
// ayant perdu cette colonne -- corruption confirmee, meme classe que les
// bugs d'extraction deja documentes) pour le Machine Fuel -- Oil Barrel
// domine (10 000 fuel/item, ~792.50 coins/2000 fuel au prix Bazaar
// courant).
//
// Composter Speed (+20% production/tier d'upgrade Copper, jusqu'a +500%
// au tier 25 max) et Cost Reduction (-1% consommation/tier, jusqu'a -25%
// max) sources de la table d'upgrades Composter (Copper 100->4000,
// wiki confirme). Interpole proportionnellement sur les 7 tiers Pluton --
// MEME schema exact que SHARPNESS_PCT_BY_TIER/SMITE_PCT_BY_TIER (23 aout,
// lib/pluton-engine.ts) : 0% a starter (aucun Copper investi), ratios
// [0, 0.2, 0.4, 0.6, 0.8, 1, 1] du maximum reel -- rien invente au-dela de
// cette distribution deja retenue par le projet, seules les 2 vraies
// ancres (0% et le maximum sourcee) sont reelles, la granularite
// intermediaire est une interpolation lineaire documentee.
const COMPOSTER_CYCLE_MINUTES = 10
const COMPOSTER_OM_PER_COMPOST = 4000
const COMPOSTER_FUEL_PER_COMPOST = 2000
const COMPOSTER_SPEED_PCT_MAX = 500
const COMPOSTER_COST_REDUCTION_PCT_MAX = 25
const COMPOSTER_TIER_FRACTION: Record<SevenTier, number> = {
  starter: 0, amateur: 0.2, intermediate: 0.4, skilled: 0.6, expert: 0.8, professional: 1, master: 1,
}
// Moins cher candidat sourcee (26 aout) -- Compost/Organic Matter Table.
const COMPOSTER_CHEAPEST_OM_ITEM_ID = 'BOX_OF_SEEDS'
const COMPOSTER_CHEAPEST_OM_AMOUNT_PER_4000 = 0.157
// Moins cher candidat sourcee (26 aout, colonne Composter=Yes, table
// Machine Fuel live wiki -- extraction pluton_elements corrompue sur
// cette colonne, verifiee en direct).
const COMPOSTER_CHEAPEST_FUEL_ITEM_ID = 'OIL_BARREL'
const COMPOSTER_CHEAPEST_FUEL_AMOUNT = 10000

export async function computeAndPersistComposterRanking(): Promise<{ tiers: number; coins_per_hour_master: number }> {
  const { data: block } = await supabase
    .from('pluton_target_blocks').select('id, effective_sell_price').eq('activity_key', 'farming').eq('block_id', 'COMPOSTER').single()
  if (!block) throw new Error('COMPOSTER target block not found')

  const compostSellPrice = Number(block.effective_sell_price) || 0

  const { data: prices } = await supabase
    .from('price_history')
    .select('item_id, buy_price')
    .in('item_id', [COMPOSTER_CHEAPEST_OM_ITEM_ID, COMPOSTER_CHEAPEST_FUEL_ITEM_ID])
    .order('bucket_date', { ascending: false })
  const priceByItem = new Map<string, number>()
  for (const p of (prices || [])) {
    if (!priceByItem.has(p.item_id)) priceByItem.set(p.item_id, Number(p.buy_price) || 0)
  }
  const omUnitPrice = priceByItem.get(COMPOSTER_CHEAPEST_OM_ITEM_ID) || 0
  const fuelUnitPrice = priceByItem.get(COMPOSTER_CHEAPEST_FUEL_ITEM_ID) || 0

  const omCostFor4000 = COMPOSTER_CHEAPEST_OM_AMOUNT_PER_4000 * omUnitPrice
  const fuelCostFor2000 = (fuelUnitPrice / COMPOSTER_CHEAPEST_FUEL_AMOUNT) * COMPOSTER_FUEL_PER_COMPOST
  const baseCostPerCompost = omCostFor4000 + fuelCostFor2000

  await supabase.from('pluton_rankings').delete().eq('target_block_id', block.id)
  const staleSetups = await supabase.from('pluton_setups').select('id').eq('activity_key', 'farming').contains('accessories', [{ source_id: '__composter_method__' }])
  const staleIds = (staleSetups.data || []).map(s => s.id)
  if (staleIds.length > 0) await supabase.from('pluton_setups').delete().in('id', staleIds)

  let coinsPerHourMaster = 0
  for (const tier of ALL_FARMING_TIER_KEYS) {
    const frac = COMPOSTER_TIER_FRACTION[tier]
    const speedPct = COMPOSTER_SPEED_PCT_MAX * frac
    const costReductionPct = COMPOSTER_COST_REDUCTION_PCT_MAX * frac

    const compostsPerHour = (60 / COMPOSTER_CYCLE_MINUTES) * (1 + speedPct / 100)
    const costPerCompost = baseCostPerCompost * (1 - costReductionPct / 100)
    const marginPerCompost = compostSellPrice - costPerCompost
    const coinsPerHour = marginPerCompost * compostsPerHour
    if (tier === 'master') coinsPerHourMaster = coinsPerHour

    const { data: setupRow, error: setupErr } = await supabase
      .from('pluton_setups')
      .insert({
        activity_key: 'farming',
        tier,
        investment_level: 'optimal',
        armor_set_prefix: `Aucune (Composter -- Speed +${speedPct.toFixed(0)}%, Cost Reduction -${costReductionPct.toFixed(1)}%)`,
        tool_item_id: 'COMPOSTER_NO_TOOL',
        total_mining_speed: 0,
        total_mining_fortune: 0,
        total_breaking_power: 0,
        real_cost: costPerCompost,
        accessories: [{ source_id: '__composter_method__', speed_pct: speedPct, cost_reduction_pct: costReductionPct }],
      })
      .select('id').single()
    if (setupErr || !setupRow) throw new Error(`Composter setup insert failed for ${tier}: ${setupErr?.message}`)

    const { error: rankErr } = await supabase
      .from('pluton_rankings')
      .insert({
        activity_key: 'farming',
        tier,
        target_block_id: block.id,
        setup_id: setupRow.id,
        rank: 1,
        mining_time_seconds: 3600 / compostsPerHour,
        actions_per_hour: compostsPerHour,
        yield_per_hour: compostsPerHour,
        coins_per_hour_raw_block_only: coinsPerHour,
      })
    if (rankErr) throw new Error(`Composter ranking insert failed for ${tier}: ${rankErr.message}`)
  }

  return { tiers: ALL_FARMING_TIER_KEYS.length, coins_per_hour_master: coinsPerHourMaster }
}
