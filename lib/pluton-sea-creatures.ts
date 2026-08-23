// lib/pluton-sea-creatures.ts
// Pluton Sea Creature kills (21 aout) -- ferme le gap documente depuis la
// construction de Fishing (17 aout) : "tuer un Sea Creature necessite un
// modele de combat qui n'existe pas encore -- c'est precisement le sujet de
// la prochaine activite (Slayer/Combat)". Le moteur DPS/TTK existe
// desormais (lib/pluton-slayer.ts). Construit comme METHODE ADDITIVE
// DISTINCTE (target_blocks 'WATER_POOL_SEA_CREATURES*', activity_key=
// 'fishing') plutot que de modifier lib/pluton-fishing.ts en place -- meme
// discipline "multi-methodes" que Dungeons (Floor I clear complet vs frag
// run), evite tout risque de regression sur le calcul WATER_POOL deja
// valide en prod.
//
// Gear de combat = reutilise directement la progression Zombie Slayer deja
// sourcee (Undead Sword->Revenant Falchion->Reaper Falchion+Reaper Armor,
// meme formule de degats -- voir lib/pluton-slayer.ts pour la doc complete
// de la formule). Choix justifie : plusieurs Sea Creatures (toutes pools
// confondues) sont de mob_type Undead -- la ligne Zombie Slayer donne donc
// un vrai bonus Multiplicative sur ces cibles specifiquement, pas un choix
// arbitraire.
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
//
// ============================================================
// Extension aux 10 pools restantes (23 aout, audit d'exhaustivite explicite
// de l'utilisateur -- "rien laisse au hasard, rien de cote"). Seule la pool
// 'basic' (10 creatures) etait couverte avant ce jour ; `sea_creature_pools`
// en base porte 10 AUTRES pools reelles (bayou/crimson_isle/hotspot/lotus/
// moonglade_marsh/shark/special/spooky/torrhus_canyon/winter, 80 lignes,
// 74 noms uniques) jamais exploitees. Sourcees via un agent de recherche
// dedie (lecture seule, pages wiki individuelles par creature, PV/mob_type/
// table de loot -- jamais devine). Chaque pool devient son propre
// target_block (`WATER_POOL_SEA_CREATURES_<POOL>`), meme moteur DPS/TTK
// reutilise tel quel.
//
// **3 creatures exclues, documentees, pas oubliees** -- mecanique
// incompatible avec le modele HP/DPS standard de ce fichier (pas un simple
// palier de degats) :
// - Puddle Jumper (lotus) : capture par mini-jeu de "hooks" successifs, pas
//   un combat DPS/TTK classique (PV=5 n'est pas une vraie barre de vie).
// - Reindrake (winter) : "2500 Hits" -- chaque coup retire 1 unite peu
//   importe les degats, un DPS eleve n'accelere donc rien (seule la vitesse
//   d'attaque compte) -- formule non compatible avec computeCombatDps().
// - Grinch (winter) : meme mecanique "3 Hits".
// **3 creatures a poids nul exclues** (`sea_creature_pools.base_weight IS
// NULL` -- Agarimoo/Carrot King/Plhlegblast du pool 'special') : spawn
// conditionnel (ex: Agarimoo necessite un Chumcap Bucket pose), aucune
// probabilite d'apparition naturelle sourcee -- inclure avec un poids
// invente violerait la regle #7, exclues plutot que forcees.
// **Simplifications documentees, pas cachees** : Nessie (2 phases +
// teleportation) et Wiki Tiki (invulnerabilite conditionnelle) utilisent
// leur PV brut source avec le modele HP/DPS naif -- sous-estiment
// probablement le vrai TTK (mecanique de reduction de degats/esquive non
// modelisee). Stridersurfer (PV de la variante SC niveau 21, seule valeur
// sourcee) et Tadgang (PV de la forme finale post-evolution "Liltad")
// utilisent la meilleure valeur disponible, ambiguite documentee.
// **4 pools conditionnees a un evenement/objet, INCLUSES avec label
// explicite** (pas exclues -- exhaustivite mandatee) : shark (Fishing
// Festival), spooky (Spooky Festival), winter (Jerry's Workshop), special
// (necessite un Chumcap Bucket pose pour Agarimoo specifiquement, le reste
// de la pool est standard) -- `event_gated` sur le resultat, coins/h a lire
// comme "pendant que l'evenement/le bucket est actif", pas une moyenne
// annualisee (aucun taux de frequence source, jamais invente).
import { createClient } from '@supabase/supabase-js'
import {
  loadPriceCache, expectedValueFromLootTable, type WeightedLootRow,
  computeCombatDps, fetchReforges, pickBestReforge, recombobulatedRarity, JASPER_PERFECT_BY_RARITY, ART_OF_WAR_STRENGTH, WITHER_FORBIDDEN_STRENGTH_MAX,
} from './pluton-engine'
import type { TierKey } from './money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const SEA_CREATURE_TIER_KEYS: TierKey[] = ['early', 'mid', 'end', 'late']

// Gear Zombie Slayer reutilise (meme mapping que GEAR_BY_SLAYER_TIER dans
// pluton-slayer.ts pour la ligne 'zombie').
const COMBAT_GEAR_BY_TIER: Record<TierKey, { weaponId: string; armorPrefix: string | null }> = {
  early: { weaponId: 'UNDEAD_SWORD', armorPrefix: null },
  mid: { weaponId: 'REVENANT_SWORD', armorPrefix: 'REVENANT' },
  end: { weaponId: 'REAPER_SWORD', armorPrefix: 'REAPER' },
  late: { weaponId: 'REAPER_SWORD', armorPrefix: 'REAPER' },
}

