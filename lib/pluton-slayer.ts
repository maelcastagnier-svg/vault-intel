// lib/pluton-slayer.ts
// Pluton Slayer/Combat (18 aout) -- 5e activite generalisee, la premiere
// necessitant un vrai moteur de COMBAT (temps de kill via degats/seconde
// reels), pas juste un rendement par action -- prerequis explicitement
// identifie par le gap documente sur Sea Creature Chance de Pluton Fishing.
//
// Formule de degats reelle -- 2 sources croisees, page "Damage" (formule
// generale) + page "Damage Calculation" (classification Additive vs
// Multiplicative, lue en entier apres un recadrage explicite de
// l'utilisateur sur l'exhaustivite -- correction reelle d'un premier
// classement invente a tort avant cette 2e lecture, voir plus bas) :
//   DamageDealt = (5+BaseDamage+FlatDamageBonuses) x (1+Strength/100)
//                 x AdditiveMultiplier x MultiplicativeMultiplier
//                 x (1+CritDamage/100 si critique)
//   ExpectedDamage = NonCrit x (1 + (CritChance/100)x(CritDamage/100))
//     (simplification esperance-de-gain standard, ou x(1+CritDamage/100)
//     direct si l'arme crit toujours -- cas reel de Sting/Stinger)
//
// **AdditiveMultiplier** = 1 + (somme des sources classees Additive)/100 --
// seule source confirmee et modelisee ici : perk Combat "Warrior" (skills.
// reward, +4%/niveau jusqu'a 100% a 25, plafond reel "+210%" a 60, page
// "Damage Calculation" confirme explicitement "Additive Buff").
// **MultiplicativeMultiplier** = PRODUIT (pas somme) de chaque source
// classee Multiplicative -- confirme explicitement sur "Damage Calculation"
// pour {{Item|Halberd of the Shredded}} (+250% Undead = Multiplicative
// 3.5x, formule 1+X/100) ET pour Tarantula Armor (Octodexterity every-4th-
// hit +100% = Multiplicative 2x confirme) / Primordial Armor (every-3rd-hit
// +50% = Multiplicative 1.5x confirme, valeurs prises telles quelles depuis
// le wiki, pas re-derivees a la main). Halberd of the Shredded est
// l'upgrade direct de Reaper Falchion (meme famille "+X% Undead"
// Zombie Slayer) -- **les bonus "+X% a un type de mob" des armes/armures de
// slayer sont donc traites ici comme Multiplicative (1+X/100), par
// generalisation raisonnee depuis ce cas confirme**, le wiki lui-meme
// avertissant explicitement que "les descriptions en jeu ne suivent pas des
// regles coherentes, la verification de chaque implementation reelle est
// necessaire" -- pas une certitude absolue par item, documentee comme telle.
// Un premier jet de ce fichier sommait ces bonus armes+armure dans UN seul
// bucket additif (donc x(1+200%+100%)=x4.0 au lieu de x3.0*x2.0=x6.0 pour
// Reaper Falchion+Reaper Armor) -- corrige avant tout redeploiement apres
// cette 2e lecture complete de "Damage Calculation".
// **FlatDamageBonuses** : bonus type "+100 Damage" (Enrage de Reaper Armor)
// s'ajoute directement a BaseDamage (comme le stat Damage brut d'un objet),
// PAS un pourcentage -- confirme par la page "Damage" elle-meme (le stat
// Damage EST BaseDamage dans la formule).
//
// Cadence d'attaque reelle (source live wiki "Bonus Attack Speed", page pas
// encore cachee cote hypixelskyblock_wiki au moment de ce chantier -- fetch
// direct) :
//   InvulnerabilityTicks = floor(10/(1+BonusAttackSpeed/100)), 20 TPS
//   AttacksPerSecond = 20/Ticks -- base 2 hits/s a 0 AS, plafond reel 4 hits/s
//   (AS>=82, la stat elle-meme plafonne a 100 -- "Combat Stats" wiki "stats").
//
// Stats de base reelles (wiki "Stats#Combat Stats") : HP=100, Force=0,
// CritChance=30%, CritDamage=50%.
//
// Bonus de niveau Combat reel (table skills deja en base, skill_name=Combat,
// reward textuel par niveau) : perk "Warrior" cumulatif, plafond reel
// "Warrior 60 : +210% degats" au niveau max -- ET +0.5% Crit Chance par
// niveau (+30% cumule a 60). Modelise ici a NIVEAU 60 MAX pour tous les
// tiers (meme hypothese "joueur qui progresse le skill en parallele" deja
// implicite chez Mining/Farming, jamais de palier de niveau invente).
//
// **Seul le drop garanti (pool "Token", odds="Guaranteed" explicite sur le
// wiki) est compte dans coins/h** -- tous les autres drops (Catalysts/
// Runes/enchant books/Scythe Blade/Shards...) suivent un systeme de poids
// multi-pool par kill dont la conversion poids->probabilite exacte n'est
// pas proprement sourcee ici (le "requirement" du wiki gate un PALIER de
// reward-track, pas un poids RNG directement utilisable) -- gap documente,
// meme discipline que le taux de coffre au tresor jamais modelise par
// Mining, ou Sea Creature jamais modelise par Fishing.
// **coins_per_hour_boss_phase_only sous-estime donc fortement le vrai
// revenu Slayer** (nom de champ volontairement explicite sur cette limite,
// cf convention "raw_block_only" de Mining).
//
// **Phase de farm de mobs (XP Combat necessaire pour faire spawn le boss)
// PAS modelisee** -- gap documente egalement, distinct du gap ci-dessus :
// necessiterait un 2e mini-modele de combat (PV/loot des mobs de base, pas
// encore source) pour calculer le temps reel de la phase de farm avant le
// spawn. coins_per_hour ici represente donc UNIQUEMENT la phase "combat
// contre le boss deja spawn", extrapolee a l'heure comme si un nouveau boss
// etait toujours immediatement disponible -- une metrique partielle/idealisee,
// documentee comme telle, pas un cycle de jeu complet realiste.
import { createClient } from '@supabase/supabase-js'
import {
  fetchReforges, pickBestReforge, recombobulatedRarity, JASPER_PERFECT_BY_RARITY, ART_OF_WAR_STRENGTH, WITHER_FORBIDDEN_STRENGTH_MAX,
  SEVEN_TIER_KEYS, type SevenTier, oldTierBucket,
  SHARPNESS_PCT_BY_TIER, CRITICAL_PCT_BY_TIER, POTATO_BOOK_USES_BY_TIER,
} from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Rarete reelle (item_stats, verifiee 22 aout) -- necessaire pour Reforge
// (table `reforges`, keyee par rarete) et Recombobulator (decale d'1 cran).
const WEAPON_RARITY: Record<string, string> = {
  SPIDER_SWORD: 'COMMON', RECLUSE_FANG: 'UNCOMMON', TARANTULA_FANG: 'RARE', SCORPION_FOIL: 'EPIC', STING: 'LEGENDARY',
  SHAMAN_SWORD: 'EPIC', POOCH_SWORD: 'LEGENDARY',
  VOIDWALKER_KATANA: 'UNCOMMON', VOIDEDGE_KATANA: 'RARE', ATOMSPLIT_KATANA: 'LEGENDARY',
  MAWDUST_DAGGER: 'RARE', HEARTMAW_DAGGER: 'LEGENDARY',
}
const ARMOR_RARITY_BY_PREFIX: Record<string, string> = {
  TARANTULA: 'EPIC', PRIMORDIAL: 'LEGENDARY', MASTIFF: 'EPIC', FINAL_DESTINATION: 'LEGENDARY',
}

