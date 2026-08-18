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
import { TIER_CONFIG, type TierKey } from './money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const SLAYER_TARGET_BLOCK_IDS = [
  'ZOMBIE_T1', 'ZOMBIE_T2', 'ZOMBIE_T3', 'ZOMBIE_T4', 'ZOMBIE_T5',
  'SPIDER_T1', 'SPIDER_T2', 'SPIDER_T3', 'SPIDER_T4', 'SPIDER_T5',
  'WOLF_T1', 'WOLF_T2', 'WOLF_T3', 'WOLF_T4', // pas de Tier V reel (confirme wiki "Sven Packmaster")
] as const

// Niveau de collection Wolf Slayer assume pour le bonus plat "+X Damage par
// niveau" de Shaman/Pooch Sword (wiki) -- MID = palier minimum reellement
// requis pour debloquer Shaman Sword (WS3, hypothese conservative "juste
// debloque"), END/LATE = niveau max reellement documente dans la table de
// deblocage Wolf Slayer (WS9 "Alpha Wolf", jamais invente).
const WOLF_COLLECTION_LEVEL_BY_TIER: Partial<Record<TierKey, number>> = { mid: 3, end: 9, late: 9 }
export const SLAYER_TIER_KEYS: TierKey[] = ['early', 'mid', 'end', 'late']

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
  tier: TierKey
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
  } | null
}

// Mapping gear reel par (slayer, tier joueur) -- armes/armures Slayer sont
// gatees par collection XP, jamais par prix AH (la plupart "salable=no" sur
// le wiki) -- l'architecture "budget AH combinatoire" des autres activites
// Pluton ne s'applique pas ici, mapping direct a la place (meme raison que
// Farming pour son Specialized Farming Tool).
const GEAR_BY_SLAYER_TIER: Record<string, Record<TierKey, { weapons: string[]; armor: string | null; enrage: boolean }>> = {
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
}

export async function computeSlayerRanking(tier: TierKey, blockId: string): Promise<SlayerRankingResult> {
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

  const gearConfig = GEAR_BY_SLAYER_TIER[slayerKey]?.[tier]
  if (!gearConfig) return { target_block: boss.boss_name, target_block_id: targetBlock.id, tier, top_setup: null }

  const armor = gearConfig.armor ? armorByPrefix.get(gearConfig.armor) : null
  const armorStrength = armor ? Number(armor.set_strength) : 0
  const armorMobTypeMult = armor ? 1 + Number(armor.mob_type_damage_bonus_pct) / 100 : 1

  let enrageStrength = 0
  let enrageFlatDamage = 0
  if (gearConfig.enrage && armor?.enrage_duration_s && armor?.enrage_cooldown_s) {
    // Moyenne ponderee par temps reel d'activite (uptime = duree/cooldown,
    // reactivation immediate a la fin du cooldown) -- meme methode deja
    // validee pour le Mining Speed Boost de Pluton Mining, jamais "actif en
    // continu" naivement.
    const uptime = Number(armor.enrage_duration_s) / Number(armor.enrage_cooldown_s)
    enrageStrength = Number(armor.enrage_bonus_strength) * uptime
    enrageFlatDamage = Number(armor.enrage_bonus_damage_flat) * uptime
  }

  let best: any = null
  for (const weaponId of gearConfig.weapons) {
    const weapon = weaponById.get(weaponId)
    if (!weapon) continue
    const totalStrength = BASE_STRENGTH + Number(weapon.base_strength) + armorStrength + enrageStrength
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
    let critDamage = BASE_CRIT_DAMAGE + (armor ? Number(armor.set_crit_damage) : 0)
    if (armor?.radioactive_cd_per_10_str) {
      const bonus = Math.min(Number(armor.radioactive_cd_cap), Number(armor.radioactive_cd_per_10_str) * (totalStrength / 10))
      critDamage += bonus
    }

    // Bonus plat "+X Damage par niveau de collection Wolf Slayer" (Shaman/
    // Pooch Sword) -- niveau assume selon WOLF_COLLECTION_LEVEL_BY_TIER,
    // jamais invente (voir doc a sa definition).
    const collectionLevelFlatDamage = weapon.damage_per_collection_level
      ? Number(weapon.damage_per_collection_level) * (WOLF_COLLECTION_LEVEL_BY_TIER[tier] ?? 0)
      : 0

    const additivePct = COMBAT_LEVEL_60_DAMAGE_ADDITIVE_PCT
    const critChance = BASE_CRIT_CHANCE + COMBAT_LEVEL_60_CRIT_CHANCE_BONUS
    const dps = computeDps(
      Number(weapon.base_damage), enrageFlatDamage + collectionLevelFlatDamage, totalStrength,
      additivePct, [weaponMobTypeMult, armorMobTypeMult, octoMult, packMentalityMult],
      critChance, critDamage, !!weapon.always_crit, Number(weapon.base_attack_speed)
    )
    if (!best || dps > best.dps) {
      best = { weapon: weapon.display_name, weapon_item_id: weapon.item_id, total_strength: totalStrength, dps }
    }
  }
  if (!best) return { target_block: boss.boss_name, target_block_id: targetBlock.id, tier, top_setup: null }

  const timeToKillSeconds = Number(boss.health) / best.dps
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
    },
  }
}

export type PersistedSlayerResult = {
  tier: TierKey
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
          accessories: [{ source_id: '__enrage_applied__', equip_slot: 'meta', enrage: s.enrage_applied }],
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