// Couche NBT (22 aout, "aucune activite Combat laissee de cote") -- l'ancien
// computeDps() local (duplication delibree de la formule de base, doc
// d'origine) n'appliquait AUCUNE des couches NBT desormais construites pour
// Slayer/Bestiary (Sharpness/Smite/Critical/reforge/recombobulator/gemmes/
// Art of War/Potato Books). Remplace par computeCombatDps() du moteur
// partage (deja etendu avec tous les parametres necessaires), memes
// constantes/valeurs deja sourcees et verifiees pour Zombie.
const SHARPNESS_PCT_BY_TIER: Record<TierKey, number> = { early: 15, mid: 30, end: 50, late: 50 }
const SMITE_PCT_BY_TIER: Record<TierKey, number> = { early: 15, mid: 30, end: 50, late: 50 }
const CRITICAL_PCT_BY_TIER: Record<TierKey, number> = { early: 30, mid: 50, end: 100, late: 100 }
const POTATO_BOOK_USES_BY_TIER: Record<TierKey, number> = { early: 5, mid: 10, end: 15, late: 15 }
const POTATO_BOOK_BONUS_PER_USE = 2
const WEAPON_RARITY: Record<string, string> = { UNDEAD_SWORD: 'COMMON', REVENANT_SWORD: 'RARE', REAPER_SWORD: 'EPIC' }
const ARMOR_RARITY: Record<string, string> = { REVENANT: 'EPIC', REAPER: 'LEGENDARY' }
const GEMSTONE_JASPER_SLOTS: Record<string, number> = { REAPER_SWORD: 1 }
const GEMSTONE_JASPER_SLOTS_ARMOR: Record<string, number> = { REAPER: 1 }

type NbtDps = { dpsVsUndead: number; dpsVsOther: number }
async function computeEnrichedDps(tier: TierKey, weapon: any, armor: any): Promise<NbtDps> {
  const gear = COMBAT_GEAR_BY_TIER[tier]
  const baseStrength = Number(weapon.base_strength) + (armor ? Number(armor.set_strength) : 0)
  const weaponMobTypeMult = 1 + Number(weapon.mob_type_damage_bonus_pct) / 100
  const armorMobTypeMult = armor ? 1 + Number(armor.mob_type_damage_bonus_pct) / 100 : 1

  const sharpnessPct = SHARPNESS_PCT_BY_TIER[tier]
  const criticalPct = CRITICAL_PCT_BY_TIER[tier]
  const potatoFlat = POTATO_BOOK_USES_BY_TIER[tier] * POTATO_BOOK_BONUS_PER_USE

  const weaponRarity = WEAPON_RARITY[gear.weaponId]
  const weaponRecombRarity = weaponRarity ? recombobulatedRarity(weaponRarity) : undefined
  const armorRarity = gear.armorPrefix ? ARMOR_RARITY[gear.armorPrefix] : undefined
  const armorRecombRarity = armorRarity ? recombobulatedRarity(armorRarity) : undefined

  let gemstoneStrength = 0
  if (GEMSTONE_JASPER_SLOTS[gear.weaponId] && weaponRecombRarity) gemstoneStrength += GEMSTONE_JASPER_SLOTS[gear.weaponId] * JASPER_PERFECT_BY_RARITY[weaponRecombRarity]
  if (gear.armorPrefix && GEMSTONE_JASPER_SLOTS_ARMOR[gear.armorPrefix] && armorRecombRarity) gemstoneStrength += GEMSTONE_JASPER_SLOTS_ARMOR[gear.armorPrefix] * JASPER_PERFECT_BY_RARITY[armorRecombRarity]

  const strengthBeforeReforge = baseStrength + gemstoneStrength + potatoFlat + ART_OF_WAR_STRENGTH + WITHER_FORBIDDEN_STRENGTH_MAX
  const baseDamage = Number(weapon.base_damage) + potatoFlat

  async function bestDps(smitePct: number, mults: number[]): Promise<number> {
    const additivePct = sharpnessPct + smitePct
    const scoreWeapon = (d: { strength: number; crit_chance: number; crit_damage: number; bonus_attack_speed: number }) =>
      computeCombatDps(baseDamage, strengthBeforeReforge + d.strength, mults, additivePct, criticalPct + d.crit_damage, d.crit_chance, d.bonus_attack_speed)
    const weaponReforges = weaponRecombRarity ? await fetchReforges('SWORD/ROD', weaponRecombRarity) : []
    const bestWeaponReforge = pickBestReforge(weaponReforges, 1, scoreWeapon)

    let armorDelta = { strength: 0, crit_chance: 0, crit_damage: 0, bonus_attack_speed: 0 }
    if (armorRecombRarity) {
      const armorReforges = await fetchReforges('ARMOR', armorRecombRarity)
      const wStrength = strengthBeforeReforge + (bestWeaponReforge?.delta.strength || 0)
      const wCC = bestWeaponReforge?.delta.crit_chance || 0
      const wCD = criticalPct + (bestWeaponReforge?.delta.crit_damage || 0)
      const wAS = bestWeaponReforge?.delta.bonus_attack_speed || 0
      const scoreArmor = (d: { strength: number; crit_chance: number; crit_damage: number; bonus_attack_speed: number }) =>
        computeCombatDps(baseDamage, wStrength + d.strength, mults, additivePct, wCD + d.crit_damage, wCC + d.crit_chance, wAS + d.bonus_attack_speed)
      const best = pickBestReforge(armorReforges, 4, scoreArmor)
      if (best) armorDelta = best.delta
    }

    const finalStrength = strengthBeforeReforge + (bestWeaponReforge?.delta.strength || 0) + armorDelta.strength
    const finalCC = (bestWeaponReforge?.delta.crit_chance || 0) + armorDelta.crit_chance
    const finalCD = criticalPct + (bestWeaponReforge?.delta.crit_damage || 0) + armorDelta.crit_damage
    const finalAS = (bestWeaponReforge?.delta.bonus_attack_speed || 0) + armorDelta.bonus_attack_speed
    return computeCombatDps(baseDamage, finalStrength, mults, additivePct, finalCD, finalCC, finalAS)
  }

  const dpsVsUndead = await bestDps(SMITE_PCT_BY_TIER[tier], [weaponMobTypeMult, armorMobTypeMult])
  const dpsVsOther = await bestDps(0, [])
  return { dpsVsUndead, dpsVsOther }
}