export const SLAYER_TARGET_BLOCK_IDS = [
  'ZOMBIE_T1', 'ZOMBIE_T2', 'ZOMBIE_T3', 'ZOMBIE_T4', 'ZOMBIE_T5',
  'SPIDER_T1', 'SPIDER_T2', 'SPIDER_T3', 'SPIDER_T4', 'SPIDER_T5',
  'WOLF_T1', 'WOLF_T2', 'WOLF_T3', 'WOLF_T4', // pas de Tier V reel (confirme wiki "Sven Packmaster")
  'ENDERMAN_T1', 'ENDERMAN_T2', 'ENDERMAN_T3', 'ENDERMAN_T4', // pas de Tier V reel (confirme wiki "Voidgloom Seraph")
  'BLAZE_T1', 'BLAZE_T2', 'BLAZE_T3', 'BLAZE_T4', // pas de Tier V reel (confirme wiki "Inferno Demonlord")
] as const

// Niveau de collection Wolf Slayer assume pour le bonus plat "+X Damage par
// niveau" de Shaman/Pooch Sword (wiki) -- MID = palier minimum reellement
// requis pour debloquer Shaman Sword (WS3, hypothese conservative "juste
// debloque"), END/LATE = niveau max reellement documente dans la table de
// deblocage Wolf Slayer (WS9 "Alpha Wolf", jamais invente). Interpolation
// sur 7 paliers (23 aout) -- ancres reelles preservees : skilled=ancien mid
// (WS3), professional/master=ancien end/late (WS9 max).
const WOLF_COLLECTION_LEVEL_BY_TIER: Partial<Record<SevenTier, number>> = {
  intermediate: 3, skilled: 3, expert: 9, professional: 9, master: 9,
}
// 7 tiers reels (starter->master, 23 aout).
export const SLAYER_TIER_KEYS: readonly SevenTier[] = SEVEN_TIER_KEYS

