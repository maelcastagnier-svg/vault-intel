// app/api/cron/setup-generate-agent/route.ts
// Génère tous les setups — lundi 7h UTC (après money-making-agent à 6h)
// Haiku + prompt caching — ~0.04€/semaine
// Claude fournit du TEXTE uniquement — le visuel est géré par React
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TIER_CONFIG } from '../../../../lib/money-making-constants'
import { buildVariantKeys, ULTIMATE_ENCHANTS, type DecodedItem } from '../../../../lib/skyblock-item-decoder'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Catalogue d'items réels, prix réels — évite le hallucinated gear ──
// item_stats = vrais stat blocks Hypixel (item_id/category/health/defense/
// strength/crit_damage/crit_chance/intelligence/speed), confirmé via
// skyblock-resources-sync/route.ts. price_history_ah = prix AH réel le plus
// récent (moyenne toutes variantes, DAILY, __all_variants_blended__).
// Jointure faite en JS (item_id commun aux deux tables).
type PricedItem = {
  item_id: string; display_name: string; category: string; rarity: string | null
  health: number; defense: number; strength: number
  crit_damage: number; crit_chance: number; intelligence: number; speed: number
  price: number
  default_color: string | null
}

export async function loadPricedItems(): Promise<PricedItem[]> {
  const since = new Date(Date.now() - 4 * 86_400_000).toISOString().split('T')[0]

  const [{ data: stats }, { data: prices }] = await Promise.all([
    supabase.from('item_stats')
      .select('item_id, display_name, category, rarity, health, defense, strength, crit_damage, crit_chance, intelligence, speed, default_color'),
    supabase.from('price_history_ah')
      .select('base_item_id, avg_price, bucket_date')
      .eq('variant_key', '__all_variants_blended__')
      .eq('granularity', 'DAILY')
      .gte('bucket_date', since)
      .gt('avg_price', 0)
      .order('bucket_date', { ascending: false }),
  ])

  // Le prix le plus récent par item (premier vu, puisque trié desc par date)
  const latestPrice = new Map<string, number>()
  for (const p of prices || []) {
    if (!latestPrice.has(p.base_item_id)) latestPrice.set(p.base_item_id, Number(p.avg_price))
  }

  return (stats || [])
    .filter(s => latestPrice.has(s.item_id))
    .map(s => ({
      item_id:      s.item_id,
      display_name: s.display_name,
      category:     s.category || 'OTHER',
      rarity:       s.rarity || null,
      health:       s.health       || 0,
      defense:      s.defense      || 0,
      strength:     s.strength     || 0,
      crit_damage:  s.crit_damage  || 0,
      crit_chance:  s.crit_chance  || 0,
      intelligence: s.intelligence || 0,
      speed:        s.speed        || 0,
      price:        latestPrice.get(s.item_id)!,
      default_color: s.default_color || null,
    }))
}

// Filtre par bande de budget du tier + score de puissance brut (proxy simple,
// pas une formule de jeu officielle — sert juste à trier, pas à afficher).
// Bande large (budget/25 → budget×3) pour inclure du budget jusqu'au BiS,
// sans laisser un tier bas polluer le catalogue d'un tier haut (ex: Mithril,
// prix réel bien sous le plancher LATE, n'apparaît jamais dans ce catalogue-là).
export function gearCatalogForBudget(priced: PricedItem[], maxGearCost: number): string {
  const minPrice = maxGearCost / 25
  const maxPrice = maxGearCost * 3

  // NOTE: item_stats.health/defense/strength/... est réel mais souvent 0 pour
  // les items endgame complexes (armures Kuudra, items Divan...) — Hypixel ne
  // remplit ce champ que pour les items à stats plates simples, pas ceux dont
  // le vrai stat vient de la génération/reforge/étoiles. Vérifié en base sur
  // Crown of Avarice/Hyperion/Infernal Crimson Chestplate : les trois à 0 alors
  // que ce sont de vraies pièces BiS statées. Afficher ces zéros au modèle
  // serait une fausse information (donnerait l'impression que ces items n'ont
  // aucun stat) — on ne montre donc QUE le prix réel (fiable) et on trie par
  // prix décroissant, jamais par un score dérivé de colonnes dont on sait
  // qu'elles sont creuses ici.
  const rows = priced
    .filter(s => s.price >= minPrice && s.price <= maxPrice)
    .sort((a, b) => b.price - a.price)
    .slice(0, 60)

  if (rows.length === 0) {
    return '=== REAL GEAR CATALOG (priced, in-budget) ===\nNo priced item found in this budget band — rely on the wiki sections above only, and mark confidence LOW on any specific item name you are not certain still exists.'
  }

  return '=== REAL GEAR CATALOG (actual traded items, current AH price, filtered to this tier\'s budget, sorted highest price first) ===\n' +
    rows.map(s => `${s.item_id} "${s.display_name}" [${s.category}] price=${Math.round(s.price).toLocaleString()}`).join('\n')
}

