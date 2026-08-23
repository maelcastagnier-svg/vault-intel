// lib/pluton-kuudra.ts
// Pluton Kuudra (23 aout) -- active money making, boss combat multi-phases
// (Crimson Isle, 5 tiers : Basic/Hot/Burning/Fiery/Infernal). Longtemps
// documente "bloque, aucune ancre de temps" (21 aout) -- reinvestigue a la
// demande explicite de l'utilisateur ("il y a pas le kuudra run").
//
// Ce qui a permis de debloquer : la page wiki principale "Kuudra" et sa
// sous-page "Perk Shop" (jamais lues en entier avant) donnent la table
// COMPLETE des paliers I-VII de la route Cannoneer, avec un mecanisme cle :
// les degats du canon/Ballista contre Kuudra sont un **% des PV MAX de
// Kuudra + un flat** ("Cannon Proficiency"). Consequence directe : le
// nombre de tirs necessaires pour tuer Kuudra est INDEPENDANT de ses PV
// absolus (jamais sources) -- seul le terme % compte pour la majorite des
// degats, ce qui rend la phase de combat entierement calculable depuis le
// setup, sans avoir besoin des PV reels de Kuudra lui-meme.
//
// **Simplification documentee, pas cachee** : le terme FLAT de Cannon
// Proficiency (+300k a +2.2M par tir) est ignore -- sans PV absolus de
// Kuudra sources, impossible de savoir sa vraie contribution relative.
// Le terme % domine largement a haut tier (PV de Kuudra tres eleves,
// coherent avec les PV de ses propres adds qui vont jusqu'a 500M a
// Infernal) donc l'omettre sous-estime legerement le DPS reel -- meme
// discipline que les autres simplifications "sous-estime, jamais
// surestime" deja actees ailleurs dans Pluton.
//
// **Gap reel, toujours non resolu malgre une recherche dediee (agent,
// 23 aout)** : le temps de base (0% perk) des Phases 1-3 (Crates/Ballista/
// Fuel -- collecte non-combat avant de pouvoir tirer sur Kuudra) n'est
// source NULLE PART (wiki : seulement des bonus RELATIFS par palier de
// perk, jamais la base 0% ; code source + REPO du mod communautaire
// SkyHanni : aucun timer de phase Kuudra ; 8+ threads Hypixel Forums :
// seulement des temps de run TOTAUX observes ~3-4min, jamais decomposes
// par phase ni par tier, et pas une vraie base 0%-perk comparable au reste
// de Pluton). **coins_per_hour_boss_phase_only** represente donc
// uniquement le temps de combat (tirs de canon jusqu'a 0 PV), PAS le
// temps des phases 1-3 -- memes discipline et nom de champ deja utilises
// pour les 5 Slayers (phase de farm de mobs non modelisee).
//
// **Loot garanti uniquement** (meme discipline que les 5 Slayers) : la
// table de loot complete par tier (`kuudra_ui`, coffre gratuit + coffre
// payant) melange des lignes garanties (100%) et un vrai pool RNG a poids
// (armures Aurora/Crimson/Fervor/Hollow/Terror, accessoires Molten,
// enchant books...) dont la conversion poids->probabilite exacte n'est pas
// le sujet ici -- seules les lignes 100% comptent dans le calcul, le pool
// RNG est un gap honnete documente, pas invente.
//
// **3 items du loot garanti reellement pricees (23 aout, correction d'une
// fausse hypothese)** : Crimson Essence (ESSENCE_CRIMSON, ~925 coins),
// Kuudra Teeth (KUUDRA_TEETH, ~6000 coins), Kraken Shard (SHARD_KRAKEN,
// ~180 811 coins) -- une 1re passe avait cru ces items non-tradeables
// (par analogie avec les monnaies Essence Shop deja confirmees non-
// tradeables) et avait cherche les mauvais item_id (KRAKEN_SHARD au lieu
// de SHARD_KRAKEN) -- corrige apres que l'utilisateur a explicitement
// demande de revérifier plutot que de conclure trop vite.
//
// **Cout de la Kuudra Key** : achetee au Barbarian Emissary (Enchanted Red
// Sand + Nether Star + coins, prix reel sources page "Kuudra Keys") --
// reputation de faction gatee mais traitee comme deja debloquee, meme
// convention que les gates de collection ailleurs dans Pluton.
import { createClient } from '@supabase/supabase-js'
import { loadPriceCache, SEVEN_TIER_KEYS, type SevenTier } from './pluton-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const KUUDRA_TIERS = ['basic', 'hot', 'burning', 'fiery', 'infernal'] as const
type KuudraTier = (typeof KUUDRA_TIERS)[number]

