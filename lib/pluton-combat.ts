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
import { getGearStatsFromElements, findMobTypeBonus, findBaseStat, computeCombatDps } from './pluton-engine'

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
const REAPER_ARMOR_UNDEAD_BONUS_FALLBACK_PCT = 100 // introuvable dans pluton_elements (wiki_haiku_extract), meme apres recherche
// Reaper Armor +75 Force permanente : CONFIRME reelle et presente dans
// pluton_elements, mais dans wiki_table_extract (page "Strength", format
// cells/headers) -- getGearStatsFromElements() n'interroge que
// wiki_haiku_extract pour l'instant. Fallback documente en attendant
// d'etendre le helper aux pages de reference wiki_table_extract (chantier
// separe, note dans le plan de reconnexion).
const REAPER_ARMOR_STRENGTH_FALLBACK = 75

// Sharpness -- 1er modificateur NBT (enchant) reellement compose dans le
// calcul (22 aout, Phase 5 du plan reconnexion). Sourcee wiki "Sharpness"
// (game_mechanics_misc, hypixelskyblock_wiki, lue en entier) -- bonus
// additif confirme explicitement par le wiki lui-meme ("increases melee
// weapon damage. ({{additive}})"), meme bucket que le perk Warrior niveau
// Combat 60 (+210%) deja code -- computeCombatDps() etendu avec un
// parametre additionalAdditivePct dedie. Valeurs actuelles (wiki a jour,
// post-patch 0.23.5) : I+5% II+10% III+15% IV+20% V+30% VI+40% VII+50%.
// Applicable aux Swords -- Undead Sword/Revenant Falchion/Reaper Falchion
// sont de la famille Sword (meme classification que le reste de la chaine
// Zombie Slayer deja construite). Palier par tier joueur, meme convention
// "investissement croissant par tier" que Mining Speed Boost/Reaper Enrage
// ailleurs dans Pluton : Sharpness I-V obtenables Table d'Enchantement +
// combinaison Anvil (peu couteux, T1-6), VI/VII necessitent Dark/Darker
// Auction ou NPC Tomioka (10M coins, investissement reel) -- reserves T7.
const SHARPNESS_BONUS_PCT: Record<number, number> = { 1: 5, 2: 10, 3: 15, 4: 20, 5: 30, 6: 40, 7: 50 }
function enchantLevelForTier(tier: string): number {
  const t = Number(tier)
  if (t <= 3) return 3
  if (t <= 6) return 5
  return 7
}

// Smite -- 2e enchant compose (22 aout, meme lot que Sharpness), directement
// pertinent a Zombie Slayer (bonus explicitement vs Undead/Wither/Skeletal
// depuis le patch 2025/08/14). Sourcee wiki "Smite" -- meme table de valeurs
// que Sharpness (5/10/15/20/30/40/50%), meme bucket ADDITIF confirme
// explicitement par le wiki ("Damage is now additive with other
// enchantments"), s'additionne donc a Sharpness dans additionalAdditivePct
// (pas un nouveau parametre moteur). Distinct du bonus "+X% vs Undead"
// intrinseque a l'ARME/ARMURE elle-meme (deja code, Multiplicative,
// findMobTypeBonus) -- Smite est un enchant separe, son propre facteur.
// Palier par tier, meme convention que Sharpness.
const SMITE_BONUS_PCT: Record<number, number> = { 1: 5, 2: 10, 3: 15, 4: 20, 5: 30, 6: 40, 7: 50 }

// Critical -- 3e enchant compose (22 aout, meme lot), universel (pas
// specifique Undead). Sourcee wiki "Critical" -- augmente Crit Damage,
// I+10% II+20% III+30% IV+40% V+50% VI+70% VII+100%. Compose via le nouveau
// parametre additionalCritDamagePct de computeCombatDps() (5e parametre,
// retro-compatible). Zombie Slayer n'a aucune stat Crit Damage intrinseque
// sur ses armes (contrairement a Spider/Enderman/Blaze deja codes
// ailleurs) -- Critical est donc le 1er contributeur Crit Damage reel pour
// cette chaine. Palier par tier, meme convention.
const CRITICAL_BONUS_PCT: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 70, 7: 100 }