// ── Coût réel calculé en code, jamais laissé à Claude ──────────
// Testé en vrai (LATE-tier Gemstone Mining) : même avec une règle de prompt
// explicite demandant de sommer les prix du catalogue, Haiku continue de
// sortir un chiffre habituel proche de coins_display (ex: "95-110M" alors que
// Divan's Drill seul vaut 1.86B dans le catalogue montré) — reproduit 2 fois
// de suite. Un LLM rapide/pas cher ne fait pas fiablement cette arithmétique
// en texte libre. On calcule donc le coût nous-mêmes après génération, en
// matchant les noms d'items renvoyés par Claude contre le catalogue prix réel
// — Claude ne touche plus jamais ce chiffre.
function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function significantWords(s: string): string[] {
  return normalizeText(s).split(' ').filter(w => w.length >= 3)
}

// weapon_name/tool/rod nomment un item précis -> on exige que TOUS ses mots
// significatifs apparaissent comme mots entiers dans le texte (pas une
// sous-chaîne : "Hyper Cleaver" ne doit jamais matcher "Hyperion", "hyper"
// n'est pas un mot entier de "hyperion").
function matchesExact(displayName: string, freeText: string): boolean {
  const words = significantWords(displayName)
  if (words.length === 0) return false
  const targetWords = new Set(significantWords(freeText))
  return words.every(w => targetWords.has(w))
}

// armor_set nomme le SET, pas la pièce ("Infernal Crimson Armor") -- son mot
// de type (Helmet/Chestplate/...) est donc censé être absent du texte. On le
// retire via la vraie `category` de l'item (donnée réelle), jamais en devinant
// "le dernier mot".
//
// Pas un cutoff fixe sur le nombre de mots restants -- testé en vrai et ça
// casse dans les deux sens : exiger 2+ mots rejette à tort les vrais sets à
// un seul mot distinctif ("Sorrow Helmet"/"Sorrow Armor", confirmé réel et
// pricé dans le catalogue, matchedCount tombait à 0) ; n'exiger qu'1 mot fait
// remonter le faux positif d'origine ("Crimson Helmet" ~4M T1 matchant à tort
// "Infernal Crimson Armor" T5, la vraie pièce visée étant Infernal Crimson
// Helmet ~500M). La vraie distinction n'est pas la LONGUEUR du préfixe mais
// sa SPÉCIFICITÉ relative : par catégorie de pièce, ne garder que le(s)
// item(s) dont le préfixe est un sous-ensemble de mots du texte ET qui n'a
// pas de concurrent avec un préfixe plus long/plus spécifique dans la même
// catégorie -- "Infernal Crimson Helmet" (2 mots) bat "Crimson Helmet"
// (1 mot) quand les deux matchent le même texte ; "Sorrow Helmet" (1 mot)
// reste seul candidat pour "Sorrow Armor" et gagne donc par défaut.
const ARMOR_PIECE_CATEGORIES = new Set(['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'])
const ARMOR_TYPE_WORDS       = new Set(['helmet', 'chestplate', 'leggings', 'boots'])

// item_stats.default_color (real Hypixel-assigned leather dye color, from
// NEU-REPO's items/{id}.json -- see armor-color-sync) attached per matched
// piece's real category, not guessed -- null whenever the real matched item
// isn't LEATHER_* (skull-reskinned helmets, or other-material sets like
// Revenant Armor's diamond_chestplate base), which the renderer already
// falls back to the vanilla placeholder color for.
const ARMOR_COLOR_FIELD: Record<string, string> = {
  HELMET:     'armor_helmet_color',
  CHESTPLATE: 'armor_chestplate_color',
  LEGGINGS:   'armor_leggings_color',
  BOOTS:      'armor_boots_color',
}

function armorPiecePrefixWords(item: PricedItem): string[] {
  return significantWords(item.display_name).filter(w => !ARMOR_TYPE_WORDS.has(w))
}