// Route Cannoneer, Perk Shop Kuudra (wiki, table complete I-VII) -- palier
// d'investissement par tier joueur, meme convention "investissement
// croissant" que le reste de Pluton (Mining Speed Boost, Reaper Enrage...).
type CannoneerLevel = { cannonProficiencyPct: number; multiShotBalls: number; rapidFireCooldownS: number; steadyAimPct: number }
// Migre au systeme reel a 7 tiers (23 aout) -- les 4 ancres reelles (wiki
// Perk Shop, paliers I/III/V/VII) sont PRESERVEES EXACTEMENT au tier 7
// correspondant (amateur=early, skilled=mid, professional=end, master=late,
// convention deja etablie sur tout le reste de cette migration) -- seule la
// granularite entre ces ancres (starter/intermediate/expert) est
// interpolee lineairement, jamais une valeur inventee au-dela de ce que la
// source documente.
const CANNONEER_BY_TIER: Record<SevenTier, CannoneerLevel> = {
  starter:      { cannonProficiencyPct: 1.45, multiShotBalls: 1, rapidFireCooldownS: 0.95, steadyAimPct: 0 },
  amateur:      { cannonProficiencyPct: 1.8,  multiShotBalls: 1, rapidFireCooldownS: 0.8,  steadyAimPct: 0 },    // ancre reelle : aucun perk achete (base sans Multi-Shot/Steady Aim, Cannon Proficiency I)
  intermediate: { cannonProficiencyPct: 2.15, multiShotBalls: 3, rapidFireCooldownS: 0.65, steadyAimPct: 5 },
  skilled:      { cannonProficiencyPct: 2.5,  multiShotBalls: 4, rapidFireCooldownS: 0.5,  steadyAimPct: 10 },   // ancre reelle : paliers III
  expert:       { cannonProficiencyPct: 2.95, multiShotBalls: 5, rapidFireCooldownS: 0.4,  steadyAimPct: 12.5 },
  professional: { cannonProficiencyPct: 3.4,  multiShotBalls: 6, rapidFireCooldownS: 0.3,  steadyAimPct: 15 },   // ancre reelle : paliers V (Multi-Shot/Rapid Fire max a V)
  master:       { cannonProficiencyPct: 4.0,  multiShotBalls: 6, rapidFireCooldownS: 0.3,  steadyAimPct: 25 },   // ancre reelle : Cannon Proficiency/Steady Aim VII (max)
}

function computeCombatSeconds(level: CannoneerLevel): number {
  const dmgPctPerCycle = level.cannonProficiencyPct * level.multiShotBalls * (1 + level.steadyAimPct / 100)
  const cyclesToKill = 100 / dmgPctPerCycle
  return cyclesToKill * level.rapidFireCooldownS
}

// Cout reel de la Key (Barbarian Emissary, page wiki "Kuudra Keys") --
// ingredients + coins, prix Bazaar/AH live recroises au calcul.
const KEY_RECIPE: Record<KuudraTier, { ers: number; netherStar: number; coins: number }> = {
  basic:    { ers: 2,   netherStar: 2, coins: 200_000 },
  hot:      { ers: 6,   netherStar: 2, coins: 400_000 },
  burning:  { ers: 20,  netherStar: 2, coins: 750_000 },
  fiery:    { ers: 60,  netherStar: 2, coins: 1_500_000 },
  infernal: { ers: 120, netherStar: 2, coins: 3_000_000 },
}

