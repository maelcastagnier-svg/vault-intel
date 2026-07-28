// lib/skyblock-item-decoder.ts
// Décode un item Skyblock depuis item_bytes (base64 gzippé)
// Extrait absolument toutes les données utiles via NBT
// Produit deux variant_key :
//   variant_key_full = comparaison exacte (stars+recomb+reforge+ultimate+attributes)
//   variant_key_base = agrégation DAILY (stars+recomb+ultimate+attributes — sans reforge)

import { gunzipSync }       from 'zlib'
import { parseNBT, getNBT } from './nbt-parser'

// ── ULTIMATE ENCHANTS ─────────────────────────────────────────
export const ULTIMATE_ENCHANTS = new Set([
  'ultimate_one_for_all',
  'ultimate_soul_eater',
  'ultimate_fatal_tempo',
  'ultimate_wise',
  'ultimate_inferno',
  'ultimate_bank',
  'ultimate_last_stand',
  'ultimate_combo',
  'ultimate_refrigerate',
  'ultimate_jerry',
  'ultimate_swarm',
  'ultimate_habanero_tactics',
])

// ── Type résultat ─────────────────────────────────────────────
export type DecodedItem = {
  item_id:             string
  item_name:           string
  item_uuid:           string | null
  item_origin:         string | null
  item_skin:           string | null

  total_stars:         number
  master_stars:        number
  is_recomb:           boolean
  hot_potato_count:    number
  art_of_war_count:    number
  art_of_peace_count:  number
  wood_singularity:    number
  transmitted_count:   number
  mana_disintegrator:  number
  silex_applied:       boolean

  reforge:             string | null

  enchantments:        Record<string, number>
  ultimate_enchant:    string | null
  ultimate_level:      number | null

  gems:                Record<string, string>
  gems_summary:        string

  attributes:          Record<string, number>
  attribute_1:         string | null
  attribute_1_level:   number | null
  attribute_2:         string | null
  attribute_2_level:   number | null

  has_dye:             boolean
  dye_item:            string | null
  item_count:          number

  // Deux clés de variante
  variant_key_full:    string  // comparaison exacte
  variant_key_base:    string  // agrégation DAILY/MONTHLY
}

