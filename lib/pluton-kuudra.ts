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
// Pool RNG Kuudra -- armures (27 aout), ETENDU (31 aout, nuit) au tier
// Infernal + residus (Wheel of Fate/Tentacle Dye/Aurora Staff/Enchanted
// Books/Attribute Shards) -- methode additive independante, meme
// discipline multi-methodes que le RNG Meter Slayer/Sea Creature kills
// (target_blocks *_RNG_POOL dedies, coins/h s'ajoute au loot garanti deja
// persiste, ne le remplace pas).
//
// Decouverte 27 aout : page pluton_elements "Kuudra/Loot" (296 lignes,
// jamais consommee) contient la table de loot COMPLETE par tier avec les
// vrais % de chaque slot. Item_id tier-prefixe confirme reel (pas un
// artefact d'extraction -- app/api/cron/ah-collect/route.ts:112 montre
// base_item_id=item_id brut Hypixel) : Basic="" (aucun prefixe), Hot=HOT_,
// Burning=BURNING_, Fiery=FIERY_, Infernal=INFERNAL_.
//
// **31 aout, nuit -- Infernal et le residu fermes** (agent de recherche
// dedie + wikitext brut relu directement, game_mechanics_misc id=2834) :
// le blocage documente le 27 aout etait un problema de PARSING (le tabber
// Infernal utilise un format wikitext imbrique que l'extraction automatique
// a casse en cellules illisibles dans pluton_elements), PAS une absence de
// source -- le wikitext BRUT lu directement donne la meme semantique
// poids/total que les 4 autres tiers (verifie par recalcul manuel exact :
// Bezal Shard slot1 Infernal = 4.5/97.2 = 4.63% = valeur publiee). Item_id
// residuels tous confirmes reels et prices (items_catalog + attribute_
// shards.bazaar_name) : Aurora Staff=RUNIC_STAFF (nom d'affichage != item_id,
// cause du blocage initial), Wheel of Fate=WHEEL_OF_FATE, Tentacle
// Dye=TENTACLE_DYE, Enchanted Books "Vitality" (alias wiki historique) =
// canonique FEROCIOUS_MANA/HARDENED_MANA/MANA_VAMPIRE/STRONG_MANA (confirme
// enchantments + price_history, memes % par variante a chaque tier),
// Fatal Tempo/Inferno = ENCHANTMENT_ULTIMATE_FATAL_TEMPO_1/_ULTIMATE_
// INFERNO_1, 11 Attribute Shards (SHARD_BEZAL et consorts, table
// attribute_shards.bazaar_name).
//
// Chaque Shard/Enchanted Book/Wheel of Fate apparait sur 2 "Chest Slots"
// independants par tier (ex Bezal Basic : slot1=6.76% + slot2=11.93%) --
// les 2 probabilites sont SOMMEES (2 chances independantes du meme coffre
// de gagner le meme item), pas une erreur de double-compte.
//
// **Scope encore hors de cette passe, documente pas cache** : les items
// Infernal-only du 2e tableau qui n'apparaissent PAS aux 4 autres tiers
// (Ananke Shard/Feather, Hellstorm Wand, Tormentor, Daemon Shard, Lord
// Jawbus Shard, Moltenfish Shard, Cinderbat Shard, Taurus Shard, Dusty
// Travel Scroll, Kuudra Mandible) restent un residu reel non integre --
// necessiteraient une verification de prix individuelle non faite ce soir,
// backlog documente plutot qu'invente.
const KUUDRA_ARMOR_SETS = ['AURORA', 'CRIMSON', 'FERVOR', 'HOLLOW', 'TERROR'] as const
const KUUDRA_ARMOR_PIECES = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'] as const
type KuudraRngTier = 'basic' | 'hot' | 'burning' | 'fiery' | 'infernal'
const KUUDRA_RNG_TIERS: readonly KuudraRngTier[] = ['basic', 'hot', 'burning', 'fiery', 'infernal']
const KUUDRA_RNG_TIER_PREFIX: Record<KuudraRngTier, string> = { basic: '', hot: 'HOT_', burning: 'BURNING_', fiery: 'FIERY_', infernal: 'INFERNAL_' }
// % par piece d'armure (identique pour les 4 pieces d'un meme set, source
// Kuudra/Loot -- Infernal = base "Chance" du wikitext brut, hors variante
// "Wings of Destiny X" non modelisee ailleurs).
const KUUDRA_RNG_ARMOR_PIECE_PCT: Record<KuudraRngTier, number> = { basic: 4.31, hot: 4.06, burning: 3.43, fiery: 3.09, infernal: 2.96 }
// % par accessoire Molten (4 lignes independantes, meme % chacune).
const KUUDRA_RNG_MOLTEN_PCT: Record<KuudraRngTier, number> = { basic: 1.20, hot: 1.27, burning: 1.19, fiery: 1.18, infernal: 1.23 }
// % Hollow Wand ET Aurora Staff -- valeurs IDENTIQUES confirmees aux 5
// tiers (meme poids Infernal=0.7 pour les deux), reutilise pour les deux.
const KUUDRA_RNG_WAND_STAFF_PCT: Record<KuudraRngTier, number> = { basic: 1.05, hot: 0.99, burning: 0.84, fiery: 0.75, infernal: 0.72 }
const KUUDRA_RNG_WHEEL_OF_FATE_PCT: Record<KuudraRngTier, number> = { basic: 0.53, hot: 1.19, burning: 1.25, fiery: 1.40, infernal: 2.68 }
const KUUDRA_RNG_TENTACLE_DYE_PCT: Record<KuudraRngTier, number> = { basic: 0.001, hot: 0.00125, burning: 0.00167, fiery: 0.0025, infernal: 0.005 }
// Enchanted Book "Vitality" (alias wiki historique de Ferocious/Hardened/
// Mana Vampire/Strong Mana) -- 4 variantes, meme % chacune par tier, niveau
// = rang du tier (Basic=I...Infernal=V).
const KUUDRA_RNG_VITALITY_BOOK_PCT: Record<KuudraRngTier, number> = { basic: 21.87, hot: 19.71, burning: 12.81, fiery: 10.47, infernal: 9.62 }
const KUUDRA_VITALITY_BOOK_LEVEL: Record<KuudraRngTier, number> = { basic: 1, hot: 2, burning: 3, fiery: 4, infernal: 5 }
const KUUDRA_VITALITY_ENCHANTS = ['FEROCIOUS_MANA', 'HARDENED_MANA', 'MANA_VAMPIRE', 'STRONG_MANA'] as const
const KUUDRA_RNG_FATAL_TEMPO_PCT: Record<KuudraRngTier, number> = { basic: 0.03, hot: 0.13, burning: 0.16, fiery: 0.18, infernal: 0.22 }
const KUUDRA_RNG_INFERNO_ENCH_PCT: Record<KuudraRngTier, number> = { basic: 0.03, hot: 0.13, burning: 0.16, fiery: 0.18, infernal: 0.22 }
// Attribute Shards -- somme des 2 Chest Slots ou l'item apparait, 0 si le
// shard n'est pas encore debloque a ce tier (source wikitext brut id=2834).
const KUUDRA_RNG_SHARD_PCT: Record<string, Record<KuudraRngTier, number>> = {
  SHARD_BEZAL: { basic: 18.69, hot: 17.11, burning: 12.42, fiery: 10.55, infernal: 9.88 },
  SHARD_MAGMA_SLUG: { basic: 0, hot: 14.26, burning: 10.35, fiery: 8.79, infernal: 8.23 },
  SHARD_KADA_KNIGHT: { basic: 0, hot: 0, burning: 8.41, fiery: 7.15, infernal: 6.70 },
  SHARD_WITHER_SPECTER: { basic: 0, hot: 0, burning: 8.41, fiery: 7.15, infernal: 6.70 },
  SHARD_MATCHO: { basic: 0, hot: 0, burning: 8.41, fiery: 7.15, infernal: 6.70 },
  SHARD_LAVA_FLAME: { basic: 0, hot: 0, burning: 6.90, fiery: 5.86, infernal: 5.48 },
  SHARD_FIRE_EEL: { basic: 0, hot: 0, burning: 0, fiery: 4.45, infernal: 4.16 },
  SHARD_FLARE: { basic: 0, hot: 0, burning: 0, fiery: 4.45, infernal: 4.16 },
  SHARD_BARBARIAN_DUKE_X: { basic: 0, hot: 0, burning: 0, fiery: 4.45, infernal: 4.16 },
  SHARD_HELLWISP: { basic: 0, hot: 0, burning: 0, fiery: 3.64, infernal: 3.40 },
  SHARD_XYZ: { basic: 0, hot: 0, burning: 0, fiery: 2.93, infernal: 2.75 },
}
const KUUDRA_MOLTEN_ITEM_IDS = ['MOLTEN_NECKLACE', 'MOLTEN_CLOAK', 'MOLTEN_BELT', 'MOLTEN_BRACELET']

