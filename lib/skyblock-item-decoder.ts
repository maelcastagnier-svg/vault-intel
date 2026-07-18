// lib/skyblock-item-decoder.ts
// Décode un item Skyblock depuis item_bytes (base64 gzippé)
// Extrait absolument toutes les données utiles via NBT

import { gunzipSync }       from 'zlib'
import { parseNBT, getNBT } from './nbt-parser'

// ── ULTIMATE ENCHANTS SKYBLOCK ────────────────────────────────
const ULTIMATE_ENCHANTS = new Set([
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

// ── Résultat du décodage ──────────────────────────────────────
export type DecodedItem = {
  // Identité
  item_id:             string
  item_name:           string
  item_uuid:           string | null
  item_origin:         string | null
  item_skin:           string | null

  // Upgrades
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

  // Reforge
  reforge:             string | null

  // Enchantements
  enchantments:        Record<string, number>
  ultimate_enchant:    string | null
  ultimate_level:      number | null

  // Gemstones
  gems:                Record<string, string>
  gems_summary:        string

  // Attributs Kuudra / spéciaux
  attributes:          Record<string, number>
  attribute_1:         string | null
  attribute_1_level:   number | null
  attribute_2:         string | null
  attribute_2_level:   number | null

  // Dye
  has_dye:             boolean
  dye_item:            string | null

  // Stack
  item_count:          number

  // Clé de variante composite pour comparaison
  variant_key:         string
}

// ── Construit la variant_key ───────────────────────────────────
function buildVariantKey(item: Omit<DecodedItem, 'variant_key'>): string {
  const parts: string[] = []

  // Étoiles
  const stars = (item.master_stars > 0 ? item.master_stars : item.total_stars)
  parts.push(stars > 0 ? `${stars}star` : 'nostar')

  // Recomb
  parts.push(item.is_recomb ? 'recomb' : 'norecomb')

  // Reforge
  parts.push(item.reforge ? item.reforge.toLowerCase() : 'noreforge')

  // Ultimate enchant
  if (item.ultimate_enchant) {
    const short = item.ultimate_enchant.replace('ultimate_', '')
    parts.push(`${short}${item.ultimate_level || 1}`)
  }

  // Attributs Kuudra (tri alphabétique pour cohérence)
  const attrKeys = Object.keys(item.attributes).sort()
  if (attrKeys.length > 0) {
    const attrStr = attrKeys.map(k => `${k}${item.attributes[k]}`).join('_')
    parts.push(attrStr)
  }

  // Hot potato (groupé par tranches)
  if (item.hot_potato_count >= 10) parts.push('fuming')
  else if (item.hot_potato_count >= 5) parts.push(`hpb${item.hot_potato_count}`)

  return parts.join('_').toLowerCase().slice(0, 200)
}

// ── Décodeur principal ────────────────────────────────────────
export function decodeItemBytes(itemBytesBase64: string): DecodedItem | null {
  try {
    // 1. Decode base64 → Buffer
    const compressed = Buffer.from(itemBytesBase64, 'base64')

    // 2. Gunzip
    const raw = gunzipSync(compressed)

    // 3. Parse NBT
    const nbt = parseNBT(raw)

    // 4. Navigue vers le premier item dans la liste i
    const items = getNBT(nbt, 'i') as any[]
    if (!Array.isArray(items) || items.length === 0) return null

    const itemNbt  = items[0] as Record<string, any>
    const tag      = (itemNbt.tag  || {}) as Record<string, any>
    const display  = (tag.display  || {}) as Record<string, any>
    const extra    = (tag.ExtraAttributes || {}) as Record<string, any>

    // ── Identité ────────────────────────────────────────────
    const item_id   = String(extra.id   || '')
    const item_name = String(display.Name || '').replace(/§[0-9a-fk-or]/gi, '') // strip color codes
    const item_uuid = extra.uuid   ? String(extra.uuid)   : null
    const item_origin = extra.originTag ? String(extra.originTag) : null
    const item_skin = extra.skin   ? String(extra.skin)   : null
    const item_count = Number(itemNbt.Count || 1)

    // ── Étoiles ─────────────────────────────────────────────
    const total_stars  = Number(extra.upgrade_level      || 0)
    const master_stars = Number(extra.dungeon_item_level  || 0)

    // ── Recomb ──────────────────────────────────────────────
    const is_recomb = Number(extra.rarity_upgrades || 0) >= 1

    // ── Hot Potato / upgrades livres ────────────────────────
    const hot_potato_count   = Number(extra.hot_potato_count    || 0)
    const art_of_war_count   = Number(extra.art_of_war_count    || 0)
    const art_of_peace_count = Number(extra.art_of_peace_count  || 0)
    const wood_singularity   = Number(extra.wood_singularity_count || 0)
    const transmitted_count  = Number(extra.transmission_tuner_count || 0)
    const mana_disintegrator = Number(extra.mana_disintegrator_count || 0)
    const silex_applied      = !!(extra.silex_count && Number(extra.silex_count) > 0)

    // ── Reforge ─────────────────────────────────────────────
    const reforge = extra.modifier ? String(extra.modifier).toLowerCase() : null

    // ── Enchantements ────────────────────────────────────────
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

    // ── Gemstones ────────────────────────────────────────────
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
      .map(([k, n]) => n > 1 ? `${n}x${k}` : k)
      .join(' ')

    // ── Attributs Kuudra / spéciaux ──────────────────────────
    const rawAttrs  = (extra.attributes || {}) as Record<string, any>
    const attributes: Record<string, number> = {}

    for (const [k, v] of Object.entries(rawAttrs)) {
      attributes[k] = Number(v)
    }

    // Top 2 attributs par niveau
    const sortedAttrs = Object.entries(attributes)
      .sort(([, a], [, b]) => b - a)

    const attribute_1       = sortedAttrs[0]?.[0] ?? null
    const attribute_1_level = sortedAttrs[0] ? Number(sortedAttrs[0][1]) : null
    const attribute_2       = sortedAttrs[1]?.[0] ?? null
    const attribute_2_level = sortedAttrs[1] ? Number(sortedAttrs[1][1]) : null

    // ── Dye ─────────────────────────────────────────────────
    const has_dye  = !!(extra.dye_item)
    const dye_item = extra.dye_item ? String(extra.dye_item) : null

    // ── Construit l'objet final ──────────────────────────────
    const decoded: Omit<DecodedItem, 'variant_key'> = {
      item_id, item_name, item_uuid, item_origin, item_skin,
      total_stars, master_stars, is_recomb,
      hot_potato_count, art_of_war_count, art_of_peace_count,
      wood_singularity, transmitted_count, mana_disintegrator, silex_applied,
      reforge,
      enchantments, ultimate_enchant, ultimate_level,
      gems, gems_summary,
      attributes, attribute_1, attribute_1_level, attribute_2, attribute_2_level,
      has_dye, dye_item,
      item_count,
    }

    return {
      ...decoded,
      variant_key: buildVariantKey(decoded),
    }

  } catch {
    return null
  }
}