// ── Construit les deux variant_key ────────────────────────────
// Exportée pour être réutilisée par setup-generate-agent : un setup Money
// Making recommande une pièce précise (étoiles/reforge/hpb/ultimate choisis
// par Claude, justifiés dans le prompt) mais n'a pas de vrai blob NBT à
// décoder — on construit quand même la MÊME clé de variante qu'un vrai item
// scanné aurait, pour pouvoir requêter price_history_ah_variants avec la
// logique exacte déjà validée sur les vraies données AH, sans dupliquer/
// diverger la construction de la clé.
export function buildVariantKeys(d: Omit<DecodedItem, 'variant_key_full' | 'variant_key_base'>): {
  variant_key_full: string
  variant_key_base: string
} {
  const stars    = d.master_stars > 0 ? d.master_stars : d.total_stars
  const starStr  = stars > 0 ? `${stars}star` : 'nostar'
  const recombStr= d.is_recomb ? 'recomb' : 'norecomb'

  // Ultimate enchant
  const ultimateStr = d.ultimate_enchant
    ? `${d.ultimate_enchant.replace('ultimate_', '')}${d.ultimate_level || 1}`
    : null

  // Attributs Kuudra triés alphabétiquement
  const attrKeys = Object.keys(d.attributes).sort()
  const attrStr  = attrKeys.length > 0
    ? attrKeys.map(k => `${k}${d.attributes[k]}`).join('_')
    : null

  // HPB groupé
  const hpbStr = d.hot_potato_count >= 10 ? 'fuming'
    : d.hot_potato_count >= 5 ? `hpb${d.hot_potato_count}`
    : null

  // ── variant_key_base : ce qui DRIVE la valeur ─────────────
  // Stars + Recomb + Ultimate + Attributes Kuudra
  const baseParts = [starStr, recombStr]
  if (ultimateStr) baseParts.push(ultimateStr)
  if (attrStr)     baseParts.push(attrStr)
  if (hpbStr)      baseParts.push(hpbStr)

  const variant_key_base = baseParts.join('_').toLowerCase().slice(0, 200)

  // ── variant_key_full : tout ce qui impacte le prix significativement ──
  const fullParts = [starStr, recombStr]

  // Reforge
  if (d.reforge)     fullParts.push(d.reforge.toLowerCase())

  // Ultimate enchant
  if (ultimateStr)   fullParts.push(ultimateStr)

  // Kuudra attributes (triés alphabétiquement)
  if (attrStr)       fullParts.push(attrStr)

  // Hot potato (groupé par tranches significatives)
  // 0 = rien, 1-4 = partiel, 5-9 = avancé, 10+ = fuming
  if (d.hot_potato_count >= 10)      fullParts.push('fuming')
  else if (d.hot_potato_count >= 5)  fullParts.push(`hpb${d.hot_potato_count}`)
  else if (d.hot_potato_count >= 1)  fullParts.push(`hpb${d.hot_potato_count}`)

  // Gemstones PERFECT et FLAWLESS (impact prix significatif)
  // FINE/ROUGH/FLAWED ignorés (impact marginal)
  const gemStr = Object.entries(d.gems)
    .filter(([, q]) => q === 'PERFECT' || q === 'FLAWLESS')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slot, q]) => `${slot.split('_')[0]}${q === 'PERFECT' ? 'P' : 'F'}`)
    .join('_')
  if (gemStr) fullParts.push(gemStr)

  // Art of War (augmente les stats d'armor/weapon significativement)
  if (d.art_of_war_count > 0)   fullParts.push(`aow${d.art_of_war_count}`)

  // Art of Peace (farming tools)
  if (d.art_of_peace_count > 0) fullParts.push(`aop${d.art_of_peace_count}`)

  // Wood Singularity (déblocage de sockets sur Divan Drill — +100M+)
  if (d.wood_singularity > 0)   fullParts.push('ws')

  // Transmission Tuner (Divan Drill — augmente les stats mining)
  if (d.transmitted_count > 0)  fullParts.push(`tt${d.transmitted_count}`)

  // Mana Disintegrator (fishing rods — impact sur mana regen)
  if (d.mana_disintegrator > 0) fullParts.push(`md${d.mana_disintegrator}`)

  // Silex (fishing rod — augmente la pêche de manière significative)
  if (d.silex_applied) fullParts.push('silex')

  const variant_key_full = fullParts.join('_').toLowerCase().slice(0, 200)

  return { variant_key_full, variant_key_base }
}