// Gemmes -- 4e/5e modificateur NBT (22 aout, meme lot), 1er cas d'emplacement
// de gemme reellement scope (verifie via requete `gemstones` deja validee/
// utilisee par lib/pluton-mining.ts -- table Combat = Jasper/Ruby/Sapphire/
// Amethyst, distincte des gemmes Mining Ruby/Topaz/Jasper Mining). Verifie
// AVANT de coder : seuls Reaper Falchion (1 emplacement Jasper-only) et
// Reaper Armor (1 emplacement "Combat", accepte les 4 types) ont un vrai
// emplacement de gemme -- Undead Sword/Revenant Falchion/Revenant Armor
// n'en ont AUCUN (infobox wiki sans champ gemstone_slots), pas un trou.
// Choix du type de gemme = vraie comparaison, pas suppose : sur les 4 types
// Combat, seul Jasper (Strength) affecte le DPS -- Ruby(Health)/
// Sapphire(Intelligence)/Amethyst(Defense) n'ont aucun effet sur la formule
// de degats, Jasper domine donc strictement pour cette activite (meme
// principe "recherche sur l'espace reel" que la vision finale Pluton).
// Qualite PERFECT (investissement max, T7 uniquement -- ce sont des
// emplacements Reaper-only). Valeurs table `gemstones` (bonus_value a
// PERFECT, selon la rarete reelle de l'item hote : Reaper Falchion=EPIC,
// Reaper Armor=LEGENDARY) :
const GEMSTONE_STRENGTH_REAPER_FALCHION = 11 // Jasper PERFECT @ EPIC
const GEMSTONE_STRENGTH_REAPER_ARMOR = 13 // Jasper PERFECT @ LEGENDARY

// Hot Potato Book / Fuming Potato Book -- 6e modificateur NBT (22 aout, meme
// lot), UNIVERSEL (s'applique a n'importe quelle epee/armure du jeu, pas
// specifique a Zombie Slayer -- reutilisable tel quel pour toute autre
// activite Combat future). Sourcee wiki "Hot Potato Book"/"Fuming Potato
// Book" (game_mechanics_misc, lues en entier). **Contradiction reelle
// trouvee dans la source elle-meme, documentee** : la page Hot Potato Book
// a un encadre-resume "x10 -> Str+10/Dmg+10" qui contredit sa PROPRE table
// detaillee par usage (Str+2/Dmg+2 PAR utilisation, 1 a 5 usages listes
// -> extrapolation lineaire = +20 a 10 usages, pas +10). La page Fuming
// Potato Book (qui necessite 10 HPB deja appliques comme prerequis) donne
// un encadre combine coherent avec le taux lineaire +2/usage : "5 FPB
// seuls" = +10 (5x2, coherent), "10 HPB + 5 FPB" = +30 (15x2, coherent) --
// retenu comme la source la plus fiable (coherente en interne sur 2 valeurs
// independantes), pas le resume isole et contradictoire de la page HPB
// seule. Applique aux SWORDS uniquement ici (Str+Dmg plat) -- variante
// Armor existe aussi (Def+HP) mais HP/Defense n'affectent pas la formule
// DPS de ce calculateur, hors-scope ici (pas omis, juste sans effet sur ce
// calcul precis). Palier par tier : 5 usages T1-3 (HPB seul, peu couteux,
// craftable via collection Potato), 10 usages T4-6 (HPB max), 15 usages
// T7 (10 HPB + 5 FPB, FPB = drop Donjon uniquement, investissement max).
const POTATO_BOOK_USES_FOR_TIER: Record<number, number> = { 1: 5, 2: 5, 3: 5, 4: 10, 5: 10, 6: 10, 7: 15 }
const POTATO_BOOK_BONUS_PER_USE = 2 // Str+2/Dmg+2 par usage, sourcee wiki, coherente sur 3 points de donnees independants

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
  nbtModifiers: string[]
}