// Loot GARANTI uniquement (100% chance), coffre gratuit + coffre payant --
// source wiki "Kuudra/UI" (Loot), pool RNG explicitement exclu (voir doc
// d'en-tete). Quantites moyennees quand plusieurs valeurs equiprobables
// (ex: Basic free chest = 1 ou 2 Crimson Essence, 50/50 -> 1.5 moyenne).
const GUARANTEED_LOOT: Record<KuudraTier, { crimsonEssence: number; kuudraTeeth: number; krakenShard: number }> = {
  basic:    { crimsonEssence: 1.5 + 80,            kuudraTeeth: 1,   krakenShard: 1 },
  hot:      { crimsonEssence: 18 + 200,            kuudraTeeth: 1,   krakenShard: 1 },
  burning:  { crimsonEssence: 27.5 + 400,          kuudraTeeth: 2,   krakenShard: 1 },
  fiery:    { crimsonEssence: 100 + 1000,          kuudraTeeth: 2,   krakenShard: 0.75 * 1 + 0.25 * 2 },
  infernal: { crimsonEssence: 200 + 2000,          kuudraTeeth: 0.5 * 3 + 0.5 * 4, krakenShard: 0.5 * 1 + 0.5 * 2 },
}

const KUUDRA_TIER_LABEL: Record<KuudraTier, string> = {
  basic: 'Basic', hot: 'Hot', burning: 'Burning', fiery: 'Fiery', infernal: 'Infernal',
}

export type KuudraResult = {
  kuudraTier: KuudraTier
  playerTier: SevenTier
  combatSeconds: number
  runsPerHour: number
  guaranteedLootValue: number
  keyCost: number
  netProfitPerRun: number
  coinsPerHourBossPhaseOnly: number
}

export async function computeKuudraRankings(): Promise<KuudraResult[]> {
  // Loot (vendu) -- sell_price via loadPriceCache, deja la convention du
  // moteur partage.
  const priceCache = await loadPriceCache(['ESSENCE_CRIMSON', 'KUUDRA_TEETH', 'SHARD_KRAKEN'])
  const crimsonEssencePrice = priceCache.get('ESSENCE_CRIMSON') || 0
  const kuudraTeethPrice = priceCache.get('KUUDRA_TEETH') || 0
  const krakenShardPrice = priceCache.get('SHARD_KRAKEN') || 0

  // Ingredients de la Key (achetes) -- buy_price, PAS loadPriceCache (qui ne
  // porte que sell_price) -- meme convention que lib/pluton-forge.ts pour
  // les couts d'ingredients a l'instabuy.
  const since = new Date(Date.now() - 5 * 86_400_000).toISOString().split('T')[0]
  const { data: buyRows } = await supabase
    .from('price_history')
    .select('item_id, buy_price, bucket_date')
    .in('item_id', ['ENCHANTED_RED_SAND', 'CORRUPTED_NETHER_STAR'])
    .gte('bucket_date', since)
    .gt('buy_price', 0)
    .order('bucket_date', { ascending: false })
  const buyCache = new Map<string, number>()
  for (const row of buyRows || []) if (!buyCache.has(row.item_id)) buyCache.set(row.item_id, Number(row.buy_price))
  const ersPrice = buyCache.get('ENCHANTED_RED_SAND') || 0
  const netherStarPrice = buyCache.get('CORRUPTED_NETHER_STAR') || 0

  const results: KuudraResult[] = []
  for (const playerTier of SEVEN_TIER_KEYS) {
    const combatSeconds = computeCombatSeconds(CANNONEER_BY_TIER[playerTier])
    const runsPerHour = 3600 / combatSeconds
    for (const kuudraTier of KUUDRA_TIERS) {
      const loot = GUARANTEED_LOOT[kuudraTier]
      const guaranteedLootValue = loot.crimsonEssence * crimsonEssencePrice + loot.kuudraTeeth * kuudraTeethPrice + loot.krakenShard * krakenShardPrice
      const recipe = KEY_RECIPE[kuudraTier]
      const keyCost = recipe.ers * ersPrice + recipe.netherStar * netherStarPrice + recipe.coins
      const netProfitPerRun = guaranteedLootValue - keyCost
      results.push({
        kuudraTier, playerTier, combatSeconds, runsPerHour,
        guaranteedLootValue, keyCost, netProfitPerRun,
        coinsPerHourBossPhaseOnly: netProfitPerRun * runsPerHour,
      })
    }
  }
  return results
}

