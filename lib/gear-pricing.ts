// lib/gear-pricing.ts
// Shared gear-matching/pricing utilities -- extracted verbatim from
// app/api/cron/setup-generate-agent/route.ts (Money Making's precise-gear
// pipeline, already validated in production: real catalog matching, real
// per-piece color/rarity attachment, real AH variant pricing) so
// lib/skill-setup-adapter.ts (Evolve Skills target rendering) can reuse the
// exact same logic instead of a parallel reimplementation that could drift.
// setup-generate-agent/route.ts now imports from here too -- no duplication
// in either direction.
import { createClient } from '@supabase/supabase-js'
import { buildVariantKeys, ULTIMATE_ENCHANTS, type DecodedItem } from './skyblock-item-decoder'
import { type ActivityGearCategories } from './activity-gear'

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
export type PricedItem = {
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
export function matchesExact(displayName: string, freeText: string): boolean {
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
export const ARMOR_COLOR_FIELD: Record<string, string> = {
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

export function formatCoins(n: number): string {
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
export type GearSpec = { stars: number; recomb: boolean; reforge: string | null; hotPotato: number; ultimateEnchant: string | null }

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

export function gearSpecFromSetup(setup: any, prefix: 'armor' | 'weapon'): GearSpec {
  const ultimateRaw = setup[`${prefix}_ultimate_enchant`]
  return {
    stars:           Number(setup[`${prefix}_stars`]) || 0,
    recomb:          !!setup[`${prefix}_recomb`],
    reforge:         typeof setup[`${prefix}_reforge`] === 'string' ? setup[`${prefix}_reforge`] : null,
    hotPotato:       Number(setup[`${prefix}_hot_potato_count`]) || 0,
    ultimateEnchant: ULTIMATE_ENCHANTS.has(ultimateRaw) ? ultimateRaw : null,
  }
}

// ── Activity-scoped weapon/tool catalog (Phase 1 game knowledge base) ──────
// Shared by Evolve Skills (evolve-skills/route.ts) and Money Making
// (setup-generate-agent/route.ts) so the two can never independently drift
// on "which real item_stats.category belongs to which activity" the way a
// hardcoded per-file const did -- found the hard way: a shared, unfiltered
// catalog let Claude recommend a real SWORD (Ragnarok Axe -- a real combat
// weapon whose display name happens to contain "Axe") for a Foraging card.
// activityGear comes from the activity_gear_categories table (see
// lib/activity-gear.ts), never duplicated here.
const ARMOR_CATEGORIES = new Set(['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'])

export function armorCatalogText(priced: PricedItem[], maxGearCost: number): string {
  const minPrice = maxGearCost / 25, maxPrice = maxGearCost * 3
  const rows = priced
    .filter(s => ARMOR_CATEGORIES.has(s.category) && s.price >= minPrice && s.price <= maxPrice)
    .sort((a, b) => b.price - a.price)
    .slice(0, 60)
  if (rows.length === 0) return 'No priced armor found in this budget band.'
  return rows.map(s => `${s.item_id} "${s.display_name}" [${s.category}] price=${Math.round(s.price).toLocaleString()}`).join('\n')
}

// Category-scoped candidates for ONE activity's weapon/tool -- the actual
// fix: Claude (or the post-hoc verifier) only ever sees/accepts items that
// are functionally correct for the activity in question.
export function gearCandidatesForActivity(priced: PricedItem[], maxGearCost: number, activityKey: string, activityGear: ActivityGearCategories): PricedItem[] {
  const categories = activityGear[activityKey]
  if (!categories) return []
  const minPrice = maxGearCost / 25, maxPrice = maxGearCost * 3
  return priced
    .filter(s => categories.includes(s.category) && s.price >= minPrice && s.price <= maxPrice)
    .sort((a, b) => b.price - a.price)
}

function gearCatalogTextForActivity(priced: PricedItem[], maxGearCost: number, activityKey: string, activityGear: ActivityGearCategories): string {
  if (!activityGear[activityKey]) {
    return 'This activity has no dedicated weapon/tool slot -- armor/accessories only.'
  }
  const rows = gearCandidatesForActivity(priced, maxGearCost, activityKey, activityGear).slice(0, 20)
  if (rows.length === 0) return 'No priced item found in this budget band for this activity -- leave the field null rather than inventing one.'
  return rows.map(s => `${s.item_id} "${s.display_name}" price=${Math.round(s.price).toLocaleString()}`).join('\n')
}

// Bundles the armor catalog + one section per activityKey -- built ONCE per
// tier and safe to reuse across every call sharing that tier's cached
// context, since the content doesn't vary per-method/per-card (only which
// section a given method/card is INSTRUCTED to read from varies, in the
// caller's own per-call prompt text).
export function buildActivityGearCatalogSection(priced: PricedItem[], maxGearCost: number, activityKeys: string[], activityGear: ActivityGearCategories): string {
  const perActivity = activityKeys
    .map(key => `--- ${key.toUpperCase()} weapon/tool catalog ---\n${gearCatalogTextForActivity(priced, maxGearCost, key, activityGear)}`)
    .join('\n\n')
  return '=== REAL ARMOR CATALOG (any activity, current AH price, filtered to this tier\'s budget) ===\n' +
    armorCatalogText(priced, maxGearCost) +
    '\n\n=== PER-ACTIVITY WEAPON/TOOL CATALOGS — STRICT: only use the section(s) matching the activity you were told to write for, never a different one, even though every item shown anywhere here is real and priced ===\n\n' +
    perActivity
}

// Post-generation defense in depth -- never trust the prompt rule alone
// (same philosophy as applyPreciseCost never trusting Claude's arithmetic).
// Re-checks that a name actually appears, verbatim, in the SAME
// category-scoped candidate list the prompt gave for that activity -- if
// Claude wrote something else (invented, or borrowed from a different
// activity's section), the caller decides what to do with a null result
// (Evolve Skills nulls the field outright; Money Making, an already-shipped
// feature, uses this only to gate whether a matched item may contribute
// cost/rarity data, without touching the visible text Claude wrote).
export function verifyActivityGearName(name: string | null | undefined, priced: PricedItem[], maxGearCost: number, activityKey: string, activityGear: ActivityGearCategories): string | null {
  if (!name) return null
  const candidates = gearCandidatesForActivity(priced, maxGearCost, activityKey, activityGear)
  const match = candidates.find(c => matchesExact(c.display_name, name))
  return match ? match.display_name : null
}