// Couche NBT (22 aout, meme methode acceleree que lib/pluton-combat.ts --
// extraction groupee + tri agent + UN SEUL cycle de verification pour les 4
// slayers, plutot qu'un par un). Deliberement AJOUTEE a ce fichier (garde
// son architecture early/mid/end/late + tables dediees deja validees le 18
// aout) plutot que migree vers pluton_elements/echelle 1-7 -- la migration
// complete est un chantier separe (deja note dans pluton-combat.ts), ne pas
// le conflater avec l'ajout NBT demande ici.
//
// Sharpness/Critical -- universels, memes tables centralisees dans
// pluton-engine.ts (23 aout, migration 7 tiers). Enchant vs-type-de-mob
// specifique -- verifie AVANT de coder (agent dedie, 22 aout) : seuls
// Spider (Bane of Arthropods, meme table que Sharpness, "applied to
// Weapons" -- couvre les dagues) et Enderman (Ender Slayer, meme table,
// confirme applicable aux katanas -- leur page wiki declare `type=Sword`
// malgre le nom cosmetique "Katana") ont un vrai enchant dedie a leur type
// de mob -- memes valeurs que Sharpness, reutilise directement. Wolf et
// Blaze n'en ont AUCUN (confirme par recherche directe, aucune
// correspondance) -- 0% ici n'est pas un trou, une verite reelle.
const MOB_TYPE_ENCHANT_PCT_BY_TIER: Partial<Record<string, Record<SevenTier, number>>> = {
  spider: SHARPNESS_PCT_BY_TIER, // Bane of Arthropods
  enderman: SHARPNESS_PCT_BY_TIER, // Ender Slayer
}

// Essence Shop "Bane" (Spider Essence Shop, NPC Spider Tamer) -- 22 aout,
// trouve en repondant a une question de l'utilisateur sur les systemes
// annexes (HOTM/HOTF -> a fait remonter les Essence Shops). Sourcee wiki
// "Essence Shops/Spider" -- "Increases damage dealt to Spiders by X%",
// I+3% II+6% III+9% IV+12% V+15% (5 paliers max, PAS de restriction de
// lieu contrairement aux perks Undead Essence Shop "while in The
// Catacombs" -- verifie explicitement avant d'ajouter, celles-ci restent
// hors-scope Slayer/Bestiary a raison). MULTIPLICATIVE (meme bucket "vs
// type de mob" que le bonus arme/armure deja code, confirme par la doc
// d'en-tete de ce fichier). Interpolation sur 7 paliers (23 aout) -- ancres
// reelles preservees : amateur=ancien early(3%), skilled=ancien mid(9%),
// professional/master=ancien end/late(15% max).
const BANE_PCT_BY_TIER: Record<SevenTier, number> = {
  starter: 2, amateur: 3, intermediate: 6, skilled: 9, expert: 12, professional: 15, master: 15,
}

// Gemmes Jasper (Strength) -- verifie AVANT de coder (agent dedie) : seuls
// ces 5 items ont un vrai emplacement Jasper/Combat exploitable pour le DPS
// (Recluse Fang/Spider Sword/Tarantula Armor/Shaman Sword/Voidwalker
// Katana/Final Destination Armor : aucun emplacement du tout ; Primordial
// Armor : emplacement present dans le wikitext mais commente <!--...--> par
// le wiki lui-meme, "infoneeded", traite comme absent ; Mastiff Armor : 4
// emplacements mais TOUS Ruby-only = Health, sans effet sur le DPS, ignores
// ici). Valeur = Jasper qualite PERFECT a la rarete reelle de l'item hote
// (table `gemstones`, meme source que lib/pluton-combat.ts) -- simplification
// documentee : qualite PERFECT appliquee des que l'emplacement existe, quel
// que soit le tier joueur (pas de palier de qualite intermediaire ROUGH/
// FINE/FLAWLESS -- gain marginal faible face a la complexite d'un 2e axe de
// palier, meme discipline "MVP documente" que Foraging/autres).
// Nombre d'emplacements Jasper par arme (verifie AVANT de coder) -- valeur
// reelle = JASPER_PERFECT_BY_RARITY a la rarete RECOMBOBULEE (voir plus bas,
// Recombobulator toujours applique), pas a la rarete de base.
const JASPER_SLOTS_BY_WEAPON: Record<string, number> = {
  STING: 2, // LEGENDARY, 2 emplacements Combat
  TARANTULA_FANG: 1, // RARE, 1 emplacement Combat gratuit
  POOCH_SWORD: 1, // LEGENDARY, 1 emplacement Jasper-only
  ATOMSPLIT_KATANA: 1, // LEGENDARY, 1 emplacement Jasper (2 Sapphire ignores, sans effet DPS)
  VOIDEDGE_KATANA: 1, // RARE, 1 emplacement Jasper (1 Sapphire ignore)
}

// Hot Potato Book / Fuming Potato Book -- universel (voir doc complete dans
// lib/pluton-combat.ts), meme palier +2 Force/+2 Degats par usage, table
// centralisee dans pluton-engine.ts (23 aout, migration 7 tiers).
const POTATO_BOOK_BONUS_PER_USE = 2