export async function computeAndPersistKuudraRankings(): Promise<KuudraResult[]> {
  const results = await computeKuudraRankings()

  const { data: existingBlocks } = await supabase.from('pluton_target_blocks').select('id').eq('activity_key', 'kuudra')
  const existingIds = (existingBlocks || []).map(b => b.id)
  if (existingIds.length > 0) {
    await supabase.from('pluton_rankings').delete().in('target_block_id', existingIds)
    await supabase.from('pluton_setups').delete().eq('activity_key', 'kuudra')
    await supabase.from('pluton_target_blocks').delete().in('id', existingIds)
  }

  const blockByTier = new Map<KuudraTier, number>()
  for (const kuudraTier of KUUDRA_TIERS) {
    const { data: block, error: blockErr } = await supabase
      .from('pluton_target_blocks')
      .insert({
        activity_key: 'kuudra',
        block_id: `KUUDRA_${kuudraTier.toUpperCase()}`,
        block_name: `Kuudra -- ${KUUDRA_TIER_LABEL[kuudraTier]} Tier`,
        block_strength: 0,
        required_breaking_power: 0,
        sell_item_id: 'NONE',
        base_drop_count: 1,
        pricing_note: `Kuudra (${KUUDRA_TIER_LABEL[kuudraTier]}), debloque le 23 aout apres reinvestigation (ancien verdict "ancre de temps introuvable" incomplet). Combat = route Cannoneer, degats canon = %PV max Kuudra + flat (flat ignore, PV absolus non sources, sous-estime legerement) -- rend le temps de combat calculable depuis le setup (Cannon Proficiency/Multi-Shot/Rapid Fire/Steady Aim), tier-invariant en % (meme temps de combat a investissement egal quel que soit le tier Kuudra). coins_per_hour_boss_phase_only = phase de combat SEULEMENT (Phases 1-3 collecte non chronometrees, aucune ancre de temps base 0%-perk trouvee malgre recherche dediee -- meme discipline que le "boss_phase_only" des 5 Slayers). Loot GARANTI uniquement (Crimson Essence+Kuudra Teeth+Kraken Shard, tous 3 reellement tradeables Bazaar/AH) moins cout de Key (Barbarian Emissary) -- pool RNG (armures/accessoires/enchant books) explicitement exclu, gap honnete documente.`,
      })
      .select('id')
      .single()
    if (blockErr || !block) throw new Error(`pluton_target_blocks insert failed for ${kuudraTier}: ${blockErr?.message}`)
    blockByTier.set(kuudraTier, block.id)
  }

  const setupsToInsert = results.map(r => ({
    activity_key: 'kuudra',
    tier: r.playerTier,
    investment_level: 'optimal',
    armor_set_prefix: 'Aucune (route Cannoneer)',
    tool_item_id: 'KUUDRA_CANNON',
    total_mining_speed: 0,
    total_mining_fortune: 0,
    total_breaking_power: 0,
    real_cost: r.keyCost,
    accessories: [{ source_id: '__kuudra__', combat_seconds: r.combatSeconds, guaranteed_loot_value: r.guaranteedLootValue }],
  }))
  const { data: insertedSetups, error: setupErr } = await supabase.from('pluton_setups').insert(setupsToInsert).select('id')
  if (setupErr || !insertedSetups) throw new Error(`pluton_setups insert failed: ${setupErr?.message}`)

  const rankingsToInsert = results.map((r, i) => ({
    activity_key: 'kuudra',
    tier: r.playerTier,
    target_block_id: blockByTier.get(r.kuudraTier)!,
    setup_id: insertedSetups[i].id,
    rank: 1,
    mining_time_seconds: r.combatSeconds,
    actions_per_hour: r.runsPerHour,
    yield_per_hour: r.runsPerHour,
    coins_per_hour_raw_block_only: r.coinsPerHourBossPhaseOnly,
  }))
  const { error: rankErr } = await supabase.from('pluton_rankings').insert(rankingsToInsert)
  if (rankErr) throw new Error(`pluton_rankings insert failed: ${rankErr.message}`)

  return results
}