// Retourne, pour chaque catégorie de pièce (HELMET/CHESTPLATE/LEGGINGS/BOOTS),
// le meilleur item candidat pour armorSetText -- ou rien si aucun ne matche.
export function bestArmorPiecesForSet(priced: PricedItem[], armorSetText: string): PricedItem[] {
  const targetWords = new Set(significantWords(armorSetText))
  const bestByCategory = new Map<string, { item: PricedItem; specificity: number }>()

  for (const item of priced) {
    if (!ARMOR_PIECE_CATEGORIES.has(item.category)) continue
    const words = armorPiecePrefixWords(item)
    if (words.length === 0) continue
    if (!words.every(w => targetWords.has(w))) continue

    const current = bestByCategory.get(item.category)
    if (!current || words.length > current.specificity) {
      bestByCategory.set(item.category, { item, specificity: words.length })
    }
  }

  return Array.from(bestByCategory.values()).map(v => v.item)
}

function formatCoins(n: number): string {
  if (n >= 1_000_000_000) {
    const b = n / 1_000_000_000
    return (b >= 10 ? b.toFixed(0) : b.toFixed(1).replace(/\.0$/, '')) + 'B'
  }
  return Math.round(n / 1_000_000) + 'M'
}

// ── Prix précis par variante exacte ────────────────────────────
// Money Making recommande une pièce PRÉCISE (étoiles/reforge/hot potato/
// ultimate enchant choisis par Claude et justifiés dans le prompt), pas un
// exemplaire scanné réel — il n'y a donc pas de vrai blob NBT à décoder.
// On construit quand même la MÊME clé de variante qu'un item scanné aurait
// (buildVariantKeys, importée du décodeur AH — jamais réimplémentée en
// parallèle, pour ne jamais diverger de la logique déjà validée sur les
// vraies données) et on la requête contre price_history_ah_variants (prix
// exact) puis price_history_ah_variant_base (prix du groupe base, un cran
// moins précis) — jamais un prix inventé, toujours une vraie ligne AH ou
// le prix blended du catalogue en dernier recours.
type GearSpec = { stars: number; recomb: boolean; reforge: string | null; hotPotato: number; ultimateEnchant: string | null }

export function specVariantKeys(spec: GearSpec) {
  const base: Omit<DecodedItem, 'variant_key_full' | 'variant_key_base'> = {
    item_id: '', item_name: '', item_uuid: null, item_origin: null, item_skin: null,
    total_stars: Math.max(0, Math.min(5, spec.stars || 0)), master_stars: 0,
    is_recomb: !!spec.recomb,
    hot_potato_count: spec.hotPotato || 0, art_of_war_count: 0, art_of_peace_count: 0,
    wood_singularity: 0, transmitted_count: 0, mana_disintegrator: 0, silex_applied: false,
    reforge: spec.reforge ? spec.reforge.toLowerCase() : null,
    enchantments: {}, ultimate_enchant: spec.ultimateEnchant, ultimate_level: spec.ultimateEnchant ? 1 : null,
    gems: {}, gems_summary: '',
    attributes: {}, attribute_1: null, attribute_1_level: null, attribute_2: null, attribute_2_level: null,
    has_dye: false, dye_item: null, item_count: 1,
  }
  return buildVariantKeys(base)
}

