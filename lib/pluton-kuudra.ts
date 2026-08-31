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

// ============================================================
// Pool RNG Kuudra -- armures (27 aout) -- methode additive independante,
// meme discipline multi-methodes que le RNG Meter Slayer/Sea Creature kills
// (target_blocks *_RNG_POOL dedies, coins/h s'ajoute au loot garanti deja
// persiste, ne le remplace pas).
//
// Decouverte : page pluton_elements "Kuudra/Loot" (296 lignes, jamais
// consommee) contient la table de loot COMPLETE par tier (Basic/Hot/
// Burning/Fiery -- Infernal EXCLU, voir plus bas) avec les vrais % de
// chaque "Chest Slot 1" (armure Aurora/Crimson/Fervor/Hollow/Terror,
// accessoires Molten, Hollow Wand, Tentacle Dye). Verifie ligne par ligne
// contre les 4 sous-tables sequentielles de la page (bornes identifiees
// via l'ancre "1 Kraken Shard slot 5 100%" qui cloture chaque tier).
// Item_id tier-prefixe confirme reel (pas un artefact d'extraction --
// app/api/cron/ah-collect/route.ts:112 montre base_item_id=item_id brut
// Hypixel) : Basic="" (aucun prefixe), Hot=HOT_, Burning=BURNING_,
// Fiery=FIERY_ -- confirme via items_catalog pour les 4 tiers x 5 sets x
// 4 pieces (80 items, presque tous reellement prices AH).
//
// **Scope de cette 1re passe, documente pas cache** : seule l'armure +
// Molten (necklace/cloak/belt/bracelet, item_id UNIQUE et tier-invariant,
// confirme via items_catalog) + Hollow Wand (idem, tier-invariant) sont
// integres -- de tres loin la plus grosse part de l'EV (6M-80M coins/piece
// contre quelques milliers pour les Attribute Shards/Enchanted Books du
// meme pool). Wheel of Fate/Tentacle Dye/Aurora Staff (aucun item_id trouve
// en base malgre la recherche)/Enchanted Books (Ferocious/Hardened/Mana
// Vampire/Strong Mana I-V, Fatal Tempo, Inferno)/Attribute Shards (Bezal/
// Magma Slug/Kada Knight/Wither Specter/Matcho/Lava Flame/Fire Eel/Flare/
// Barbarian Duke X/Hellwisp/XYZ) restent un residu reel non integre --
// backlog documente dans pluton_mechanic_coverage, pas invente.
//
// **Infernal EXCLU explicitement** : la page source bascule vers un format
// de table totalement different (pipe-delimited "Item || qty || pct ||
// chests || chests", semantique de dénominateur non confirmee -- % par
// coffre ouvert toutes tiers confondues ? table generique du site ?) --
// plutot que de deviner la correspondance, le tier Infernal reste sans
// couche RNG armure (gap honnete, meme discipline regle #7).
const KUUDRA_ARMOR_SETS = ['AURORA', 'CRIMSON', 'FERVOR', 'HOLLOW', 'TERROR'] as const
const KUUDRA_ARMOR_PIECES = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'] as const
type KuudraRngTier = 'basic' | 'hot' | 'burning' | 'fiery'
const KUUDRA_RNG_TIERS: readonly KuudraRngTier[] = ['basic', 'hot', 'burning', 'fiery']
const KUUDRA_RNG_TIER_PREFIX: Record<KuudraRngTier, string> = { basic: '', hot: 'HOT_', burning: 'BURNING_', fiery: 'FIERY_' }
// % par piece d'armure (identique pour les 4 pieces d'un meme set, source
// Kuudra/Loot -- ex Basic 4.31%, Hot 4.06%, Burning 3.43%, Fiery 3.09%).
const KUUDRA_RNG_ARMOR_PIECE_PCT: Record<KuudraRngTier, number> = { basic: 4.31, hot: 4.06, burning: 3.43, fiery: 3.09 }
// % par accessoire Molten (4 lignes independantes, meme % chacune).
const KUUDRA_RNG_MOLTEN_PCT: Record<KuudraRngTier, number> = { basic: 1.20, hot: 1.27, burning: 1.19, fiery: 1.18 }
// % Hollow Wand (seul item d'arme avec un item_id reel trouve -- Aurora
// Staff n'existe pas en base malgre la recherche, exclu).
const KUUDRA_RNG_WAND_PCT: Record<KuudraRngTier, number> = { basic: 1.05, hot: 0.99, burning: 0.84, fiery: 0.75 }
const KUUDRA_MOLTEN_ITEM_IDS = ['MOLTEN_NECKLACE', 'MOLTEN_CLOAK', 'MOLTEN_BELT', 'MOLTEN_BRACELET']

