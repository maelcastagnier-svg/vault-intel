// lib/pluton-slayer.ts
// Pluton Slayer/Combat (18 aout) -- 5e activite generalisee. Premiere activite
// necessitant un vrai moteur de COMBAT (temps de kill via degats/seconde
// reels), pas juste un rendement par action -- prerequis explicitement
// identifie par le gap documente sur Sea Creature Chance de Pluton Fishing.
//
// Scope de cette premiere passe (choisi explicitement par l'utilisateur,
// AskUserQuestion du 18 aout) : UN SEUL Slayer (Zombie/Revenant Horror),
// TOUS ses paliers (I-V) -- meme logique que Mining qui choisit des blocs
// representatifs plutot que de tout couvrir d'un coup. Spider/Wolf/Enderman/
// Blaze/Vampire Slayer restent a construire, activity_key='slayer' deja
// generique pour les accueillir sans migration de schema.
//
// Formule de degats reelle (wiki "Damage#Ways to Increase") :
//   DamageDealt = ((5+BaseDamage) x (1+Strength/100) x AdditiveMultipliers
//                  x MultiplicativeMultipliers x BonusModifiers)
//                 x (1+CritDamage/100 si le coup est critique)
//   ExpectedDamage = NonCrit x (1 + (CritChance/100) x (CritDamage/100))
//     (simplification standard esperance-de-gain sur la formule crit reelle)
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
// reward textuel par niveau) : perk "Warrior" cumulatif +4%/niveau jusqu'a
// 100% (niveau 25), puis ralentit, plafond reel "Warrior 60 : +210% degats"
// au niveau max -- ET +0.5% Crit Chance par niveau (+30% cumule a 60).
// Modelise ici a NIVEAU 60 MAX pour tous les tiers (meme hypothese "joueur
// qui progresse le skill en parallele" deja implicite chez Mining/Farming,
// jamais de palier de niveau invente).
//
// **Seul le drop garanti (Revenant Flesh, pool "Token", odds="Guaranteed"
// explicite sur le wiki) est compte dans coins/h** -- tous les autres drops
// (Foul Flesh/Catalysts/Runes/Smite VI/Scythe Blade/Warden Heart...) suivent
// un systeme de poids multi-pool par kill dont la conversion poids->
// probabilite exacte n'est pas proprement sourcee ici (le "requirement" du
// wiki gate un PALIER de reward-track, pas un poids RNG directement
// utilisable) -- gap documente, meme discipline que le taux de coffre au
// tresor jamais modelise par Mining, ou Sea Creature jamais modelise par
// Fishing. **coins_per_hour_boss_phase_only sous-estime donc fortement le
// vrai revenu Slayer** (nom de champ volontairement explicite sur cette
// limite, cf convention "raw_block_only" de Mining).
//
// **Phase de farm de mobs (XP Combat necessaire pour faire spawn le boss)
// PAS modelisee** -- gap documente egalement, distinct du gap ci-dessus :
// necessiterait un 2e mini-modele de combat (PV/loot des zombies de base,
// pas encore source) pour calculer le temps reel de la phase de farm avant
// le spawn. coins_per_hour ici represente donc UNIQUEMENT la phase "combat
// contre le boss deja spawn", extrapolee a l'heure comme si un nouveau boss
// etait toujours immediatement disponible -- une metrique partielle/idealisee,
// documentee comme telle, pas un cycle de jeu complet realiste.
import { createClient } from '@supabase/supabase-js'
import { TIER_CONFIG, type TierKey } from './money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const SLAYER_TARGET_BLOCK_IDS = ['ZOMBIE_T1', 'ZOMBIE_T2', 'ZOMBIE_T3', 'ZOMBIE_T4', 'ZOMBIE_T5'] as const
export const SLAYER_TIER_KEYS: TierKey[] = ['early', 'mid', 'end', 'late']

const BASE_STRENGTH = 0
const BASE_CRIT_CHANCE = 30
const BASE_CRIT_DAMAGE = 50
// "Warrior 60" (skills.reward, skill_name=Combat, niveau 60) -- perk cumulatif
// reel, modelise a niveau max (voir doc d'en-tete).
const COMBAT_LEVEL_60_DAMAGE_MULT_PCT = 210
const COMBAT_LEVEL_60_CRIT_CHANCE_BONUS = 30 // +0.5%/niveau x60

function computeAttacksPerSecond(bonusAttackSpeed: number): number {
  const ticks = Math.max(1, Math.floor(10 / (1 + bonusAttackSpeed / 100)))
  return 20 / ticks
}