export async function lookupPreciseVariantPrice(itemId: string, keys: { variant_key_full: string; variant_key_base: string }, spec: GearSpec): Promise<{ price: number; precision: 'exact' | 'base' | 'broad' } | null> {
  const { data: exact } = await supabase.from('price_history_ah_variants')
    .select('avg_price, bucket_date')
    .eq('base_item_id', itemId).eq('variant_key', keys.variant_key_full)
    .gt('avg_price', 0).order('bucket_date', { ascending: false }).limit(1).maybeSingle()
  if (exact?.avg_price) return { price: Number(exact.avg_price), precision: 'exact' }

  const { data: baseRow } = await supabase.from('price_history_ah_variant_base')
    .select('avg_price, bucket_date')
    .eq('base_item_id', itemId).eq('variant_key_base', keys.variant_key_base)
    .gt('avg_price', 0).order('bucket_date', { ascending: false }).limit(1).maybeSingle()
  if (baseRow?.avg_price) return { price: Number(baseRow.avg_price), precision: 'base' }

  // Troisième palier, plus large : étoiles+recomb seulement, en ignorant
  // reforge/ultimate/hot potato. Trouvé en testant en vrai (Infernal Crimson
  // Helmet) : les VRAIS exemplaires scannés sur l'AH portent quasi toujours
  // un ultimate enchant (ex "habanero_tactics5", l'ultimate signature du set
  // Wither) même quand notre spec hypothétique en laisse volontairement
  // (armor_ultimate_enchant=null pour "la plupart des setups") -- la clé
  // exacte/base ne matche donc jamais rien pour ce genre d'item, pas par bug
  // mais parce que ce variant précis n'existe simplement pas en pratique.
  // Moyenne pondérée par data_points (même logique que price_history_ah_variant_base
  // lui-même) sur toutes les lignes partageant juste étoiles+recomb.
  const starStr   = spec.stars > 0 ? `${Math.min(5, spec.stars)}star` : 'nostar'
  const recombStr = spec.recomb ? 'recomb' : 'norecomb'
  const { data: broadRows } = await supabase.from('price_history_ah_variant_base')
    .select('avg_price, data_points')
    .eq('base_item_id', itemId)
    .like('variant_key_base', `${starStr}_${recombStr}%`)
    .gt('avg_price', 0).order('bucket_date', { ascending: false }).limit(20)
  if (broadRows && broadRows.length > 0) {
    let weightedSum = 0, weightTotal = 0
    for (const row of broadRows) {
      const w = Number(row.data_points) || 1
      weightedSum += Number(row.avg_price) * w
      weightTotal += w
    }
    if (weightTotal > 0) return { price: weightedSum / weightTotal, precision: 'broad' }
  }

  return null
}

function gearSpecFromSetup(setup: any, prefix: 'armor' | 'weapon'): GearSpec {
  const ultimateRaw = setup[`${prefix}_ultimate_enchant`]
  return {
    stars:           Number(setup[`${prefix}_stars`]) || 0,
    recomb:          !!setup[`${prefix}_recomb`],
    reforge:         typeof setup[`${prefix}_reforge`] === 'string' ? setup[`${prefix}_reforge`] : null,
    hotPotato:       Number(setup[`${prefix}_hot_potato_count`]) || 0,
    ultimateEnchant: ULTIMATE_ENCHANTS.has(ultimateRaw) ? ultimateRaw : null,
  }
}

// Calcule et écrase cost_budget/cost_optimal/cost_endgame en code, jamais
// laissé à Claude (testé 2 fois en LATE Gemstone Mining : même avec une
// règle de prompt explicite, Haiku continue de sortir un chiffre habituel
// proche de coins_display plutôt que de sommer les vrais prix montrés).
export async function applyPreciseCost(setup: any, priced: PricedItem[]): Promise<void> {
  const matchedIds = new Set<string>()
  const matched: { item_id: string; display_name: string; price: number; precision: string }[] = []
  let total = 0

  const addMatch = (item: PricedItem, price: number, precision: string) => {
    if (matchedIds.has(item.item_id)) return
    matchedIds.add(item.item_id)
    matched.push({ item_id: item.item_id, display_name: item.display_name, price, precision })
    total += price
  }

  // Rareté attachée directement sur le setup (jamais devinée côté frontend) --
  // vraie valeur `tier` Hypixel via item_stats.rarity, prise sur le premier
  // item matché par slot.
  if (setup.armor_set) {
    const spec = gearSpecFromSetup(setup, 'armor')
    const keys = specVariantKeys(spec)
    for (const item of bestArmorPiecesForSet(priced, setup.armor_set)) {
      if (!setup.armor_rarity && item.rarity) setup.armor_rarity = item.rarity
      const colorField = ARMOR_COLOR_FIELD[item.category]
      if (colorField && item.default_color) setup[colorField] = item.default_color
      const precise = await lookupPreciseVariantPrice(item.item_id, keys, spec)
      addMatch(item, precise?.price ?? item.price, precise?.precision ?? 'blended')
    }
  }

  if (setup.weapon_name) {
    const spec = gearSpecFromSetup(setup, 'weapon')
    const keys = specVariantKeys(spec)
    for (const item of priced) {
      if (!matchesExact(item.display_name, setup.weapon_name)) continue
      if (!setup.weapon_rarity && item.rarity) setup.weapon_rarity = item.rarity
      const precise = await lookupPreciseVariantPrice(item.item_id, keys, spec)
      addMatch(item, precise?.price ?? item.price, precise?.precision ?? 'blended')
    }
  }

  // Tool/rod restent sur le prix blended du catalogue -- ce sont des chaînes
  // multi-composants (drill + fuel tank + engine), hors périmètre du
  // pricing par variante précise pour cette passe.
  if (setup.tool) {
    for (const item of priced) {
      if (!matchesExact(item.display_name, setup.tool)) continue
      if (!setup.tool_rarity && item.rarity) setup.tool_rarity = item.rarity
      addMatch(item, item.price, 'blended')
    }
  }
  if (setup.rod) {
    for (const item of priced) {
      if (!matchesExact(item.display_name, setup.rod)) continue
      if (!setup.rod_rarity && item.rarity) setup.rod_rarity = item.rarity
      addMatch(item, item.price, 'blended')
    }
  }

  if (matchedIds.size === 0) return
  const exactCount  = matched.filter(m => m.precision === 'exact').length
  const baseCount   = matched.filter(m => m.precision === 'base').length
  const broadCount  = matched.filter(m => m.precision === 'broad').length
  const preciseCount = exactCount + baseCount + broadCount // toutes des vraies lignes AH, pas le blended
  setup.cost_budget  = `~${formatCoins(total * 0.75)} — cheaper rolls of the same real gear (fewer stars, no recomb)`
  setup.cost_optimal = `~${formatCoins(total)} — real AH price of the named spec (${matchedIds.size} item${matchedIds.size > 1 ? 's' : ''} matched, ${preciseCount} from real variant data${exactCount ? `, ${exactCount} exact` : ''})`
  setup.cost_endgame = `~${formatCoins(total * 1.4)} — recombobulated/5★ premium rolls of the same gear`
}