export async function computeAndPersistKuudraRngPoolRankings(): Promise<{ combos: number; with_ev: number }> {
  const armorItemIds = KUUDRA_RNG_TIERS.flatMap(t =>
    KUUDRA_ARMOR_SETS.flatMap(s => KUUDRA_ARMOR_PIECES.map(p => `${KUUDRA_RNG_TIER_PREFIX[t]}${s}_${p}`))
  )
  const vitalityBookIds = KUUDRA_RNG_TIERS.flatMap(t =>
    KUUDRA_VITALITY_ENCHANTS.map(e => `ENCHANTMENT_${e}_${KUUDRA_VITALITY_BOOK_LEVEL[t]}`)
  )
  const allItemIds = [
    ...armorItemIds, ...KUUDRA_MOLTEN_ITEM_IDS, 'HOLLOW_WAND', 'RUNIC_STAFF', 'WHEEL_OF_FATE', 'TENTACLE_DYE',
    ...vitalityBookIds, 'ENCHANTMENT_ULTIMATE_FATAL_TEMPO_1', 'ENCHANTMENT_ULTIMATE_INFERNO_1',
    ...Object.keys(KUUDRA_RNG_SHARD_PCT),
  ]
  const priceCache = await loadPriceCache(allItemIds)
  const moltenTotal = KUUDRA_MOLTEN_ITEM_IDS.reduce((sum, id) => sum + (priceCache.get(id) || 0), 0)
  const wandPrice = priceCache.get('HOLLOW_WAND') || 0
  const staffPrice = priceCache.get('RUNIC_STAFF') || 0
  const wheelPrice = priceCache.get('WHEEL_OF_FATE') || 0
  const tentacleDyePrice = priceCache.get('TENTACLE_DYE') || 0
  const fatalTempoPrice = priceCache.get('ENCHANTMENT_ULTIMATE_FATAL_TEMPO_1') || 0
  const infernoPrice = priceCache.get('ENCHANTMENT_ULTIMATE_INFERNO_1') || 0

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
    ev += (KUUDRA_RNG_WAND_STAFF_PCT[t] / 100) * wandPrice
    ev += (KUUDRA_RNG_WAND_STAFF_PCT[t] / 100) * staffPrice
    ev += (KUUDRA_RNG_WHEEL_OF_FATE_PCT[t] / 100) * wheelPrice
    ev += (KUUDRA_RNG_TENTACLE_DYE_PCT[t] / 100) * tentacleDyePrice
    ev += (KUUDRA_RNG_FATAL_TEMPO_PCT[t] / 100) * fatalTempoPrice
    ev += (KUUDRA_RNG_INFERNO_ENCH_PCT[t] / 100) * infernoPrice
    for (const enchant of KUUDRA_VITALITY_ENCHANTS) {
      const bookPrice = priceCache.get(`ENCHANTMENT_${enchant}_${KUUDRA_VITALITY_BOOK_LEVEL[t]}`) || 0
      ev += (KUUDRA_RNG_VITALITY_BOOK_PCT[t] / 100) * bookPrice
    }
    for (const [shardId, pctByTier] of Object.entries(KUUDRA_RNG_SHARD_PCT)) {
      const shardPrice = priceCache.get(shardId) || 0
      ev += (pctByTier[t] / 100) * shardPrice
    }
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
        block_name: `Kuudra -- ${KUUDRA_TIER_LABEL[t]} Tier (pool RNG armure + residu)`,
        block_strength: 0,
        required_breaking_power: 0,
        sell_item_id: 'NONE',
        base_drop_count: 1,
        pricing_note: `Pool RNG (27 aout, etendu 31 aout nuit) -- EV=${evByTier.get(t)!.toFixed(0)} coins/run, source wikitext brut Kuudra/Loot (game_mechanics_misc id=2834, ${KUUDRA_TIER_LABEL[t]}). Couvre armure Aurora/Crimson/Fervor/Hollow/Terror (${KUUDRA_RNG_ARMOR_PIECE_PCT[t]}%/piece) + Molten x4 (${KUUDRA_RNG_MOLTEN_PCT[t]}% chacun) + Hollow Wand/Aurora Staff (${KUUDRA_RNG_WAND_STAFF_PCT[t]}% chacun) + Wheel of Fate (${KUUDRA_RNG_WHEEL_OF_FATE_PCT[t]}%) + Tentacle Dye (${KUUDRA_RNG_TENTACLE_DYE_PCT[t]}%) + 4x Enchanted Book Vitality niveau ${KUUDRA_VITALITY_BOOK_LEVEL[t]} (${KUUDRA_RNG_VITALITY_BOOK_PCT[t]}% chacun) + Fatal Tempo/Inferno I (${KUUDRA_RNG_FATAL_TEMPO_PCT[t]}% chacun) + 11 Attribute Shards (% variable par tier, voir KUUDRA_RNG_SHARD_PCT). Residu Infernal-only non integre (Ananke/Hellstorm/Tormentor/Daemon/Lord Jawbus/Moltenfish/Cinderbat/Taurus/Dusty Travel Scroll/Kuudra Mandible) documente, pas invente.`,
      })
      .select('id')
      .single()
    if (blockErr || !block) throw new Error(`Kuudra RNG pool block insert failed for ${t}: ${blockErr?.message}`)
    blockByTier.set(t, block.id)
  }

  let combos = 0
  let withEv = 0
  for (const r of guaranteedResults) {
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
