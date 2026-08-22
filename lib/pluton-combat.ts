// lib/pluton-combat.ts
// Pluton Combat -- 1er calculateur "1 skill = 1 fichier" (21 aout, plan
// reconnexion Systeme A/B). Remplace terme a terme lib/pluton-slayer.ts/
// lib/pluton-dungeons.ts/lib/pluton-bestiary.ts (3 fichiers pour le meme
// skill Combat) -- meme formules bespoke deja validees (DPS/TTK, EV-loot),
// mais gear source EN DIRECT depuis pluton_elements (Systeme A, tague par
// skill Phase 1) au lieu des tables dediees a la main, et echelle de tier
// JOUEUR reelle 1-7 (pas early/mid/end/late).
//
// **Portee de ce chantier (bornee, exhaustivite a suivre)** : Zombie Slayer
// uniquement pour l'instant -- 1re tranche verticale verifiee de bout en
// bout avant d'etendre aux 4 autres Slayers/Dungeons/Bestiary (meme
// discipline "le plus simple d'abord" que toute la construction Pluton
// depuis le debut). lib/pluton-slayer.ts (Spider/Wolf/Enderman/Blaze) et
// lib/pluton-dungeons.ts/lib/pluton-bestiary.ts restent actifs et
// inchanges tant que leur migration n'est pas faite -- pas de retrait
// avant remplacement verifie.
//
// **Trous reels trouves dans le Systeme A en construisant ceci (documentes,
// pas caches)** : la classification originale ne tague AUCUN item par
// skill (corrige en Phase 1) NI par tier sur les lignes wiki_haiku_extract
// qui portent les vraies valeurs de stats (594/3890 seulement geres) --
// corrige ici au cas par cas pour Zombie Slayer en reutilisant la
// recherche deja validee cette session (paliers ZS3/ZS6 reels), jamais
// invente. Certains stats individuels (ex: bonus Undead +100% de Reaper
// Armor, timing Enrage) restent introuvables dans pluton_elements meme
// apres recherche sur plusieurs pages source candidates -- fallback
// documente sur la valeur deja validee (lib/pluton-slayer.ts, sourcee wiki
// a l'origine), PAS une invention nouvelle, PAS un silence.
import { createClient } from '@supabase/supabase-js'
import { getGearStatsFromElements, findMobTypeBonus, computeCombatDps } from './pluton-engine'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const PLAYER_TIERS = ['1', '2', '3', '4', '5', '6', '7'] as const

// Gear par tier joueur (1-7) -- meme progression reelle que lib/pluton-
// slayer.ts (Undead Sword libre -> Revenant Falchion ZS3 -> Reaper Falchion
// ZS6 max), re-exprimee sur l'echelle fine 1-7 au lieu de early/mid/end/late :
// tier 1-3 = Undead Sword (aucune armure), tier 4-6 = Revenant Falchion+
// Armor, tier 7 = Reaper Falchion+Armor (Enrage actif, meme convention
// "investissement max au tier le plus haut" que Mining Speed Boost).
function gearForTier(tier: string): { weapon: string; armor: string | null } {
  const t = Number(tier)
  if (t <= 3) return { weapon: 'Undead Sword', armor: null }
  if (t <= 6) return { weapon: 'Revenant Falchion', armor: 'Revenant Armor' }
  return { weapon: 'Reaper Falchion', armor: 'Reaper Armor' }
}

// Fallback documente -- valeurs deja validees dans lib/pluton-slayer.ts
// (sourcees wiki a l'origine) pour les stats introuvables dans
// pluton_elements malgre recherche sur les pages "Strength"/"Damage"/item
// direct. Reaper Armor : Force+75 permanent + Enrage (+100 Force/+100
// Damage flat, 6s actif/25s cooldown) CONFIRME present dans pluton_elements
// (page wiki "Strength", section "Permanent Sources") mais le bonus +100%
// Undead de l'armure et le detail de l'ability Enrage (duree/cooldown) ne
// le sont pas -- fallback sur la recherche originale.
const ENRAGE_UPTIME = 6 / 25 // 6s actif / 25s cooldown, cf. lib/pluton-slayer.ts
const REAPER_ARMOR_UNDEAD_BONUS_FALLBACK_PCT = 100 // introuvable dans pluton_elements, meme apres recherche