// ── Clé unique identique entre agent et route ─────────────────
export function methodKey(method: any): string {
  return (method.id || method.method || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80)
}

// ── Parse JSON Claude robuste ────────────────────────────────
function parseJSON(text: string): any {
  const clean = text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()
  return JSON.parse(clean)
}

// ── Contexte wiki — construit UNE FOIS, mis en cache ────────
export function buildWikiContext(ctx: any): string {
  const wiki = (items: any[], n: number) =>
    (items || []).map((w: any) => `[${w.key}]\n${(w.content || '').slice(0, n)}`).join('\n\n')

  return [
    '=== ARMOR SETS ===',      wiki(ctx?.wiki_armor_sets, 1000),
    '\n=== WEAPONS ===',       wiki(ctx?.wiki_weapons, 600),
    '\n=== SLAYERS ===',       wiki(ctx?.wiki_slayers, 1200),
    '\n=== KUUDRA ===',        wiki(ctx?.wiki_kuudra, 800),
    '\n=== DUNGEONS ===',      wiki(ctx?.wiki_dungeons, 600),
    '\n=== MINING ===',        wiki(ctx?.wiki_mining, 800),
    '\n=== FISHING ===',       wiki(ctx?.wiki_fishing, 600),
    '\n=== FARMING ===',       wiki(ctx?.wiki_farming, 500),
    '\n=== PETS ===',          wiki(ctx?.wiki_pets, 400),
    '\n=== ENCHANTMENTS ===',
    (ctx?.enchantments || []).map((e: any) =>
      `${e.name}[${(e.item_types || []).join(',')}]max=${e.max_level}`
    ).join(' | '),
    '\n=== REFORGES ===',
    (ctx?.reforges || []).map((r: any) =>
      `${r.reforge_name}(${r.item_types}):${JSON.stringify(r.stats)}`
    ).join(' | '),
  ].join('\n')
}