const BASE_STRENGTH = 0
const BASE_CRIT_CHANCE = 30
const BASE_CRIT_DAMAGE = 50
// "Warrior 60" (skills.reward, skill_name=Combat, niveau 60) -- perk
// cumulatif reel, Additive confirme (voir doc d'en-tete), modelise a
// niveau max.
const COMBAT_LEVEL_60_DAMAGE_ADDITIVE_PCT = 210
const COMBAT_LEVEL_60_CRIT_CHANCE_BONUS = 30 // +0.5%/niveau x60

function computeAttacksPerSecond(bonusAttackSpeed: number): number {
  const ticks = Math.max(1, Math.floor(10 / (1 + bonusAttackSpeed / 100)))
  return 20 / ticks
}

function computeDps(
  baseDamage: number, flatDamageBonus: number, strength: number,
  additivePct: number, multiplicativeFactors: number[],
  critChance: number, critDamage: number, alwaysCrit: boolean, bonusAttackSpeed: number
): number {
  const multiplicativeMult = multiplicativeFactors.reduce((a, b) => a * b, 1)
  const nonCrit = (5 + baseDamage + flatDamageBonus) * (1 + strength / 100) * (1 + additivePct / 100) * multiplicativeMult
  const expectedPerHit = alwaysCrit
    ? nonCrit * (1 + critDamage / 100)
    : nonCrit * (1 + (Math.min(100, critChance) / 100) * (critDamage / 100))
  return expectedPerHit * computeAttacksPerSecond(bonusAttackSpeed)
}

export type SlayerRankingResult = {
  target_block: string
  target_block_id: number
  tier: SevenTier
  top_setup: {
    weapon: string
    weapon_item_id: string
    armor_set: string | null
    total_strength: number
    dps: number
    time_to_kill_seconds: number
    boss_health: number
    spawn_cost_coins: number
    guaranteed_drop_value: number
    kills_per_hour: number
    coins_per_hour_boss_phase_only: number
    enrage_applied: boolean
    weapon_reforge: string | null
    armor_reforge_x4: string | null
  } | null
}

// Mapping gear reel par (slayer, tier joueur) -- armes/armures Slayer sont
// gatees par collection XP, jamais par prix AH (la plupart "salable=no" sur
// le wiki) -- l'architecture "budget AH combinatoire" des autres activites
// Pluton ne s'applique pas ici, mapping direct a la place (meme raison que
// Farming pour son Specialized Farming Tool).
// Gear collection-gated -- garde la structure early/mid/end/late (le vrai
// axe de deblocage, voir doc oldTierBucket dans pluton-engine.ts), lookup
// via oldTierBucket(tier) plutot que directement par tier reel.
const GEAR_BY_SLAYER_TIER: Record<string, Record<'early' | 'mid' | 'end' | 'late', { weapons: string[]; armor: string | null; enrage: boolean }>> = {
  zombie: {
    early: { weapons: ['UNDEAD_SWORD'], armor: null, enrage: false },
    mid: { weapons: ['REVENANT_SWORD'], armor: 'REVENANT', enrage: false },
    end: { weapons: ['REAPER_SWORD', 'REAPER_SCYTHE'], armor: 'REAPER', enrage: false },
    late: { weapons: ['REAPER_SWORD', 'REAPER_SCYTHE'], armor: 'REAPER', enrage: true },
  },
  spider: {
    early: { weapons: ['SPIDER_SWORD'], armor: null, enrage: false },
    mid: { weapons: ['TARANTULA_FANG'], armor: 'TARANTULA', enrage: false },
    end: { weapons: ['STING'], armor: 'PRIMORDIAL', enrage: false },
    late: { weapons: ['STING'], armor: 'PRIMORDIAL', enrage: false },
  },
  wolf: {
    // Aucune arme Wolf gratuite/starter n'existe (confirme wiki : rien avant
    // Shaman Sword @ Wolf Slayer 3, contrairement a Undead Sword/Spider
    // Sword) -- EARLY honnetement non eligible, top_setup:null.
    early: null as any,
    mid: { weapons: ['SHAMAN_SWORD'], armor: 'MASTIFF', enrage: false },
    end: { weapons: ['POOCH_SWORD'], armor: 'MASTIFF', enrage: false },
    late: { weapons: ['POOCH_SWORD'], armor: 'MASTIFF', enrage: false },
  },
  enderman: {
    early: { weapons: ['VOIDWALKER_KATANA'], armor: null, enrage: false },
    mid: { weapons: ['VOIDEDGE_KATANA'], armor: 'FINAL_DESTINATION', enrage: false },
    end: { weapons: ['ATOMSPLIT_KATANA'], armor: 'FINAL_DESTINATION', enrage: false },
    // Vivacious Darkness (Final Destination, toggle continu cout Soulflow)
    // -- LATE uniquement, meme convention "investissement max" que Enrage
    // de Zombie.
    late: { weapons: ['ATOMSPLIT_KATANA'], armor: 'FINAL_DESTINATION', enrage: true },
  },
  blaze: {
    // Aucune dague Blaze gratuite/starter n'existe (confirme wiki : rien
    // avant Firedust/Twilight Dagger @ Blaze Slayer 2) -- EARLY honnetement
    // non eligible. AUCUNE armure Blaze Slayer n'existe non plus (confirme
    // explicitement par le wiki -- seul Slayer dans ce cas), armor:null a
    // tous les tiers.
    early: null as any,
    mid: { weapons: ['MAWDUST_DAGGER'], armor: null, enrage: false },
    end: { weapons: ['HEARTMAW_DAGGER'], armor: null, enrage: false },
    late: { weapons: ['HEARTMAW_DAGGER'], armor: null, enrage: false },
  },
}