async function computeZombieSlayerCombo(playerTier: string, boss: { tier: number; boss_name: string; health: number; guaranteed_drop_item_id: string; guaranteed_drop_qty_avg: number }, dropPrice: number): Promise<ZombieSlayerCombo> {
  const gaps: string[] = []
  const { weapon, armor } = gearForTier(playerTier)

  const weaponStats = await getGearStatsFromElements(weapon, 'combat')
  const armorStats = armor ? await getGearStatsFromElements(armor, 'combat') : []

  const baseDamage = findBaseStat(weaponStats, 'Damage')
  if (baseDamage === 0) gaps.push(`${weapon}: Damage introuvable dans pluton_elements`)
  let armorStrength = findBaseStat(armorStats, 'Strength')
  if (armor === 'Reaper Armor' && armorStrength === 0) {
    armorStrength = REAPER_ARMOR_STRENGTH_FALLBACK
    gaps.push(`${armor}: Strength introuvable dans pluton_elements (wiki_haiku_extract) -- reelle dans wiki_table_extract page "Strength", pas encore interrogee par ce helper, fallback valeur deja validee (+${REAPER_ARMOR_STRENGTH_FALLBACK})`)
  }
  const strength = findBaseStat(weaponStats, 'Strength') + armorStrength

  const weaponMobBonus = findMobTypeBonus(weaponStats, 'undead')
  // Revenant Armor a reellement 0% bonus Undead (confirme -- armure de
  // survie pure, aucun bonus offensif, deja documente cette session) : 0
  // est ici la VRAIE valeur, pas un trou. Seul Reaper Armor a un bonus reel
  // (+100%) introuvable dans pluton_elements -- fallback scope a cet
  // unique cas, jamais applique generiquement a "armure sans bonus trouve".
  let armorMobBonus = armor ? findMobTypeBonus(armorStats, 'undead') : 0
  if (armor === 'Reaper Armor' && armorMobBonus === 0) {
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

  const enchantLevel = enchantLevelForTier(playerTier)
  const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][enchantLevel]
  const sharpnessPct = SHARPNESS_BONUS_PCT[enchantLevel]
  const smitePct = SMITE_BONUS_PCT[enchantLevel]
  const criticalPct = CRITICAL_BONUS_PCT[enchantLevel]
  const nbtModifiers = [
    `Sharpness ${roman} (+${sharpnessPct}% additif, sourcee wiki)`,
    `Smite ${roman} (+${smitePct}% additif vs Undead, sourcee wiki)`,
    `Critical ${roman} (+${criticalPct}% Crit Damage, sourcee wiki)`,
  ]

  // Gemmes -- Reaper Falchion/Armor uniquement (T7), voir constantes ci-dessus.
  let gemstoneStrength = 0
  if (weapon === 'Reaper Falchion') {
    gemstoneStrength += GEMSTONE_STRENGTH_REAPER_FALCHION
    nbtModifiers.push(`Gemme Jasper PERFECT (Reaper Falchion, +${GEMSTONE_STRENGTH_REAPER_FALCHION} Force, sourcee table gemstones)`)
  }
  if (armor === 'Reaper Armor') {
    gemstoneStrength += GEMSTONE_STRENGTH_REAPER_ARMOR
    nbtModifiers.push(`Gemme Jasper PERFECT (Reaper Armor, +${GEMSTONE_STRENGTH_REAPER_ARMOR} Force, sourcee table gemstones)`)
  }

  // Hot Potato Book / Fuming Potato Book -- universel, palier par tier.
  const potatoUses = POTATO_BOOK_USES_FOR_TIER[Number(playerTier)]
  const potatoFlat = potatoUses * POTATO_BOOK_BONUS_PER_USE
  nbtModifiers.push(`Hot/Fuming Potato Book x${potatoUses} (+${potatoFlat} Force/+${potatoFlat} Degats plat, sourcee wiki)`)

  const dps = computeCombatDps(
    baseDamage + flatDamageBonus + potatoFlat,
    strength + enrageStrengthBonus + gemstoneStrength + potatoFlat,
    mults,
    sharpnessPct + smitePct,
    criticalPct
  )
  const ttkSeconds = boss.health / dps
  const killsPerHour = 3600 / ttkSeconds
  const coinsPerHour = killsPerHour * boss.guaranteed_drop_qty_avg * dropPrice

  return { playerTier, bossTier: boss.tier, bossName: boss.boss_name, weapon, armor, dps, ttkSeconds, coinsPerHour, dataSourceGaps: gaps, nbtModifiers }
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
        pricing_note: `Refonte 1-skill-par-fichier (21-22 aout) -- gear source en direct depuis pluton_elements (Systeme A), echelle tier joueur 1-7 reelle. Formule Damage/Damage Calculation deja validee (lib/pluton-slayer.ts). Phase 5 (composition NBT), lot complet : Sharpness/Smite/Critical (enchants, additif/CritDamage), Gemme Jasper PERFECT (Reaper Falchion+Armor uniquement, seul emplacement reel), Hot/Fuming Potato Book (universel, plat, palier 5/10/15 usages par tier) -- tous sourcees wiki/table gemstones, palier par tier. Gaps de donnees Systeme A documentes: ${allGaps.join(' | ') || 'aucun'}.`,
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
    accessories: [{ source_id: '__zombie_slayer_v2__', boss_tier: r.bossTier, dps: r.dps, nbt_modifiers: r.nbtModifiers }],
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
