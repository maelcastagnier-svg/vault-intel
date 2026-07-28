// lib/skill-setup-adapter.ts
// Reshapes real, already-collected Evolve Skills data into the exact `setup`
// object shape SkinArmorRender.tsx expects (armor_set/armor_*_color/
// armor_rarity/armor_stars/armor_reforge/enchants_armor) -- the renderer
// itself is reused completely unmodified, only this adapter layer is new.
import { createClient } from '@supabase/supabase-js'
import { type PricedItem, bestArmorPiecesForSet, ARMOR_COLOR_FIELD } from './gear-pricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ARMOR_PIECES = ['helmet', 'chestplate', 'leggings', 'boots'] as const
type ArmorPieceKey = typeof ARMOR_PIECES[number]

// Matches player_data.equipped_armor[slot] exactly (written by
// app/api/player/sync/route.ts from the real decoded NBT) -- not redefined
// independently, just the subset of fields this adapter actually reads.
export type EquippedPiece = {
  item_id: string
  item_name: string
  reforge: string | null
  stars: number
  is_recomb: boolean
  enchantments: Record<string, number>
}

export type RenderSetup = Record<string, any>

const PIECE_TO_COLOR_FIELD: Record<ArmorPieceKey, string> = {
  helmet: 'armor_helmet_color', chestplate: 'armor_chestplate_color',
  leggings: 'armor_leggings_color', boots: 'armor_boots_color',
}

const stripPieceWord = (name: string) => name.replace(/\b(Helmet|Chestplate|Leggings|Boots)\b/gi, '').replace(/\s+/g, ' ').trim()

// ── Current: the player's REAL equipped armor, never invented ──────────
// SkinArmorRender only supports one shared name/rarity/stars/reforge/enchants
// tooltip for the whole body (same limit Money Making's setups already have --
// it generates one spec per set, not truly separate stats per piece) -- a
// real player's 4 pieces CAN differ (mismatched sets are common, e.g. the
// already-documented Cucumber case: Groovy Fig armor with zero dungeon
// stats). Per-piece COLOR stays fully accurate regardless (armor_*_color are
// independent fields); the shared tooltip fields fall back to whichever piece
// is actually worn, preferring chestplate as the most visually prominent slot.
// armor_set becomes "Mixed Gear" -- an honest label, never a fabricated
// coherent set name -- whenever the worn pieces don't all share the same
// base name.
export async function buildCurrentSetup(equippedArmor: Partial<Record<ArmorPieceKey, EquippedPiece>> | null | undefined): Promise<{ setup: RenderSetup; hasAnyArmor: boolean }> {
  const present = ARMOR_PIECES.filter(p => equippedArmor?.[p]?.item_id)
  if (present.length === 0) return { setup: {}, hasAnyArmor: false }

  const itemIds = Array.from(new Set(present.map(p => equippedArmor![p]!.item_id)))
  const { data: stats } = await supabase
    .from('item_stats')
    .select('item_id, rarity, default_color')
    .in('item_id', itemIds)
  const byId = new Map((stats || []).map(s => [s.item_id, s]))

  const setup: RenderSetup = {}
  for (const p of present) {
    const piece = equippedArmor![p]!
    const meta = byId.get(piece.item_id)
    if (meta?.default_color) setup[PIECE_TO_COLOR_FIELD[p]] = meta.default_color
  }

  const repKey: ArmorPieceKey = present.includes('chestplate') ? 'chestplate' : present[0]
  const rep = equippedArmor![repKey]!
  const repMeta = byId.get(rep.item_id)

  const prefixes = new Set(present.map(p => stripPieceWord(equippedArmor![p]!.item_name)))
  setup.armor_set = prefixes.size === 1 ? [...prefixes][0] : 'Mixed Gear'
  setup.armor_rarity = repMeta?.rarity || null
  setup.armor_stars = rep.stars || 0
  setup.armor_reforge = rep.reforge || null
  setup.enchants_armor = Object.entries(rep.enchantments || {}).map(([name, lvl]) => `${name} ${lvl}`)

  return { setup, hasAnyArmor: true }
}

// ── Target: precise gear NAMED by Claude (evolve-skills prompt, extended the
// same way setup-generate-agent already asks for real reforge/stars/ultimate
// enchant), matched against the real priced catalog for real color/rarity --
// same applyPreciseCost pattern, reused via the shared lib/gear-pricing.ts
// functions rather than reimplemented here. ─────────────────────────────
export type TargetGearSpec = {
  armor_set?: string | null
  armor_stars?: number
  armor_recomb?: boolean
  armor_reforge?: string | null
  armor_hot_potato_count?: number
  armor_ultimate_enchant?: string | null
}

export function buildTargetSetup(target: TargetGearSpec, priced: PricedItem[]): { setup: RenderSetup; hasAnyArmor: boolean } {
  if (!target.armor_set) return { setup: {}, hasAnyArmor: false }

  const setup: RenderSetup = {
    armor_set: target.armor_set,
    armor_stars: target.armor_stars || 0,
    armor_recomb: !!target.armor_recomb,
    armor_reforge: target.armor_reforge || null,
    armor_hot_potato_count: target.armor_hot_potato_count || 0,
    armor_ultimate_enchant: target.armor_ultimate_enchant || null,
  }

  const matched = bestArmorPiecesForSet(priced, target.armor_set)
  for (const item of matched) {
    if (!setup.armor_rarity && item.rarity) setup.armor_rarity = item.rarity
    const colorField = ARMOR_COLOR_FIELD[item.category]
    if (colorField && item.default_color) setup[colorField] = item.default_color
  }

  return { setup, hasAnyArmor: matched.length > 0 }
}