export async function computeAndPersistKuudraRngPoolRankings(): Promise<{ combos: number; with_ev: number }> {
  const armorItemIds = KUUDRA_RNG_TIERS.flatMap(t =>
    KUUDRA_ARMOR_SETS.flatMap(s => KUUDRA_ARMOR_PIECES.map(p => `${KUUDRA_RNG_TIER_PREFIX[t]}${s}_${p}`))
  )
  const priceCache = await loadPriceCache([...armorItemIds, ...KUUDRA_MOLTEN_ITEM_IDS, 'HOLLOW_WAND'])
  const moltenTotal = KUUDRA_MOLTEN_ITEM_IDS.reduce((sum, id) => sum + (priceCache.get(id) || 0), 0)
  const wandPrice = priceCache.get('HOLLOW_WAND') || 0

  const evByTier = new Map<KuudraRngTier, number>()
  for (const t of KUUDRA_RNG_TIERS) {
    let ev = 0
    for (const s of KUUDRA_ARMOR_SETS) {
      for (const p of KUUDRA_ARMOR_PIECES) {
        const price = priceCache.get(`${KUUDRA_RNG_TIER_PREFIX[t]}${s}_${p}`) || 0
        ev += (KUUDRA_RNG_ARMOR_PIECE_PCT[t] / 100) * price
      }
    }
    ev += (KUUDRA_RNG_MOLTEN_PCT[t] / 100) * moltenTotal
    ev += (KUUDRA_RNG_WAND_PCT[t] / 100) * wandPrice
    evByTier.set(t, ev)
  }

  // Reutilise runsPerHour deja calcule par computeKuudraRankings() (route
  // Cannoneer, tier-invariant en %) -- pas de recalcul de combat dupliquee.
  const guaranteedResults = await computeKuudraRankings()

  const { data: existingBlocks } = await supabase.from('pluton_target_blocks').select('id').eq('activity_key', 'kuudra').like('block_id', '%_RNG_POOL')
  const existingIds = (existingBlocks || []).map(b => b.id)
  if (existingIds.length > 0) {
    await supabase.from('pluton_rankings').delete().in('target_block_id', existingIds)
    await supabase.from('pluton_setups').delete().eq('activity_key', 'kuudra').contains('accessories', [{ source_id: '__kuudra_armor_rng_pool__' }])
    await supabase.from('pluton_target_blocks').delete().in('id', existingIds)
  }

  const blockByTier = new Map<KuudraRngTier, number>()
  for (const t of KUUDRA_RNG_TIERS) {
    const { data: block, error: blockErr } = await supabase
      .from('pluton_target_blocks')
      .insert({
        activity_key: 'kuudra',
        block_id: `KUUDRA_${t.toUpperCase()}_RNG_POOL`,
        block_name: `Kuudra -- ${KUUDRA_TIER_LABEL[t]} Tier (pool RNG armure)`,
        block_strength: 0,
        required_breaking_power: 0,
        sell_item_id: 'NONE',
        base_drop_count: 1,
        pricing_note: `Pool RNG armure (27 aout) -- EV=${evByTier.get(t)!.toFixed(0)} coins/run, source page Kuudra/Loot (296 lignes, ${KUUDRA_TIER_LABEL[t]}). Couvre armure Aurora/Crimson/Fervor/Hollow/Terror (${KUUDRA_RNG_ARMOR_PIECE_PCT[t]}%/piece) + Molten necklace/cloak/belt/bracelet (${KUUDRA_RNG_MOLTEN_PCT[t]}% chacun) + Hollow Wand (${KUUDRA_RNG_WAND_PCT[t]}%). Residu non integre (Wheel of Fate/Tentacle Dye/Aurora Staff/Enchanted Books/Attribute Shards) documente dans pluton_mechanic_coverage -- backlog reel, pas invente.`,
      })
      .select('id')
      .single()
    if (blockErr || !block) throw new Error(`Kuudra RNG pool block insert failed for ${t}: ${blockErr?.message}`)
    blockByTier.set(t, block.id)
  }

  let combos = 0
  let withEv = 0
  for (const r of guaranteedResults) {
    if (r.kuudraTier === 'infernal') continue // gap honnete, voir commentaire d'en-tete
    const ev = evByTier.get(r.kuudraTier as KuudraRngTier) || 0
    const coinsPerHour = ev * r.runsPerHour

    const { data: setupRow, error: setupErr } = await supabase
      .from('pluton_setups')
      .insert({
        activity_key: 'kuudra',
        tier: r.playerTier,
        investment_level: 'optimal',
        armor_set_prefix: `Aucune (pool RNG armure Kuudra ${KUUDRA_TIER_LABEL[r.kuudraTier]})`,
        tool_item_id: 'KUUDRA_CANNON',
        total_mining_speed: 0,
        total_mining_fortune: 0,
        total_breaking_power: 0,
        real_cost: 0,
        accessories: [{ source_id: '__kuudra_armor_rng_pool__', kuudra_tier: r.kuudraTier, ev_per_run: ev }],
      })
      .select('id').single()
    if (setupErr || !setupRow) throw new Error(`Kuudra RNG pool setup insert failed for ${r.playerTier}/${r.kuudraTier}: ${setupErr?.message}`)

    const { error: rankErr } = await supabase
      .from('pluton_rankings')
      .insert({
        activity_key: 'kuudra',
        tier: r.playerTier,
        target_block_id: blockByTier.get(r.kuudraTier as KuudraRngTier)!,
        setup_id: setupRow.id,
        rank: 1,
        mining_time_seconds: r.combatSeconds,
        actions_per_hour: r.runsPerHour,
        yield_per_hour: r.runsPerHour,
        coins_per_hour_raw_block_only: coinsPerHour,
      })
    if (rankErr) throw new Error(`Kuudra RNG pool ranking insert failed for ${r.playerTier}/${r.kuudraTier}: ${rankErr.message}`)

    combos++
    if (ev > 0) withEv++
  }

  return { combos, with_ev: withEv }
}