export async function computeSlayerRanking(tier: SevenTier, blockId: string): Promise<SlayerRankingResult> {
  const [slayerKeyRaw, tierPart] = blockId.split('_T')
  const slayerKey = slayerKeyRaw.toLowerCase()
  const slayerTier = Number(tierPart)

  const [{ data: boss }, { data: targetBlock }, { data: weapons }, { data: armors }] = await Promise.all([
    supabase.from('pluton_slayer_boss_tiers').select('*').eq('slayer_key', slayerKey).eq('tier', slayerTier).single(),
    // pluton_rankings.target_block_id reference pluton_target_blocks(id), pas
    // pluton_slayer_boss_tiers(id) -- bug reel trouve en verifiant Spider en
    // prod (violation FK, "marchait" pour Zombie par pure coincidence
    // d'ids). Chaque palier Slayer a sa propre ligne pluton_target_blocks
    // (activity_key='slayer', block_id=ex 'ZOMBIE_T1'), jointe ici pour
    // satisfaire la contrainte -- les vraies donnees de calcul restent dans
    // pluton_slayer_boss_tiers.
    supabase.from('pluton_target_blocks').select('id').eq('activity_key', 'slayer').eq('block_id', blockId).single(),
    supabase.from('pluton_slayer_weapon_stats').select('*').eq('slayer_key', slayerKey).eq('verified', true),
    supabase.from('pluton_slayer_armor_stats').select('*').eq('slayer_key', slayerKey),
  ])
  if (!boss || !targetBlock) throw new Error(`Unknown target block: ${blockId}`)

  const weaponById = new Map((weapons || []).map(w => [w.item_id, w]))
  const armorByPrefix = new Map((armors || []).map(a => [a.set_prefix, a]))

  const gearConfig = GEAR_BY_SLAYER_TIER[slayerKey]?.[oldTierBucket(tier)]
  if (!gearConfig) return { target_block: boss.boss_name, target_block_id: targetBlock.id, tier, top_setup: null }

  const armor = gearConfig.armor ? armorByPrefix.get(gearConfig.armor) : null
  const armorStrength = armor ? Number(armor.set_strength) : 0
  const armorMobTypeMult = armor ? 1 + Number(armor.mob_type_damage_bonus_pct) / 100 : 1

  let enrageStrength = 0
  let enrageFlatDamage = 0
  let enrageAttackSpeed = 0
  let enrageMobTypeMultPct = 0
  if (gearConfig.enrage && armor?.enrage_duration_s && armor?.enrage_cooldown_s) {
    // Moyenne ponderee par temps reel d'activite (uptime = duree/cooldown,
    // reactivation immediate a la fin du cooldown) -- meme methode deja
    // validee pour le Mining Speed Boost de Pluton Mining, jamais "actif en
    // continu" naivement. Pour un toggle CONTINU comme Vivacious Darkness
    // (Enderman), duration=cooldown=1 encode "toujours actif" (uptime=100%,
    // reel pour ce mecanisme, pas invente).
    const uptime = Number(armor.enrage_duration_s) / Number(armor.enrage_cooldown_s)
    enrageStrength = Number(armor.enrage_bonus_strength) * uptime
    enrageFlatDamage = Number(armor.enrage_bonus_damage_flat || 0) * uptime
    enrageAttackSpeed = Number(armor.enrage_bonus_attack_speed || 0) * uptime
    enrageMobTypeMultPct = Number(armor.enrage_bonus_mob_type_mult_pct || 0) * uptime
  }

  let best: any = null
  for (const weaponId of gearConfig.weapons) {
    const weapon = weaponById.get(weaponId)
    if (!weapon) continue

    // Recombobulator 3000 -- toujours applique (voir pluton-engine.ts).
    const weaponRarity = WEAPON_RARITY[weaponId]
    const weaponRecombRarity = weaponRarity ? recombobulatedRarity(weaponRarity) : undefined
    const armorRarity = armor?.set_prefix ? ARMOR_RARITY_BY_PREFIX[armor.set_prefix] : undefined
    const armorRecombRarity = armorRarity ? recombobulatedRarity(armorRarity) : undefined

    const jasperSlots = JASPER_SLOTS_BY_WEAPON[weaponId] ?? 0
    const gemstoneStrength = jasperSlots && weaponRecombRarity ? jasperSlots * JASPER_PERFECT_BY_RARITY[weaponRecombRarity] : 0
    const potatoUses = POTATO_BOOK_USES_BY_TIER[tier]
    const potatoFlat = potatoUses * POTATO_BOOK_BONUS_PER_USE
    const totalStrength = BASE_STRENGTH + Number(weapon.base_strength) + armorStrength + enrageStrength + gemstoneStrength + potatoFlat + ART_OF_WAR_STRENGTH + WITHER_FORBIDDEN_STRENGTH_MAX
    const weaponMobTypeMult = 1 + Number(weapon.mob_type_damage_bonus_pct) / 100

    // Octodexterity (armure) -- deja fourni pre-moyenne par le wiki lui-meme
    // (Multiplicative confirme, valeurs 2x/1.5x prises telles quelles).
    const octoMult = armor?.octodexterity_bonus_damage_pct
      ? 1 + Number(armor.octodexterity_bonus_damage_pct) / 100 / Number(armor.octodexterity_every_n_hits)
      : 1

    // Pack Mentality (Pooch Sword, wolf) -- +100% degats vs Wolves SI le
    // joueur porte un set complet Armor of the Pack OU Mastiff Armor (wiki
    // "Pooch Sword") -- toujours satisfait ici car le mapping gear associe
    // deja Pooch Sword a Mastiff Armor pour END/LATE, condition verifiee
    // explicitement plutot que supposee.
    const packMentalityMult = (slayerKey === 'wolf' && weaponId === 'POOCH_SWORD' && armor?.set_prefix === 'MASTIFF') ? 2.0 : 1

    // Radioactive (casque Tarantula/Primordial) -- Crit Damage bonus
    // proportionnel a la Force totale, plafond reel documente. Mastiff
    // Armor (wolf) a un bonus Crit Damage plat separe (set_crit_damage).
    let critDamage = BASE_CRIT_DAMAGE + Number(weapon.base_crit_damage || 0) + (armor ? Number(armor.set_crit_damage) : 0)
    if (armor?.radioactive_cd_per_10_str) {
      const bonus = Math.min(Number(armor.radioactive_cd_cap), Number(armor.radioactive_cd_per_10_str) * (totalStrength / 10))
      critDamage += bonus
    }
    // Deathripper Dagger (Blaze) porte aussi un vrai bonus Crit Chance propre
    // (+10%, wiki) -- oubli trouve en verifiant Blaze en prod juste apres le
    // meme oubli sur Crit Damage (Spider/Enderman), meme discipline.
    const weaponCritChance = Number(weapon.base_crit_chance || 0)

    // Bonus plat "+X Damage par niveau de collection Wolf Slayer" (Shaman/
    // Pooch Sword) -- niveau assume selon WOLF_COLLECTION_LEVEL_BY_TIER,
    // jamais invente (voir doc a sa definition).
    const collectionLevelFlatDamage = weapon.damage_per_collection_level
      ? Number(weapon.damage_per_collection_level) * (WOLF_COLLECTION_LEVEL_BY_TIER[tier] ?? 0)
      : 0

    // Vivacious Darkness (Enderman, LATE) -- +100% degats vs Endermen en
    // plus des multiplicateurs deja presents, meme principe que Pack
    // Mentality (facteur multiplicatif propre, jamais somme avec les autres).
    const enrageMobTypeMult = 1 + enrageMobTypeMultPct / 100
    const bonusAttackSpeed = Number(weapon.base_attack_speed || 0) + enrageAttackSpeed

    // Sharpness + enchant vs-type-de-mob specifique (meme bucket additif,
    // voir doc des constantes) + Critical (Crit Damage) -- couche NBT ajoutee
    // 22 aout, memes sources/valeurs que lib/pluton-combat.ts (Zombie).
    const sharpnessPct = SHARPNESS_PCT_BY_TIER[tier]
    const mobEnchantPct = MOB_TYPE_ENCHANT_PCT_BY_TIER[slayerKey]?.[tier] ?? 0
    const additivePct = COMBAT_LEVEL_60_DAMAGE_ADDITIVE_PCT + sharpnessPct + mobEnchantPct
    critDamage += CRITICAL_PCT_BY_TIER[tier]
    const critChanceBeforeReforge = Math.min(100, BASE_CRIT_CHANCE + COMBAT_LEVEL_60_CRIT_CHANCE_BONUS + weaponCritChance)
    const baneMult = slayerKey === 'spider' ? 1 + BANE_PCT_BY_TIER[tier] / 100 : 1
    const multiplicativeFactors = [weaponMobTypeMult, armorMobTypeMult, octoMult, packMentalityMult, enrageMobTypeMult, baneMult]
    const flatDamageTotal = enrageFlatDamage + collectionLevelFlatDamage + potatoFlat

    // Reforge -- recherche reelle sur l'espace des candidats (table
    // `reforges`, rarete RECOMBOBULEE), jamais suppose. Arme x1, armure x4
    // (4 pieces identiques, simplification documentee -- voir
    // pluton-engine.ts). Aucun reforge n'etait applique avant cette passe.
    const scoreWeaponReforge = (delta: { strength: number; crit_chance: number; crit_damage: number; bonus_attack_speed: number }) =>
      computeDps(
        Number(weapon.base_damage), flatDamageTotal, totalStrength + delta.strength,
        additivePct, multiplicativeFactors,
        Math.min(100, critChanceBeforeReforge + delta.crit_chance), critDamage + delta.crit_damage,
        !!weapon.always_crit, bonusAttackSpeed + delta.bonus_attack_speed
      )
    const weaponReforgeCandidates = weaponRecombRarity ? await fetchReforges('SWORD/ROD', weaponRecombRarity) : []
    const bestWeaponReforge = pickBestReforge(weaponReforgeCandidates, 1, scoreWeaponReforge)

    let armorReforgeDelta = { strength: 0, crit_chance: 0, crit_damage: 0, bonus_attack_speed: 0 }
    let armorReforgeName: string | null = null
    if (armorRecombRarity) {
      const armorReforgeCandidates = await fetchReforges('ARMOR', armorRecombRarity)
      const wStrength = totalStrength + (bestWeaponReforge?.delta.strength || 0)
      const wCritChance = Math.min(100, critChanceBeforeReforge + (bestWeaponReforge?.delta.crit_chance || 0))
      const wCritDamage = critDamage + (bestWeaponReforge?.delta.crit_damage || 0)
      const wAttackSpeed = bonusAttackSpeed + (bestWeaponReforge?.delta.bonus_attack_speed || 0)
      const scoreArmorReforge = (delta: { strength: number; crit_chance: number; crit_damage: number; bonus_attack_speed: number }) =>
        computeDps(
          Number(weapon.base_damage), flatDamageTotal, wStrength + delta.strength,
          additivePct, multiplicativeFactors,
          Math.min(100, wCritChance + delta.crit_chance), wCritDamage + delta.crit_damage,
          !!weapon.always_crit, wAttackSpeed + delta.bonus_attack_speed
        )
      const best2 = pickBestReforge(armorReforgeCandidates, 4, scoreArmorReforge)
      if (best2) { armorReforgeDelta = best2.delta; armorReforgeName = best2.name }
    }

    const finalStrength = totalStrength + (bestWeaponReforge?.delta.strength || 0) + armorReforgeDelta.strength
    const finalCritChance = Math.min(100, critChanceBeforeReforge + (bestWeaponReforge?.delta.crit_chance || 0) + armorReforgeDelta.crit_chance)
    const finalCritDamage = critDamage + (bestWeaponReforge?.delta.crit_damage || 0) + armorReforgeDelta.crit_damage
    const finalAttackSpeed = bonusAttackSpeed + (bestWeaponReforge?.delta.bonus_attack_speed || 0) + armorReforgeDelta.bonus_attack_speed

    const dps = computeDps(
      Number(weapon.base_damage), flatDamageTotal, finalStrength,
      additivePct, multiplicativeFactors,
      finalCritChance, finalCritDamage, !!weapon.always_crit, finalAttackSpeed
    )
    if (!best || dps > best.dps) {
      best = {
        weapon: weapon.display_name, weapon_item_id: weapon.item_id, total_strength: finalStrength, dps, bonusAttackSpeed: finalAttackSpeed,
        weapon_reforge: bestWeaponReforge?.name ?? null, armor_reforge_x4: armorReforgeName,
      }
    }
  }
  if (!best) return { target_block: boss.boss_name, target_block_id: targetBlock.id, tier, top_setup: null }

  // Malevolent Hitshield (Voidgloom Seraph uniquement) -- le boss encaisse
  // un nombre fixe de coups sans perdre de PV a 3 declenchements reels,
  // temps "gaspille" ajoute directement au TTK plutot qu'ignore.
  const hitshieldExtraSeconds = boss.hitshield_hits_per_trigger
    ? (Number(boss.hitshield_triggers) * Number(boss.hitshield_hits_per_trigger)) / computeAttacksPerSecond(best.bonusAttackSpeed)
    : 0

  // Hellion Shield (Inferno Demonlord T2+) -- uptime reel de degats
  // effectifs (100% si pas de bouclier, 50% si une seule dague ne couvre
  // que 2 des 4 attunements -- voir doc migration), applique comme DPS
  // effectif reduit plutot qu'ignore.
  const effectiveDps = best.dps * (Number(boss.damage_uptime_pct) / 100)

  const timeToKillSeconds = Number(boss.health) / effectiveDps + hitshieldExtraSeconds
  const killsPerHour = 3600 / timeToKillSeconds

  const { data: dropPriceRow } = await supabase
    .from('price_history')
    .select('sell_price, bucket_date')
    .eq('item_id', boss.guaranteed_drop_item_id)
    .gt('sell_price', 0)
    .order('bucket_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const dropPrice = Number(dropPriceRow?.sell_price) || 0
  const guaranteedDropValue = Number(boss.guaranteed_drop_qty_avg) * dropPrice

  const coinsPerHour = (guaranteedDropValue - Number(boss.spawn_cost_coins)) * killsPerHour

  return {
    target_block: boss.boss_name,
    target_block_id: targetBlock.id,
    tier,
    top_setup: {
      weapon: best.weapon,
      weapon_item_id: best.weapon_item_id,
      armor_set: armor?.set_name ?? null,
      total_strength: best.total_strength,
      dps: best.dps,
      time_to_kill_seconds: timeToKillSeconds,
      boss_health: Number(boss.health),
      spawn_cost_coins: Number(boss.spawn_cost_coins),
      guaranteed_drop_value: guaranteedDropValue,
      kills_per_hour: killsPerHour,
      coins_per_hour_boss_phase_only: coinsPerHour,
      enrage_applied: gearConfig.enrage,
      weapon_reforge: best.weapon_reforge,
      armor_reforge_x4: best.armor_reforge_x4,
    },
  }
}

export type PersistedSlayerResult = {
  tier: SevenTier
  block_id: string
  target_block: string
  has_setup: boolean
  coins_per_hour_boss_phase_only: number | null
}

export async function computeAndPersistAllSlayerRankings(): Promise<PersistedSlayerResult[]> {
  const out: PersistedSlayerResult[] = []

  await supabase.from('pluton_rankings').delete().eq('activity_key', 'slayer')
  await supabase.from('pluton_setups').delete().eq('activity_key', 'slayer')

  for (const tier of SLAYER_TIER_KEYS) {
    for (const blockId of SLAYER_TARGET_BLOCK_IDS) {
      const result = await computeSlayerRanking(tier, blockId)

      if (!result.top_setup) {
        out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: false, coins_per_hour_boss_phase_only: null })
        continue
      }

      const s = result.top_setup
      const { data: setupRow, error: setupErr } = await supabase
        .from('pluton_setups')
        .insert({
          activity_key: 'slayer',
          tier,
          investment_level: 'optimal',
          // armor_set_prefix est NOT NULL en base -- EARLY n'a reellement
          // aucune armure geree (arme starter seule, aucun set gate a ce
          // tier), label explicite plutot qu'un null qui violerait la
          // contrainte (trouve en verifiant en prod sur Zombie).
          armor_set_prefix: s.armor_set ?? `Aucune (${s.weapon} seul)`,
          tool_item_id: s.weapon_item_id,
          // total_mining_speed porte le DPS (arrondi), total_mining_fortune
          // porte la Force totale -- meme convention de reutilisation deja
          // appliquee par Farming/Foraging/Fishing.
          total_mining_speed: Math.round(s.dps),
          total_mining_fortune: Math.round(s.total_strength),
          total_breaking_power: 0,
          real_cost: 0, // gear gate par collection XP, pas par prix AH (voir doc)
          pet_id: null,
          pet_rarity: null,
          accessories: [{ source_id: '__enrage_applied__', equip_slot: 'meta', enrage: s.enrage_applied, weapon_reforge: s.weapon_reforge, armor_reforge_x4: s.armor_reforge_x4, art_of_war: true, art_of_peace_x4: !!s.armor_set, recombobulated: true }],
        })
        .select('id')
        .single()
      if (setupErr || !setupRow) throw new Error(`pluton_setups insert failed for ${tier}/${blockId}: ${setupErr?.message}`)

      const { error: rankErr } = await supabase
        .from('pluton_rankings')
        .insert({
          activity_key: 'slayer',
          tier,
          target_block_id: result.target_block_id,
          setup_id: setupRow.id,
          rank: 1,
          mining_time_seconds: s.time_to_kill_seconds,
          actions_per_hour: s.kills_per_hour,
          yield_per_hour: s.kills_per_hour,
          coins_per_hour_raw_block_only: s.coins_per_hour_boss_phase_only,
        })
      if (rankErr) throw new Error(`pluton_rankings insert failed for ${tier}/${blockId}: ${rankErr.message}`)

      out.push({ tier, block_id: blockId, target_block: result.target_block, has_setup: true, coins_per_hour_boss_phase_only: s.coins_per_hour_boss_phase_only })
    }
  }

  return out
}