// ── Decode un item deja extrait du NBT (compound "i[n]") ───────
// Reutilise par decodeItemBytes (AH, 1 item) et decodeItemListBytes (inventaire joueur, N items)
export function decodeItemNBT(itemNbt: Record<string, any>): DecodedItem | null {
  try {
    const tag     = (itemNbt.tag             || {}) as Record<string, any>
    const display = (tag.display             || {}) as Record<string, any>
    const extra   = (tag.ExtraAttributes     || {}) as Record<string, any>

    // Identité
    const item_id     = String(extra.id        || '')
    const item_name   = String(display.Name    || '').replace(/§[0-9a-fk-or]/gi, '')
    const item_uuid   = extra.uuid      ? String(extra.uuid)      : null
    const item_origin = extra.originTag ? String(extra.originTag) : null
    const item_skin   = extra.skin      ? String(extra.skin)      : null
    const item_count  = Number(itemNbt.Count   || 1)

    // Stars
    const total_stars  = Number(extra.upgrade_level       || 0)
    const master_stars = Number(extra.dungeon_item_level   || 0)

    // Recomb
    const is_recomb = Number(extra.rarity_upgrades || 0) >= 1

    // Upgrades livres
    const hot_potato_count   = Number(extra.hot_potato_count           || 0)
    const art_of_war_count   = Number(extra.art_of_war_count           || 0)
    const art_of_peace_count = Number(extra.art_of_peace_count         || 0)
    const wood_singularity   = Number(extra.wood_singularity_count     || 0)
    const transmitted_count  = Number(extra.transmission_tuner_count   || 0)
    const mana_disintegrator = Number(extra.mana_disintegrator_count   || 0)
    const silex_applied      = !!(extra.silex_count && Number(extra.silex_count) > 0)

    // Reforge
    const reforge = extra.modifier ? String(extra.modifier).toLowerCase() : null

    // Enchantements
    const rawEnchants = (extra.enchantments || {}) as Record<string, any>
    const enchantments: Record<string, number> = {}
    let ultimate_enchant: string | null = null
    let ultimate_level:   number | null = null

    for (const [name, level] of Object.entries(rawEnchants)) {
      const lvl = Number(level)
      enchantments[name] = lvl
      if (ULTIMATE_ENCHANTS.has(name)) {
        ultimate_enchant = name
        ultimate_level   = lvl
      }
    }

    // Gemstones
    const rawGems = (extra.gems || {}) as Record<string, any>
    const gems: Record<string, string> = {}
    const gemCounts: Record<string, number> = {}

    for (const [slot, quality] of Object.entries(rawGems)) {
      if (slot.startsWith('unlocked_slots')) continue
      if (typeof quality === 'string') {
        gems[slot] = quality
        const key  = `${quality}_${slot.split('_')[0]}`
        gemCounts[key] = (gemCounts[key] || 0) + 1
      } else if (quality && typeof quality === 'object' && (quality as any).quality) {
        const q    = String((quality as any).quality)
        gems[slot] = q
        const key  = `${q}_${slot.split('_')[0]}`
        gemCounts[key] = (gemCounts[key] || 0) + 1
      }
    }

    const gems_summary = Object.entries(gemCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, c]) => c > 1 ? `${c}x${k}` : k)
      .join(' ')

    // Attributs Kuudra
    const rawAttrs  = (extra.attributes || {}) as Record<string, any>
    const attributes: Record<string, number> = {}
    for (const [k, v] of Object.entries(rawAttrs)) {
      attributes[k] = Number(v)
    }

    const sortedAttrs       = Object.entries(attributes).sort(([,a],[,b]) => b - a)
    const attribute_1       = sortedAttrs[0]?.[0] ?? null
    const attribute_1_level = sortedAttrs[0] ? Number(sortedAttrs[0][1]) : null
    const attribute_2       = sortedAttrs[1]?.[0] ?? null
    const attribute_2_level = sortedAttrs[1] ? Number(sortedAttrs[1][1]) : null

    // Dye
    const has_dye  = !!(extra.dye_item)
    const dye_item = extra.dye_item ? String(extra.dye_item) : null

    const base: Omit<DecodedItem, 'variant_key_full' | 'variant_key_base'> = {
      item_id, item_name, item_uuid, item_origin, item_skin,
      total_stars, master_stars, is_recomb,
      hot_potato_count, art_of_war_count, art_of_peace_count,
      wood_singularity, transmitted_count, mana_disintegrator, silex_applied,
      reforge,
      enchantments, ultimate_enchant, ultimate_level,
      gems, gems_summary,
      attributes, attribute_1, attribute_1_level, attribute_2, attribute_2_level,
      has_dye, dye_item, item_count,
    }

    return { ...base, ...buildVariantKeys(base) }

  } catch {
    return null
  }
}

// ── Decode un blob base64-gzip contenant UN item (AH item_bytes) ──
export function decodeItemBytes(itemBytesBase64: string): DecodedItem | null {
  try {
    const compressed = Buffer.from(itemBytesBase64, 'base64')
    const raw        = gunzipSync(compressed)
    const nbt        = parseNBT(raw)

    const items = getNBT(nbt, 'i') as any[]
    if (!Array.isArray(items) || items.length === 0) return null

    return decodeItemNBT(items[0] as Record<string, any>)
  } catch {
    return null
  }
}

// ── Decode un blob base64-gzip contenant PLUSIEURS items (inventaire joueur : ──
// inv_armor, inv_contents, ender_chest_contents, etc.) — un slot vide donne null,
// l'ordre du tableau retourne correspond a l'ordre des slots dans le blob source.
export function decodeItemListBytes(itemBytesBase64: string): (DecodedItem | null)[] {
  try {
    const compressed = Buffer.from(itemBytesBase64, 'base64')
    const raw        = gunzipSync(compressed)
    const nbt        = parseNBT(raw)

    const items = getNBT(nbt, 'i') as any[]
    if (!Array.isArray(items)) return []

    return items.map(itemNbt =>
      itemNbt && Object.keys(itemNbt).length > 0 ? decodeItemNBT(itemNbt as Record<string, any>) : null
    )
  } catch {
    return []
  }
}