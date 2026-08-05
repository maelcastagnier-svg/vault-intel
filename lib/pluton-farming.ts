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
import { TIER_CONFIG, type TierKey } from './money-making-constants'

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

// 'early' inclus dans le type (un vrai tier du jeu) mais toujours non éligible
// en pratique -- voir doc plus bas (Garden interdit à ce tier).
export const FARMING_TIER_KEYS = ['mid', 'end', 'late'] as const
export const ALL_FARMING_TIER_KEYS = ['early', 'mid', 'end', 'late'] as const
export type FarmingTierKey = (typeof ALL_FARMING_TIER_KEYS)[number]

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
const FARMING_FORTUNE_MAX_PERMANENT = 2012.7
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
// Fever, 0.001%/niveau) ou une ressource à farmer activement (Pesthunter
// Phillip turn-in) plutôt qu'un vrai buff à entretenir passivement comme le
// Refined Dark Cacao Truffle/Rosewater Flask déjà comptés ci-dessus (ceux-là
// SONT inclus car leur effet permanent, +5 chacun après 5x consommés, est
// explicitement listé dans "Permanent & Unchangeable" par le wiki lui-même,
// distinct de leur buff temporaire 60 min qui lui n'est pas compté).
// Documenté ici comme gap honnête, pas oublié : jusqu'à +976.5 FF
// supplémentaires existent en jeu mais nécessitent un contexte non-continu.

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

export type FarmingRankingResult = {
  target_block: string
  target_block_id: number
  tier: FarmingTierKey
  top_setup: any
}

export async function computeFarmingRanking(tier: FarmingTierKey, blockId: string): Promise<FarmingRankingResult> {
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

  if (tier === 'end' || tier === 'late') {
    const maxLayer = farmingMaxLayerFor(blockId)
    farmingFortune = maxLayer.farmingFortune
    cropFortune = maxLayer.cropFortune
    armorSetPrefix = 'Helianthus'
    toolLevel = SPECIALIZED_TOOL_MAX_LEVEL
    realCost = TIER_CONFIG[tier].max_gear_cost // plafond du tier, pas un total pièce par pièce (voir doc)
  } else if (tier === 'mid') {
    const cfg = TIER_CONFIG.mid
    const armor = await bestAffordableArmorTier(cfg.max_gear_cost)
    if (armor) { armorSetPrefix = armor.prefix; farmingFortune += armor.fmf; realCost += armor.cost }
    // Farming skill au niveau objectif du tier (formule réelle +4/niveau).
    farmingFortune += cfg.target * 4
    // Outil spécialisé au même niveau objectif (formule réelle +4/niveau,
    // Crop Fortune crop-spécifique -- voir doc ci-dessus, pas de budget coins
    // possible pour cet item).
    toolLevel = cfg.target
    cropFortune += toolLevel * SPECIALIZED_TOOL_FMF_PER_LEVEL
  }
  // early : aucune branche -- Garden interdit à ce tier (TIER_CONFIG.early.forbidden),
  // Farming Fortune sans effet hors Garden (wiki "Farming Fortune"), donc
  // top_setup reste null ci-dessous, honnêtement non éligible.

  if (tier === 'early') {
    return { target_block: block.block_name, target_block_id: block.id, tier, top_setup: null }
  }

  const totalFortune = farmingFortune + cropFortune
  const yieldPerHour = ACTIONS_PER_HOUR_FIXED * baseDropCount * (1 + totalFortune / 100)
  const coinsPerHourRawBlockOnly = yieldPerHour * sellPrice

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

  for (const tier of ALL_FARMING_TIER_KEYS) {
    for (const blockId of blockIds) {
      const result = await computeFarmingRanking(tier, blockId)

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
          pet_id: (tier === 'end' || tier === 'late') ? 'ROSE_DRAGON' : null,
          pet_rarity: (tier === 'end' || tier === 'late') ? 'LEGENDARY' : null,
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