export type ZombieSlayerCombo = {
  playerTier: string
  bossTier: number
  bossName: string
  weapon: string
  armor: string | null
  dps: number
  ttkSeconds: number
  coinsPerHour: number
  dataSourceGaps: string[]
}

async function computeZombieSlayerCombo(playerTier: string, boss: { tier: number; boss_name: string; health: number; guaranteed_drop_item_id: string; guaranteed_drop_qty_avg: number }, dropPrice: number): Promise<ZombieSlayerCombo> {
  const gaps: string[] = []
  const { weapon, armor } = gearForTier(playerTier)

  const weaponStats = await getGearStatsFromElements(weapon, 'combat')
  const armorStats = armor ? await getGearStatsFromElements(armor, 'combat') : new Map()

  const baseDamage = weaponStats.get('Damage')?.value ?? 0
  if (!weaponStats.has('Damage')) gaps.push(`${weapon}: Damage introuvable dans pluton_elements`)
  const strength = (weaponStats.get('Strength')?.value ?? 0) + (armorStats.get('Strength')?.value ?? 0)

  const weaponMobBonus = findMobTypeBonus(weaponStats, 'undead')
  let armorMobBonus = armor ? findMobTypeBonus(armorStats, 'undead') : 0
  if (armor && armorMobBonus === 0) {
    armorMobBonus = REAPER_ARMOR_UNDEAD_BONUS_FALLBACK_PCT
    gaps.push(`${armor}: bonus vs Undead introuvable dans pluton_elements, fallback valeur deja validee (${REAPER_ARMOR_UNDEAD_BONUS_FALLBACK_PCT}%)`)
  }

  const mults = [1 + weaponMobBonus / 100]
  if (armor) mults.push(1 + armorMobBonus / 100)

  // Enrage (Reaper Armor, tier 7 uniquement) -- +100 Force/+100 Damage
  // flat en moyenne ponderee par uptime reel, meme mecanisme que Mining
  // Speed Boost ailleurs dans Pluton. Duree/cooldown non retrouves dans
  // pluton_elements -- fallback sur la valeur deja validee.
  let flatDamageBonus = 0
  let enrageStrengthBonus = 0
  if (armor === 'Reaper Armor') {
    gaps.push(`Reaper Armor: timing Enrage (6s/25s) introuvable dans pluton_elements, fallback valeur deja validee`)
    flatDamageBonus = 100 * ENRAGE_UPTIME
    enrageStrengthBonus = 100 * ENRAGE_UPTIME
  }

  const dps = computeCombatDps(baseDamage + flatDamageBonus, strength + enrageStrengthBonus, mults)
  const ttkSeconds = boss.health / dps
  const killsPerHour = 3600 / ttkSeconds
  const coinsPerHour = killsPerHour * boss.guaranteed_drop_qty_avg * dropPrice

  return { playerTier, bossTier: boss.tier, bossName: boss.boss_name, weapon, armor, dps, ttkSeconds, coinsPerHour, dataSourceGaps: gaps }
}