type Creature = {
  name: string
  hp: number
  isUndead: boolean
  weight: number
  loot: WeightedLootRow[]
}

type Pool = {
  blockId: string
  blockName: string
  eventGated: string | null // null = toujours accessible, sinon libelle de la condition
  creatures: Creature[]
}

// Poids reels deja en base (sea_creature_pools) -- repetes ici pour eviter
// une jointure supplementaire, valeurs identiques verifiees.
const POOLS: Record<string, Pool> = {
  basic: {
    blockId: 'WATER_POOL_SEA_CREATURES',
    blockName: 'Water Pool -- Sea Creature kills (pool basic)',
    eventGated: null,
    creatures: [
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
    ],
  },
  bayou: {
    blockId: 'WATER_POOL_SEA_CREATURES_BAYOU',
    blockName: 'Water Pool -- Sea Creature kills (pool Backwater Bayou)',
    eventGated: null,
    creatures: [
      { name: 'Trash Gobbler', hp: 2000, isUndead: false, weight: 5000, loot: [
        { entry_item_id: 'WATER_LILY', entry_qty: 1.5, chance_pct: 100 },
      ]},
      { name: 'Dumpster Diver', hp: 2500, isUndead: false, weight: 2875, loot: [
        { entry_item_id: 'WATER_LILY', entry_qty: 3, chance_pct: 100 },
      ]},
      { name: 'Banshee', hp: 17500, isUndead: false, weight: 1500, loot: [
        { entry_item_id: 'WATER_LILY', entry_qty: 12, chance_pct: 100 },
      ]},
      { name: 'Bayou Sludge', hp: 20000, isUndead: false, weight: 500, loot: [
        { entry_item_id: 'WATER_LILY', entry_qty: 24, chance_pct: 100 },
        { entry_item_id: 'SLIME_BALL', entry_qty: 24, chance_pct: 100 },
      ]},
      { name: 'Alligator', hp: 600000, isUndead: false, weight: 100, loot: [
        { entry_item_id: 'ENCHANTED_WATER_LILY', entry_qty: 3, chance_pct: 100 },
        { entry_item_id: 'ALLIGATOR_SKIN', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'Titanoboa', hp: 45000000, isUndead: false, weight: 25, loot: [
        { entry_item_id: 'ENCHANTED_WATER_LILY', entry_qty: 3, chance_pct: 100 },
      ]},
    ],
  },
  crimson_isle: {
    blockId: 'WATER_POOL_SEA_CREATURES_CRIMSON_ISLE',
    blockName: 'Water Pool -- Sea Creature kills (pool Crimson Isle)',
    eventGated: null,
    creatures: [
      { name: 'Fried Chicken', hp: 65000, isUndead: false, weight: 5000, loot: [
        { entry_item_id: 'MAGMA_FISH', entry_qty: 1.5, chance_pct: 100 },
      ]},
      { name: 'Volcanic Snail', hp: 100000, isUndead: false, weight: 2875, loot: [
        { entry_item_id: 'MAGMA_FISH', entry_qty: 3, chance_pct: 100 },
      ]},
      { name: 'Magma Slug', hp: 500000, isUndead: false, weight: 1600, loot: [
        { entry_item_id: 'MAGMA_FISH', entry_qty: 5, chance_pct: 100 },
        { entry_item_id: 'LUMP_OF_MAGMA', entry_qty: 1.5, chance_pct: 100 },
      ]},
      { name: 'Moogma', hp: 750000, isUndead: false, weight: 1200, loot: [
        { entry_item_id: 'MAGMA_FISH', entry_qty: 8, chance_pct: 100 },
        { entry_item_id: 'MOOGMA_PELT', entry_qty: 1.5, chance_pct: 100 },
      ]},
      { name: 'Fireproof Witch', hp: 75000, isUndead: false, weight: 1500, loot: [
        { entry_item_id: 'MAGMA_FISH', entry_qty: 12, chance_pct: 100 },
      ]},
      { name: 'Pyroclastic Worm', hp: 1200000, isUndead: false, weight: 400, loot: [
        { entry_item_id: 'MAGMA_FISH', entry_qty: 10, chance_pct: 100 },
        { entry_item_id: 'PYROCLASTIC_SCALE', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'Lava Leech', hp: 1000000, isUndead: false, weight: 600, loot: [
        { entry_item_id: 'MAGMA_FISH', entry_qty: 20, chance_pct: 100 },
        { entry_item_id: 'CUP_OF_BLOOD', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'Lava Flame', hp: 1500000, isUndead: false, weight: 360, loot: [
        { entry_item_id: 'MAGMA_FISH', entry_qty: 40, chance_pct: 100 },
        { entry_item_id: 'FLAMING_HEART', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'Fire Eel', hp: 2000000, isUndead: false, weight: 280, loot: [
        { entry_item_id: 'MAGMA_FISH', entry_qty: 50, chance_pct: 100 },
        { entry_item_id: 'ORB_OF_ENERGY', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'Magma Pillar', hp: 1250000, isUndead: false, weight: 500, loot: [
        { entry_item_id: 'MAGMA_FISH_SILVER', entry_qty: 3, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_MAGMA_CREAM', entry_qty: 3, chance_pct: 100 },
      ]},
      { name: 'Taurus', hp: 3000000, isUndead: false, weight: 160, loot: [
        { entry_item_id: 'HORN_OF_TAURUS', entry_qty: 1, chance_pct: 100 },
        { entry_item_id: 'MAGMA_FISH_SILVER', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'Thunder', hp: 35000000, isUndead: false, weight: 40, loot: [
        { entry_item_id: 'THUNDER_SHARDS', entry_qty: 1, chance_pct: 100 },
        { entry_item_id: 'MAGMA_FISH_SILVER', entry_qty: 12, chance_pct: 100 },
      ]},
      { name: 'Fiery Scuttler', hp: 10000000, isUndead: false, weight: 100, loot: [
        { entry_item_id: 'MAGMA_FISH_SILVER', entry_qty: 12, chance_pct: 100 },
      ]},
      { name: 'Ragnarok', hp: 125000000, isUndead: false, weight: 25, loot: [
        { entry_item_id: 'MAGMA_FISH_SILVER', entry_qty: 24, chance_pct: 100 },
      ]},
      { name: 'Lord Jawbus', hp: 100000000, isUndead: false, weight: 8, loot: [
        { entry_item_id: 'MAGMA_LORD_FRAGMENT', entry_qty: 1, chance_pct: 100 },
        { entry_item_id: 'MAGMA_FISH_SILVER', entry_qty: 24, chance_pct: 100 },
      ]},
    ],
  },
  hotspot: {
    blockId: 'WATER_POOL_SEA_CREATURES_HOTSPOT',
    blockName: 'Water Pool -- Sea Creature kills (pool Hotspot)',
    eventGated: null,
    creatures: [
      { name: 'Frog Man', hp: 2500, isUndead: false, weight: 5000, loot: [
        { entry_item_id: 'HALF_EATEN_MUSHROOM', entry_qty: 1, chance_pct: 100 },
        { entry_item_id: 'CLAY_BALL', entry_qty: 1.5, chance_pct: 100 },
      ]},
      { name: 'Fried Chicken', hp: 65000, isUndead: false, weight: 5000, loot: [
        { entry_item_id: 'MAGMA_FISH', entry_qty: 1.5, chance_pct: 100 },
      ]},
      { name: 'Inkling', hp: 6500, isUndead: false, weight: 2875, loot: [
        { entry_item_id: 'CLAY_BALL', entry_qty: 3, chance_pct: 100 },
        { entry_item_id: 'INK_SACK', entry_qty: 3, chance_pct: 100 },
      ]},
      { name: 'Volcanic Snail', hp: 100000, isUndead: false, weight: 2875, loot: [
        { entry_item_id: 'MAGMA_FISH', entry_qty: 3, chance_pct: 100 },
      ]},
      { name: 'Snapping Turtle', hp: 35000, isUndead: false, weight: 1500, loot: [
        { entry_item_id: 'CLAY_BALL', entry_qty: 12, chance_pct: 100 },
      ]},
      { name: 'Fireproof Witch', hp: 75000, isUndead: false, weight: 1500, loot: [
        { entry_item_id: 'MAGMA_FISH', entry_qty: 12, chance_pct: 100 },
      ]},
      { name: 'Manta Ray', hp: 500000, isUndead: false, weight: 500, loot: [
        { entry_item_id: 'CLAY_BALL', entry_qty: 24, chance_pct: 100 },
      ]},
      { name: 'Magma Pillar', hp: 1250000, isUndead: false, weight: 500, loot: [
        { entry_item_id: 'MAGMA_FISH_SILVER', entry_qty: 3, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_MAGMA_CREAM', entry_qty: 3, chance_pct: 100 },
      ]},
      { name: 'Fiery Scuttler', hp: 10000000, isUndead: false, weight: 100, loot: [
        { entry_item_id: 'MAGMA_FISH_SILVER', entry_qty: 12, chance_pct: 100 },
      ]},
      { name: 'Blue Ringed Octopus', hp: 4000000, isUndead: false, weight: 100, loot: [
        { entry_item_id: 'ENCHANTED_CLAY_BALL', entry_qty: 1, chance_pct: 100 },
        { entry_item_id: 'BLUE_RING', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'Ragnarok', hp: 125000000, isUndead: false, weight: 25, loot: [
        { entry_item_id: 'MAGMA_FISH_SILVER', entry_qty: 24, chance_pct: 100 },
      ]},
      { name: 'Wiki Tiki', hp: 75000000, isUndead: false, weight: 25, loot: [
        { entry_item_id: 'ENCHANTED_CLAY_BALL', entry_qty: 12, chance_pct: 100 },
      ]},
    ],
  },
  lotus: {
    blockId: 'WATER_POOL_SEA_CREATURES_LOTUS',
    blockName: 'Water Pool -- Sea Creature kills (pool Lotus Atoll)',
    eventGated: null,
    creatures: [
      { name: 'Atoll Croaker', hp: 15000, isUndead: false, weight: 5000, loot: [
        { entry_item_id: 'LOTUS', entry_qty: 3, chance_pct: 100 },
      ]},
      { name: 'Lotus Guardian', hp: 25000, isUndead: false, weight: 2875, loot: [
        { entry_item_id: 'LOTUS', entry_qty: 3, chance_pct: 100 },
      ]},
      { name: 'gorF', hp: 40000, isUndead: false, weight: 1500, loot: [
        { entry_item_id: 'LOTUS', entry_qty: 3, chance_pct: 100 },
      ]},
      { name: 'Drowned Captain', hp: 60000, isUndead: true, weight: 500, loot: [
        { entry_item_id: 'LOTUS', entry_qty: 3, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_GOLD', entry_qty: 1.5, chance_pct: 100 },
      ]},
      { name: 'Frog Prince', hp: 10000000, isUndead: false, weight: 25, loot: [
        { entry_item_id: 'LOTUS_SILVER', entry_qty: 4, chance_pct: 100 },
      ]},
    ],
  },
  moonglade_marsh: {
    blockId: 'WATER_POOL_SEA_CREATURES_MOONGLADE_MARSH',
    blockName: 'Water Pool -- Sea Creature kills (pool Moonglade Marsh)',
    eventGated: null,
    creatures: [
      { name: 'Bogged', hp: 3000, isUndead: false, weight: 5000, loot: [
        { entry_item_id: 'SEA_LUMIES', entry_qty: 1.5, chance_pct: 100 },
        { entry_item_id: 'MANGROVE_LOG', entry_qty: 12, chance_pct: 100 },
      ]},
      { name: 'Wetwing', hp: 8000, isUndead: true, weight: 2875, loot: [
        { entry_item_id: 'SEA_LUMIES', entry_qty: 2, chance_pct: 100 },
        { entry_item_id: 'MANGROVE_LOG', entry_qty: 16, chance_pct: 100 },
      ]},
      { name: 'Tadgang', hp: 5000, isUndead: false, weight: 1500, loot: [
        { entry_item_id: 'SEA_LUMIES', entry_qty: 6, chance_pct: 100 },
        { entry_item_id: 'MANGROVE_LOG', entry_qty: 48, chance_pct: 100 },
      ]},
      { name: 'Ent', hp: 25000, isUndead: false, weight: 1500, loot: [
        { entry_item_id: 'SEA_LUMIES', entry_qty: 12, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_MANGROVE_LOG', entry_qty: 2, chance_pct: 100 },
      ]},
      { name: 'Stridersurfer', hp: 20000, isUndead: false, weight: 200, loot: [
        { entry_item_id: 'GILL_MEMBRANE', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'The Loch Emperor', hp: 800000, isUndead: false, weight: 100, loot: [
        { entry_item_id: 'SEA_LUMIES', entry_qty: 48, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_MANGROVE_LOG', entry_qty: 12, chance_pct: 100 },
      ]},
      { name: 'Nessie', hp: 2000000, isUndead: false, weight: 25, loot: [
        { entry_item_id: 'ENCHANTED_SEA_LUMIES', entry_qty: 3, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_MANGROVE_LOG', entry_qty: 24, chance_pct: 100 },
      ]},
    ],
  },
  shark: {
    blockId: 'WATER_POOL_SEA_CREATURES_SHARK',
    blockName: 'Water Pool -- Sea Creature kills (pool Shark, Fishing Festival)',
    eventGated: 'Fishing Festival actif',
    creatures: [
      { name: 'Nurse Shark', hp: 2500, isUndead: false, weight: 2875, loot: [
        { entry_item_id: 'SHARK_FIN', entry_qty: 2, chance_pct: 100 },
      ]},
      { name: 'Blue Shark', hp: 25000, isUndead: false, weight: 1500, loot: [
        { entry_item_id: 'SHARK_FIN', entry_qty: 4, chance_pct: 100 },
      ]},
      { name: 'Tiger Shark', hp: 250000, isUndead: false, weight: 500, loot: [
        { entry_item_id: 'SHARK_FIN', entry_qty: 8, chance_pct: 100 },
      ]},
      { name: 'Great White Shark', hp: 1500000, isUndead: false, weight: 100, loot: [
        { entry_item_id: 'SHARK_FIN', entry_qty: 16, chance_pct: 100 },
      ]},
    ],
  },
  special: {
    blockId: 'WATER_POOL_SEA_CREATURES_SPECIAL',
    blockName: 'Water Pool -- Sea Creature kills (pool Special)',
    eventGated: null,
    creatures: [
      { name: 'Oasis Rabbit', hp: 6000, isUndead: false, weight: 300, loot: [
        { entry_item_id: 'WATER_LILY', entry_qty: 1, chance_pct: 100 },
        { entry_item_id: 'RABBIT', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'Oasis Sheep', hp: 6000, isUndead: false, weight: 700, loot: [
        { entry_item_id: 'MUTTON', entry_qty: 1, chance_pct: 100 },
        { entry_item_id: 'WOOL', entry_qty: 1, chance_pct: 100 },
        { entry_item_id: 'WATER_LILY', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'Mithril Grubber', hp: 6000, isUndead: false, weight: 385, loot: [
        { entry_item_id: 'MITHRIL_ORE', entry_qty: 12, chance_pct: 100 },
        { entry_item_id: 'RAW_FISH', entry_qty: 3, chance_pct: 100 },
      ]},
      { name: 'Flaming Worm', hp: 100000, isUndead: false, weight: 180, loot: [
        { entry_item_id: 'ROUGH_SAPPHIRE_GEM', entry_qty: 20, chance_pct: 100 },
      ]},
      { name: 'Water Worm', hp: 50000, isUndead: false, weight: 300, loot: [
        { entry_item_id: 'HARD_STONE', entry_qty: 10, chance_pct: 100 },
        { entry_item_id: 'ROUGH_AMETHYST_GEM', entry_qty: 10, chance_pct: 100 },
      ]},
      { name: 'Poisoned Water Worm', hp: 75000, isUndead: false, weight: 300, loot: [
        { entry_item_id: 'HARD_STONE', entry_qty: 10, chance_pct: 100 },
        { entry_item_id: 'ROUGH_AMETHYST_GEM', entry_qty: 20, chance_pct: 100 },
      ]},
      { name: 'Lava Pigman', hp: 450000, isUndead: true, weight: 36, loot: [
        { entry_item_id: 'ROUGH_TOPAZ_GEM', entry_qty: 20, chance_pct: 100 },
      ]},
      { name: 'Lava Blaze', hp: 400000, isUndead: false, weight: 36, loot: [
        { entry_item_id: 'ROUGH_TOPAZ_GEM', entry_qty: 20, chance_pct: 100 },
        { entry_item_id: 'BLAZE_ROD', entry_qty: 5, chance_pct: 100 },
      ]},
      { name: 'Abyssal Miner', hp: 2000000, isUndead: false, weight: 90, loot: [
        { entry_item_id: 'ROUGH_AMETHYST_GEM', entry_qty: 20, chance_pct: 100 },
        { entry_item_id: 'ROUGH_JADE_GEM', entry_qty: 20, chance_pct: 100 },
        { entry_item_id: 'ROUGH_SAPPHIRE_GEM', entry_qty: 20, chance_pct: 100 },
        { entry_item_id: 'QUARTZ_ORE', entry_qty: 10, chance_pct: 100 },
      ]},
    ],
  },
  spooky: {
    blockId: 'WATER_POOL_SEA_CREATURES_SPOOKY',
    blockName: 'Water Pool -- Sea Creature kills (pool Spooky, Spooky Festival)',
    eventGated: 'Spooky Festival actif',
    creatures: [
      { name: "Jumpin' Jack", hp: 3500, isUndead: false, weight: 5000, loot: [
        { entry_item_id: 'PUMPKIN', entry_qty: 3, chance_pct: 100 },
        { entry_item_id: 'GREEN_CANDY', entry_qty: 1.5, chance_pct: 100 },
      ]},
      { name: 'Scarecrow', hp: 4500, isUndead: false, weight: 2875, loot: [
        { entry_item_id: 'GREEN_CANDY', entry_qty: 3, chance_pct: 100 },
        { entry_item_id: 'PUMPKIN', entry_qty: 6, chance_pct: 100 },
      ]},
      { name: 'Nightmare', hp: 35000, isUndead: true, weight: 1500, loot: [
        { entry_item_id: 'GREEN_CANDY', entry_qty: 6, chance_pct: 100 },
        { entry_item_id: 'PUMPKIN', entry_qty: 12, chance_pct: 100 },
      ]},
      { name: 'Werewolf', hp: 50000, isUndead: false, weight: 500, loot: [
        { entry_item_id: 'PUMPKIN', entry_qty: 24, chance_pct: 100 },
        { entry_item_id: 'PURPLE_CANDY', entry_qty: 1.5, chance_pct: 100 },
        { entry_item_id: 'WEREWOLF_SKIN', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'Phantom Fisher', hp: 1000000, isUndead: false, weight: 100, loot: [
        { entry_item_id: 'PURPLE_CANDY', entry_qty: 3, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_PUMPKIN', entry_qty: 1.5, chance_pct: 100 },
      ]},
      { name: 'Grim Reaper', hp: 3000000, isUndead: false, weight: 25, loot: [
        { entry_item_id: 'ENCHANTED_PUMPKIN', entry_qty: 6, chance_pct: 100 },
        { entry_item_id: 'PURPLE_CANDY', entry_qty: 12, chance_pct: 100 },
        { entry_item_id: 'SOUL_FRAGMENT', entry_qty: 1, chance_pct: 100 },
      ]},
    ],
  },
  torrhus_canyon: {
    blockId: 'WATER_POOL_SEA_CREATURES_TORRHUS_CANYON',
    blockName: 'Water Pool -- Sea Creature kills (pool Torrhus Canyon)',
    eventGated: null,
    creatures: [
      { name: 'Haggard', hp: 10000, isUndead: false, weight: 5000, loot: [
        { entry_item_id: 'BONE', entry_qty: 3, chance_pct: 100 },
        { entry_item_id: 'HELIX_LOG', entry_qty: 12, chance_pct: 100 },
        { entry_item_id: 'RUBY_VEILSHROOM', entry_qty: 1.5, chance_pct: 100 },
      ]},
      { name: 'Brineling', hp: 25000, isUndead: false, weight: 2875, loot: [
        { entry_item_id: 'HELIX_LOG', entry_qty: 24, chance_pct: 100 },
        { entry_item_id: 'RUBY_VEILSHROOM', entry_qty: 3, chance_pct: 100 },
      ]},
      { name: 'Sprawl', hp: 50000, isUndead: false, weight: 1500, loot: [
        { entry_item_id: 'HELIX_LOG', entry_qty: 48, chance_pct: 100 },
        { entry_item_id: 'RUBY_VEILSHROOM', entry_qty: 12, chance_pct: 100 },
      ]},
      { name: 'Torrid', hp: 100000, isUndead: false, weight: 500, loot: [
        { entry_item_id: 'ENCHANTED_HELIX_LOG', entry_qty: 1, chance_pct: 100 },
        { entry_item_id: 'RUBY_VEILSHROOM', entry_qty: 32, chance_pct: 100 },
      ]},
      { name: 'Silkbreeze', hp: 250000, isUndead: false, weight: 100, loot: [
        { entry_item_id: 'ENCHANTED_HELIX_LOG', entry_qty: 6, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_RUBY_VEILSHROOM', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'Giant Isopod', hp: 500000, isUndead: false, weight: 25, loot: [
        { entry_item_id: 'ENCHANTED_HELIX_LOG', entry_qty: 24, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_RUBY_VEILSHROOM', entry_qty: 8, chance_pct: 100 },
      ]},
    ],
  },
  winter: {
    blockId: 'WATER_POOL_SEA_CREATURES_WINTER',
    blockName: "Water Pool -- Sea Creature kills (pool Winter, Jerry's Workshop)",
    eventGated: "Jerry's Workshop actif",
    creatures: [
      { name: 'Frozen Steve', hp: 1500, isUndead: false, weight: 5000, loot: [
        { entry_item_id: 'ESSENCE_ICE', entry_qty: 1, chance_pct: 100 },
        { entry_item_id: 'ICE', entry_qty: 3, chance_pct: 100 },
      ]},
      { name: 'Frosty', hp: 250, isUndead: false, weight: 2875, loot: [
        { entry_item_id: 'ESSENCE_ICE', entry_qty: 3, chance_pct: 100 },
        { entry_item_id: 'ICE', entry_qty: 24, chance_pct: 100 },
        { entry_item_id: 'SNOW_BLOCK', entry_qty: 24, chance_pct: 100 },
      ]},
      { name: 'Nutcracker', hp: 4000000, isUndead: false, weight: 500, loot: [
        { entry_item_id: 'ESSENCE_ICE', entry_qty: 18, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_ICE', entry_qty: 1, chance_pct: 100 },
      ]},
      { name: 'Yeti', hp: 2000000, isUndead: false, weight: 100, loot: [
        { entry_item_id: 'ESSENCE_ICE', entry_qty: 100, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_ICE', entry_qty: 48, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_RAW_FISH', entry_qty: 24, chance_pct: 100 },
        { entry_item_id: 'ENCHANTED_PACKED_ICE', entry_qty: 1, chance_pct: 100 },
        { entry_item_id: 'BLUE_ICE_HUNK', entry_qty: 1.5, chance_pct: 100 },
      ]},
    ],
  },
}

export const SEA_CREATURE_POOL_KEYS = Object.keys(POOLS)

export type SeaCreatureResult = {
  pool: string
  target_block: string
  tier: TierKey
  weapon: string
  armor: string | null
  avg_ttk_seconds: number
  avg_loot_ev: number
  base_scc_pct: number
  additional_coins_per_hour: number
  event_gated: string | null
}

export async function computeSeaCreatureRanking(tier: TierKey, poolKey: string): Promise<SeaCreatureResult> {
  const pool = POOLS[poolKey]
  if (!pool) throw new Error(`Unknown sea creature pool: ${poolKey}`)

  const [{ data: weapon }, { data: armor }] = await Promise.all([
    supabase.from('pluton_slayer_weapon_stats').select('*').eq('slayer_key', 'zombie').eq('item_id', COMBAT_GEAR_BY_TIER[tier].weaponId).single(),
    COMBAT_GEAR_BY_TIER[tier].armorPrefix
      ? supabase.from('pluton_slayer_armor_stats').select('*').eq('slayer_key', 'zombie').eq('set_prefix', COMBAT_GEAR_BY_TIER[tier].armorPrefix).single()
      : Promise.resolve({ data: null }),
  ])
  if (!weapon) throw new Error(`Missing Zombie weapon for tier ${tier}`)

  const { dpsVsUndead, dpsVsOther } = await computeEnrichedDps(tier, weapon, armor)

  const allItemIds = pool.creatures.flatMap(c => c.loot.map(l => l.entry_item_id)).filter(Boolean) as string[]
  const priceCache = await loadPriceCache(allItemIds)

  const totalWeight = pool.creatures.reduce((s, c) => s + c.weight, 0)
  let weightedTtk = 0
  let weightedLootEv = 0
  for (const creature of pool.creatures) {
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
    pool: poolKey,
    target_block: pool.blockName,
    tier,
    weapon: weapon.display_name,
    armor: armor?.set_name ?? null,
    avg_ttk_seconds: weightedTtk,
    avg_loot_ev: weightedLootEv,
    base_scc_pct: baseSccPct,
    additional_coins_per_hour: additionalCoinsPerHour,
    event_gated: pool.eventGated,
  }
}

export async function computeAndPersistSeaCreatureRankings(): Promise<SeaCreatureResult[]> {
  const results: SeaCreatureResult[] = []

  // Nettoyage global des vieux pluton_setups Sea Creature AVANT la boucle
  // par pool -- 'ZOMBIE_SLAYER_GEAR_REUSED' est un tool_item_id exclusif a
  // cette methode (jamais utilise par WATER_POOL/les autres activites
  // fishing), donc un delete large ici est sans risque. Necessaire depuis
  // le passage a 1 target_block par pool (23 aout) : le filtre precedent
  // (contains accessories source_id='__sea_creature_method__') ne
  // matchait plus apres le renommage en '__sea_creature_<pool>__',
  // laissant les vieilles lignes 'basic' orphelines sans ce nettoyage
  // prealable.
  await supabase.from('pluton_setups').delete().eq('activity_key', 'fishing').eq('tool_item_id', 'ZOMBIE_SLAYER_GEAR_REUSED')

  for (const poolKey of SEA_CREATURE_POOL_KEYS) {
    const pool = POOLS[poolKey]

    // 1 target_block par pool (upsert manuel : cree si absent, reutilise
    // l'id existant sinon -- evite de casser les FK pluton_rankings d'une
    // pool deja construite comme 'basic' le 21 aout).
    const { data: existing } = await supabase
      .from('pluton_target_blocks')
      .select('id')
      .eq('activity_key', 'fishing')
      .eq('block_id', pool.blockId)
      .maybeSingle()

    let targetBlockId: number
    if (existing) {
      targetBlockId = existing.id
    } else {
      const { data: block, error: blockErr } = await supabase
        .from('pluton_target_blocks')
        .insert({
          activity_key: 'fishing',
          block_id: pool.blockId,
          block_name: pool.blockName,
          block_strength: 0,
          required_breaking_power: 0,
          sell_item_id: 'NONE',
          base_drop_count: 1,
          pricing_note: pool.eventGated
            ? `Methode additive Sea Creature kills, pool '${poolKey}' -- ACCESSIBLE UNIQUEMENT quand ${pool.eventGated} (coins/h a lire comme un taux "pendant l'evenement", pas une moyenne annualisee, aucun taux de frequence source). Gear Zombie Slayer reutilise, meme moteur DPS/TTK que la pool basic (21 aout).`
            : `Methode additive Sea Creature kills, pool '${poolKey}' -- meme discipline que la pool basic (21 aout) : gear Zombie Slayer reutilise, moteur DPS/TTK partage. Ajoute au coins/h WATER_POOL deja persiste par Fishing, ne le remplace pas.`,
        })
        .select('id')
        .single()
      if (blockErr || !block) throw new Error(`pluton_target_blocks insert failed for ${poolKey}: ${blockErr?.message}`)
      targetBlockId = block.id
    }

    // Persistance scopee au target_block_id -- jamais un delete par
    // activity_key seul (effacerait WATER_POOL et les autres pools deja
    // construites, meme piege deja documente le 21 aout). Les vieux
    // pluton_setups sont deja purges globalement avant cette boucle.
    await supabase.from('pluton_rankings').delete().eq('activity_key', 'fishing').eq('target_block_id', targetBlockId)

    const entries = []
    for (const tier of SEA_CREATURE_TIER_KEYS) {
      const r = await computeSeaCreatureRanking(tier, poolKey)
      results.push(r)
      entries.push({
        tier,
        setup: {
          armor_set_prefix: r.armor ?? `Aucune (${r.weapon} seul)`,
          tool_item_id: 'ZOMBIE_SLAYER_GEAR_REUSED',
          accessories: [{ source_id: `__sea_creature_${poolKey}__`, equip_slot: 'meta', avg_ttk_seconds: r.avg_ttk_seconds, avg_loot_ev: r.avg_loot_ev, base_scc_pct: r.base_scc_pct }],
        },
        ranking: {
          time_seconds: r.avg_ttk_seconds,
          actions_per_hour: 3600 / Math.max(r.avg_ttk_seconds, 0.01),
          yield_per_hour: 3600 / Math.max(r.avg_ttk_seconds, 0.01),
          coins_per_hour: r.additional_coins_per_hour,
        },
      })
    }

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
    if (setupErr || !insertedSetups) throw new Error(`pluton_setups insert failed (sea creature kills, ${poolKey}): ${setupErr?.message}`)

    const rankingsToInsert = entries.map((e, i) => ({
      activity_key: 'fishing',
      tier: e.tier,
      target_block_id: targetBlockId,
      setup_id: insertedSetups[i].id,
      rank: 1,
      mining_time_seconds: e.ranking.time_seconds,
      actions_per_hour: e.ranking.actions_per_hour,
      yield_per_hour: e.ranking.yield_per_hour,
      coins_per_hour_raw_block_only: e.ranking.coins_per_hour,
    }))
    const { error: rankErr } = await supabase.from('pluton_rankings').insert(rankingsToInsert)
    if (rankErr) throw new Error(`pluton_rankings insert failed (sea creature kills, ${poolKey}): ${rankErr.message}`)
  }

  return results
}