export const GROUNDING_RULES = `
=== GROUNDING RULES (mandatory) ===
- armor_set, weapon_name, tool, rod, and accessories MUST be picked from the REAL GEAR CATALOG below when a matching item exists there for that slot/activity. The catalog is already filtered to this tier's real budget band using actual current AH prices — never override it with a cheaper or more expensive item from memory (e.g. never suggest an old low-tier armor set for a tier whose budget clearly reaches the catalog's top entries, and never suggest a BiS item priced far above this tier's budget).
- The catalog has NO stat columns (health/defense/etc are unreliable for endgame gear in our data and were deliberately removed) — never invent specific numbers for armor_stats/weapon_stats/target_stats either; keep those fields qualitative (e.g. "High DEF, moderate STR") or omit precise numbers you cannot source from the WIKI text above.
- armor_reforge/weapon_reforge must be copied verbatim from the REFORGES list below — never invent a reforge name, never leave it as a vague word like "Epic" (that's a rarity, not a reforge). armor_ultimate_enchant/weapon_ultimate_enchant must be one of the exact IDs listed in the user prompt, or null.
- cost_budget / cost_optimal / cost_endgame are computed in code from the exact spec you give (stars/reforge/hot potato/ultimate enchant), not by you — do not try to compute a number for these fields yourself, any value you write here will be overwritten.
- pet_name and gemstones are not in this catalog — use the WIKI sections above for those, and if still uncertain, mark confidence implicitly by keeping the recommendation generic rather than naming an ultra-specific variant you're not sure exists.
- If the catalog says "No priced item found in this budget band", do not invent a specific item — describe the setup at the archetype level (e.g. "best available T4 mining armor") instead of naming an unverified item.
`

const ULTIMATE_ENCHANT_LIST = Array.from(ULTIMATE_ENCHANTS).join(', ')

// ── Prompt utilisateur (le wiki est dans le system caché) ────
function buildUserPrompt(method: any, tier: string): string {
  const n = (method.method || '').toLowerCase()
  const isSlayer  = n.includes('slayer')
  const isMining  = method.skill === 'mining' || n.includes('mining') || n.includes('glacite') || n.includes('crystal')
  const isFishing = method.skill === 'fishing' || n.includes('fishing') || n.includes('thunder')
  const isDungeon = /dungeon|floor|master|catacombs/.test(n)
  const isKuudra  = n.includes('kuudra')

  return `Generate compact setup for: "${method.method}" (${tier.toUpperCase()}, ${method.coins_display || ''})
${method.key_drops ? 'DROPS: ' + method.key_drops : ''}
${method.the_edge  ? 'EDGE: '  + method.the_edge  : ''}
${method.why_best  ? 'WHY: '   + method.why_best  : ''}

SLAYER MAX TIERS: Zombie T5 | Spider T4 | Wolf T4 | Enderman T4 (T5 DOES NOT EXIST) | Blaze T5 | Vampire T5

You must pick a PRECISE, JUSTIFIED spec for the armor and the weapon — not just a name.
armor_reforge/weapon_reforge MUST be copied verbatim (exact spelling) from the REFORGES list in the system context — never invent a reforge name.
armor_ultimate_enchant/weapon_ultimate_enchant MUST be exactly one of: ${ULTIMATE_ENCHANT_LIST} — or null if none fits. Only recommend an ultimate enchant when it clearly serves this tier's target stat and stays within budget; most setups should leave this null.
armor_hot_potato_count/weapon_hot_potato_count: 0, 5, or 10 — 10 (fuming) only for END/LATE tiers where the budget supports it.
gear_justification explains WHY these specific stars/reforge/enchant choices serve this method's actual target stat (e.g. "5-star Pure for max DEF/HP survivability" or "Ancient reforge for the STR breakpoint needed at this tier") — never a generic restatement of the item name.

Return ONLY raw JSON (no backticks, no explanation):
{
  "how_to": "2-3 sentences: exact steps to execute this method",
  "why_best": "1 sentence: why optimal at this tier",
  "armor_set": "Name",
  "armor_stars": 5,
  "armor_recomb": true,
  "armor_reforge": "exact reforge_name from REFORGES list",
  "armor_hot_potato_count": 10,
  "armor_ultimate_enchant": null,
  "armor_stats": "HP X | DEF X | STR X | CD X%",
  "armor_bonus": "Set bonus: short effect",
  "weapon_name": "Name",
  "weapon_stars": 5,
  "weapon_recomb": true,
  "weapon_reforge": "exact reforge_name from REFORGES list",
  "weapon_hot_potato_count": 10,
  "weapon_ultimate_enchant": null,
  "weapon_stats": "STR +X | CD +X%",
  "weapon_ability": "Ability: key mechanic",${isMining ? '\n  "tool": "DrillName + FuelTank + Engine",' : ''}${isFishing ? '\n  "rod": "RodName + line type",' : ''}
  "gear_justification": "2-3 sentences: why this exact combination of stars/reforge/enchant serves the tier's target stat",
  "pet_name": "Name",
  "pet_level": 100,
  "pet_rarity": "LEGENDARY",
  "pet_bonus": "Exact bonus: +X% or specific effect",
  "pet_alt": "Budget alternative name",
  "mp_target": 900,
  "power_stone": "Stone name",
  "accessories": ["Item1", "Item2", "Item3", "Item4", "Item5"],
  "enchants_weapon": ["Enchant V", "Enchant III"],
  "enchants_armor": ["Growth V", "Protection V"],${isMining ? '\n  "enchants_tool": ["Compact I", "Efficiency V"],' : ''}${isFishing ? '\n  "enchants_rod": ["Angler V", "Luck of the Sea V"],' : ''}
  "gemstones": "Weapon: Gem(stat) | Armor: Gem(stat)",
  "reforges": "Weapon: Name | Armor: Name",
  "target_stats": "STR X+ | CD X%+ | DEF X+ | HP X+${isMining ? ' | Mining Speed X+ | Fortune X+' : ''}${isFishing ? ' | SCC X%+' : ''}",
  "requirements": "Skills X+. Slayer X. Other requirements.",
  "cost_budget": "X-YM — what you compromise",
  "cost_optimal": "A-BM — full setup",
  "cost_endgame": "C-DB — BiS",
  "location": "Exact zone + spot"${isSlayer ? ',\n  "strategy": "Boss tier + spawn + rotation. 2 sentences."' : ''}${isDungeon || isKuudra ? ',\n  "team_config": "Class + role + floor/tier + key mechanic. 2 sentences."' : ''}${isMining ? ',\n  "hotm_perks": "Key perks. Powder priority."' : ''}
}`
}