export async function computeZombieSlayerRankings(): Promise<ZombieSlayerCombo[]> {
  const { data: bosses } = await supabase
    .from('pluton_slayer_boss_tiers')
    .select('tier, boss_name, health, guaranteed_drop_item_id, guaranteed_drop_qty_avg')
    .eq('slayer_key', 'zombie')
    .order('tier')
  if (!bosses) return []

  const since = new Date(Date.now() - 5 * 86_400_000).toISOString().split('T')[0]
  const { data: priceRow } = await supabase
    .from('price_history')
    .select('sell_price')
    .eq('item_id', bosses[0].guaranteed_drop_item_id)
    .gte('bucket_date', since)
    .gt('sell_price', 0)
    .order('bucket_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const dropPrice = Number(priceRow?.sell_price) || 0

  const results: ZombieSlayerCombo[] = []
  for (const playerTier of PLAYER_TIERS) {
    for (const boss of bosses as any[]) {
      results.push(await computeZombieSlayerCombo(playerTier, boss, dropPrice))
    }
  }
  return results
}

export async function computeAndPersistZombieSlayerRankings(): Promise<{ combos: number; gaps: string[] }> {
  const results = await computeZombieSlayerRankings()
  const allGaps = Array.from(new Set(results.flatMap(r => r.dataSourceGaps)))

  const bossTiers = Array.from(new Set(results.map(r => r.bossTier)))
  const blockIds = bossTiers.map(t => `ZOMBIE_SLAYER_T${t}`)

  const { data: existingBlocks } = await supabase
    .from('pluton_target_blocks').select('id, block_id').eq('activity_key', 'combat').in('block_id', blockIds)
  const existingIds = (existingBlocks || []).map(b => b.id)
  if (existingIds.length > 0) {
    await supabase.from('pluton_rankings').delete().in('target_block_id', existingIds)
    await supabase.from('pluton_setups').delete().eq('activity_key', 'combat').contains('accessories', [{ source_id: '__zombie_slayer_v2__' }])
    await supabase.from('pluton_target_blocks').delete().in('id', existingIds)
  }

  const blockByBossTier = new Map<number, number>()
  for (const bossTier of bossTiers) {
    const sample = results.find(r => r.bossTier === bossTier)!
    const { data: block, error } = await supabase
      .from('pluton_target_blocks')
      .insert({
        activity_key: 'combat',
        block_id: `ZOMBIE_SLAYER_T${bossTier}`,
        block_name: `Zombie Slayer -- ${sample.bossName}`,
        block_strength: 0, required_breaking_power: 0, sell_item_id: 'REVENANT_FLESH', base_drop_count: 1,
        pricing_note: `Refonte 1-skill-par-fichier (21 aout) -- gear source en direct depuis pluton_elements (Systeme A), echelle tier joueur 1-7 reelle. Formule Damage/Damage Calculation deja validee (lib/pluton-slayer.ts). Gaps de donnees Systeme A documentes: ${allGaps.join(' | ') || 'aucun'}.`,
      })
      .select('id').single()
    if (error || !block) throw new Error(`target_block insert failed: ${error?.message}`)
    blockByBossTier.set(bossTier, block.id)
  }

  const setupsToInsert = results.map(r => ({
    activity_key: 'combat',
    tier: r.playerTier,
    investment_level: 'optimal',
    armor_set_prefix: r.armor ?? `Aucune (${r.weapon} seul)`,
    tool_item_id: r.weapon,
    total_mining_speed: 0, total_mining_fortune: 0, total_breaking_power: 0, real_cost: 0,
    accessories: [{ source_id: '__zombie_slayer_v2__', boss_tier: r.bossTier, dps: r.dps }],
  }))
  const { data: insertedSetups, error: setupErr } = await supabase.from('pluton_setups').insert(setupsToInsert).select('id')
  if (setupErr || !insertedSetups) throw new Error(`pluton_setups insert failed: ${setupErr?.message}`)

  const rankingsToInsert = results.map((r, i) => ({
    activity_key: 'combat',
    tier: r.playerTier,
    target_block_id: blockByBossTier.get(r.bossTier)!,
    setup_id: insertedSetups[i].id,
    rank: 1,
    mining_time_seconds: r.ttkSeconds,
    actions_per_hour: 3600 / r.ttkSeconds,
    yield_per_hour: 3600 / r.ttkSeconds,
    coins_per_hour_raw_block_only: r.coinsPerHour,
  }))
  const { error: rankErr } = await supabase.from('pluton_rankings').insert(rankingsToInsert)
  if (rankErr) throw new Error(`pluton_rankings insert failed: ${rankErr.message}`)

  return { combos: results.length, gaps: allGaps }
}