function computeDps(baseDamage: number, strength: number, additiveMultPct: number, multiplicativeMultPct: number, critChance: number, critDamage: number, bonusAttackSpeed: number): number {
  const nonCrit = (5 + baseDamage) * (1 + strength / 100) * (1 + additiveMultPct / 100) * (1 + multiplicativeMultPct / 100)
  const expectedPerHit = nonCrit * (1 + (Math.min(100, critChance) / 100) * (critDamage / 100))
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

export async function computeSlayerRanking(tier: TierKey, blockId: string): Promise<SlayerRankingResult> {
  const slayerTier = Number(blockId.replace('ZOMBIE_T', ''))
  const [{ data: boss }, { data: weapons }, { data: armors }] = await Promise.all([
    supabase.from('pluton_slayer_boss_tiers').select('*').eq('slayer_key', 'zombie').eq('tier', slayerTier).single(),
    supabase.from('pluton_slayer_weapon_stats').select('*').eq('verified', true),
    supabase.from('pluton_slayer_armor_stats').select('*'),
  ])
  if (!boss) throw new Error(`Unknown target block: ${blockId}`)

  const weaponById = new Map((weapons || []).map(w => [w.item_id, w]))
  const armorByPrefix = new Map((armors || []).map(a => [a.set_prefix, a]))

  // Mapping gear reel par tier joueur -- les armes/armures Zombie Slayer sont
  // gatees par collection XP (Undead Sword libre -> Revenant Falchion @ZS3 ->
  // Reaper Falchion/Reaper Scythe @ZS6/ZS7), jamais par prix AH (la plupart
  // sont "salable=no" sur le wiki) -- l'architecture "budget AH combinatoire"
  // des autres activites Pluton ne s'applique pas ici, mapping direct a la
  // place (meme raison que Farming pour son Specialized Farming Tool).
  let candidateWeaponIds: string[]
  let armorPrefix: string | null
  let applyEnrage = false
  if (tier === 'early') { candidateWeaponIds = ['UNDEAD_SWORD']; armorPrefix = null }
  else if (tier === 'mid') { candidateWeaponIds = ['REVENANT_SWORD']; armorPrefix = 'REVENANT' }
  else { candidateWeaponIds = ['REAPER_SWORD', 'REAPER_SCYTHE']; armorPrefix = 'REAPER'; applyEnrage = (tier === 'late') }

  const armor = armorPrefix ? armorByPrefix.get(armorPrefix) : null
  const armorStrength = armor ? Number(armor.set_strength) : 0
  const armorUndeadBonus = armor ? Number(armor.undead_damage_bonus_pct) : 0

  let enrageStrength = 0
  let enrageDamageMultPct = 0
  if (applyEnrage && armor?.enrage_duration_s && armor?.enrage_cooldown_s) {
    // Moyenne ponderee par temps reel d'activite (uptime = duree/cooldown,
    // reactivation immediate a la fin du cooldown) -- meme methode deja
    // validee pour le Mining Speed Boost de Pluton Mining, jamais "actif en
    // continu" naivement.
    const uptime = Number(armor.enrage_duration_s) / Number(armor.enrage_cooldown_s)
    enrageStrength = Number(armor.enrage_bonus_strength) * uptime
    enrageDamageMultPct = Number(armor.enrage_bonus_damage_pct) * uptime
  }

  let best: any = null
  for (const weaponId of candidateWeaponIds) {
    const weapon = weaponById.get(weaponId)
    if (!weapon) continue
    const totalStrength = BASE_STRENGTH + Number(weapon.base_strength) + armorStrength + enrageStrength
    const additiveUndeadPct = Number(weapon.undead_damage_bonus_pct) + armorUndeadBonus
    const multiplicativePct = COMBAT_LEVEL_60_DAMAGE_MULT_PCT + enrageDamageMultPct
    const critChance = BASE_CRIT_CHANCE + COMBAT_LEVEL_60_CRIT_CHANCE_BONUS
    const dps = computeDps(Number(weapon.base_damage), totalStrength, additiveUndeadPct, multiplicativePct, critChance, BASE_CRIT_DAMAGE, 0)
    if (!best || dps > best.dps) {
      best = { weapon: weapon.display_name, weapon_item_id: weapon.item_id, total_strength: totalStrength, dps }
    }
  }
  if (!best) return { target_block: boss.boss_name, target_block_id: boss.id, tier, top_setup: null }

  const timeToKillSeconds = Number(boss.health) / best.dps
  const killsPerHour = 3600 / timeToKillSeconds

  const { data: fleshPriceRow } = await supabase
    .from('price_history')
    .select('sell_price, bucket_date')
    .eq('item_id', boss.guaranteed_drop_item_id)
    .gt('sell_price', 0)
    .order('bucket_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const fleshPrice = Number(fleshPriceRow?.sell_price) || 0
  const guaranteedDropValue = Number(boss.guaranteed_drop_qty_avg) * fleshPrice

  const coinsPerHour = (guaranteedDropValue - Number(boss.spawn_cost_coins)) * killsPerHour

  return {
    target_block: boss.boss_name,
    target_block_id: boss.id,
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
      enrage_applied: applyEnrage,
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
          // aucune armure Zombie Slayer geree (Undead Sword seul, aucun set
          // gate avant Zombie Slayer 4), label explicite plutot qu'un null
          // qui violerait la contrainte (trouve en verifiant en prod).
          armor_set_prefix: s.armor_set ?? 'Aucune (Undead Sword seul)',
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