// ── Génère et sauvegarde un setup ───────────────────────────
export async function generateOne(
  method:      any,
  tier:        string,
  wikiContext: string,
  pricedItems: PricedItem[] = []
): Promise<boolean> {
  const key = methodKey(method)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: [{
          type:          'text',
          text:          wikiContext,
          cache_control: { type: 'ephemeral' },
        }],
        messages: [{ role: 'user', content: buildUserPrompt(method, tier) }],
      }),
    })

    if (!res.ok) throw new Error(`Claude ${res.status}`)
    const data  = await res.json()
    const setup = parseJSON(data.content?.[0]?.text || '')

    await applyPreciseCost(setup, pricedItems)

    await supabase.from('method_setups').upsert(
      { method_key: key, tier, setup: JSON.stringify(setup), generated_at: new Date().toISOString() },
      { onConflict: 'method_key, tier' }
    )
    return true
  } catch (e: any) {
    console.error(`Setup failed [${tier}/${key}]:`, e.message)
    return false
  }
}

// ── Handler ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: analyses } = await supabase
    .from('claude_analysis')
    .select('section, content')
    .like('section', 'money_making_%')

  if (!analyses?.length) {
    return NextResponse.json({ error: 'No methods in DB — run money-making-agent first' }, { status: 400 })
  }

  const [{ data: ctx }, pricedItems] = await Promise.all([
    supabase.rpc('get_full_context'),
    loadPricedItems(),
  ])
  const baseWikiContext = buildWikiContext(ctx) + '\n' + GROUNDING_RULES

  let ok = 0, fail = 0

  for (const analysis of analyses) {
    const tier = analysis.section.replace('money_making_', '') as keyof typeof TIER_CONFIG
    let tierData: any
    try { tierData = JSON.parse(analysis.content) } catch { continue }

    const methods: any[] = [...(tierData.active || []), ...(tierData.vault || [])]

    const tierConfig = TIER_CONFIG[tier]
    // Contexte système spécifique au tier (wiki partagé + catalogue budgé) —
    // cache actif dès le 2e appel du MÊME tier, pas across-tier (le catalogue
    // change de bande de prix par tier, donc le cache ne peut pas être partagé
    // au-delà d'un tier sans réintroduire le risque de gear hors-budget).
    const wikiContext = tierConfig
      ? baseWikiContext + '\n\n' + gearCatalogForBudget(pricedItems, tierConfig.max_gear_cost)
      : baseWikiContext

    // Batch de 3 parallèles — même wikiContext → cache actif dès le 2e appel
    for (let i = 0; i < methods.length; i += 3) {
      const batch   = methods.slice(i, i + 3)
      const results = await Promise.all(batch.map(m => generateOne(m, tier, wikiContext, pricedItems)))
      results.forEach(r => r ? ok++ : fail++)
    }
  }

  return NextResponse.json({ success: true, generated: ok, failed: fail, model: 'haiku-4-5', cached_context: 'per-tier' })
}