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

// Real decoded-item shape from lib/skyblock-item-decoder.ts -- the field is
// total_stars, not stars. The previous version of this file declared a
// `stars` field that never actually exists on a decoded item (equipped_armor
// pieces are written straight from the decoder in player/sync), which
// silently forced armor_stars to 0 on every "current" render regardless of
// the real item -- caught while rebuilding this to scan the full owned pool
// below, fixed here rather than left in place.
export type DecodedArmorPiece = {
  item_id: string; item_name: string; reforge: string | null
  total_stars: number; is_recomb: boolean; enchantments: Record<string, number>
}
export type RenderSetup = Record<string, any>

const PIECE_TO_COLOR_FIELD: Record<ArmorPieceKey, string> = {
  helmet: 'armor_helmet_color', chestplate: 'armor_chestplate_color',
  leggings: 'armor_leggings_color', boots: 'armor_boots_color',
}

// Detects "same set" via item_id, NOT display name -- found necessary by
// testing on Cucumber's real gear: Hypixel's "Groovy Fig" set uses themed
// per-piece names (FIG_HELMET="Groovy Fig Cap", FIG_CHESTPLATE="Groovy
// Figmail", FIG_LEGGINGS="Groovy Fig Trousers", FIG_BOOTS="Groovy Fig
// Striders") that never literally contain the words "Helmet"/"Chestplate"/
// etc, so a text-stripping approach falsely read all 4 pieces as
// mismatched. item_id follows a real, structural {SET}_{PIECE} convention
// instead -- the same assumption app/api/player/sync/route.ts already
// relies on to bucket a decoded item under the correct slot in the first
// place -- stripping the piece's own known suffix off item_id is exact,
// never a guess.
const ITEM_ID_PIECE_SUFFIX: Record<ArmorPieceKey, string> = {
  helmet: '_HELMET', chestplate: '_CHESTPLATE', leggings: '_LEGGINGS', boots: '_BOOTS',
}
function detectArmorPiece(itemId: string): ArmorPieceKey | null {
  for (const p of ARMOR_PIECES) if (itemId.endsWith(ITEM_ID_PIECE_SUFFIX[p])) return p
  return null
}
const itemIdSetPrefix = (piece: ArmorPieceKey, itemId: string): string => {
  const suffix = ITEM_ID_PIECE_SUFFIX[piece]
  return itemId.endsWith(suffix) ? itemId.slice(0, -suffix.length) : itemId
}

// ── Owned armor sets, scanned from EVERYWHERE the player has gear ──────────
// "current" for a skill card is not "what's literally worn right now" --
// armor is one single global loadout, so a player grinding one skill might
// be wearing a completely different skill's set purely because that's what
// they last equipped, while the real best-fit set for THIS skill sits
// unused in a backpack/ender chest/vault/wardrobe. This scans the same 5
// extra locations already validated for Money Making's free_swap detection
// (collectOwnedButUnequipped in evolve-skills/route.ts) PLUS the equipped
// slot itself, grouped into coherent named sets by item_id prefix, so Claude
// can pick per-card the best-fit ALREADY-OWNED set instead of defaulting to
// whatever happens to be on the player's body.
export type OwnedArmorSet = {
  name: string
  location: string
  piecesPresent: ArmorPieceKey[]
  reforge: string | null
  stars: number
  enchants: string[]
  pieces: Partial<Record<ArmorPieceKey, DecodedArmorPiece>>
}

// Found while testing (char-code dump against a real item): some raw item
// names carry a leading Private Use Area glyph (U+E000-U+F8FF -- Hypixel's
// custom Minecraft font uses this range for inline icons, e.g. a rarity gem
// before the name), which is invisible/unrenderable as normal text and NOT
// whitespace, so .trim() alone never removed it. Claude reasonably drops
// this unprintable character when copying the name back (it can't render a
// custom Minecraft font glyph as text), which made its output legitimately
// differ from our stored name by exactly that one leading character and
// silently fail the exact-match lookup in resolveOwnedArmorSet. Stripped at
// the source so the list shown to Claude never has it, and reapplied on
// Claude's returned name as defense in depth in case it ever preserves one.
function cleanItemName(raw: string): string {
  return raw.replace(/[-]/g, '').replace(/\s+/g, ' ').trim()
}

function toDecodedPiece(item: any): DecodedArmorPiece | null {
  if (!item?.item_id) return null
  return {
    item_id: item.item_id,
    item_name: cleanItemName(item.item_name || item.item_id),
    reforge: item.reforge || null,
    total_stars: item.total_stars || 0,
    is_recomb: !!item.is_recomb,
    enchantments: item.enchantments || {},
  }
}

// Sync structural grouping only -- no DB access, so a caller that just needs
// the candidate list (e.g. to build a prompt) doesn't pay for a lookup it
// doesn't need yet. Real rarity/color are attached later, per chosen set
// only, via resolveOwnedArmorSet.
export function collectOwnedArmorSets(player: any): OwnedArmorSet[] {
  type Tagged = { piece: ArmorPieceKey; item: DecodedArmorPiece; location: string }
  const tagged: Tagged[] = []

  const push = (raw: any, location: string) => {
    const piece = raw?.item_id ? detectArmorPiece(raw.item_id) : null
    if (!piece) return
    const item = toDecodedPiece(raw)
    if (item) tagged.push({ piece, item, location })
  }

  for (const item of Object.values(player.equipped_armor || {})) push(item, 'Equipped')
  for (const item of (player.inventory_items || [])) push(item, 'Inventory')
  for (const item of (player.ender_chest_items || [])) push(item, 'Ender Chest')
  for (const bp of (player.backpacks || [])) {
    for (const item of (bp.items || [])) push(item, bp.icon_item_name || 'Backpack')
  }
  for (const item of (player.personal_vault_items || [])) push(item, 'Personal Vault')
  for (const slot of (player.wardrobe_slots || [])) {
    for (const p of ARMOR_PIECES) push(slot[p], `Wardrobe slot ${slot.slot}`)
  }

  // Group by real set prefix. Duplicate pieces for the same slot+set (e.g.
  // two backpack copies) keep the higher-star one.
  const groups = new Map<string, Map<ArmorPieceKey, Tagged>>()
  for (const t of tagged) {
    const prefix = itemIdSetPrefix(t.piece, t.item.item_id)
    if (!groups.has(prefix)) groups.set(prefix, new Map())
    const g = groups.get(prefix)!
    const existing = g.get(t.piece)
    if (!existing || t.item.total_stars > existing.item.total_stars) g.set(t.piece, t)
  }

  const sets: OwnedArmorSet[] = []
  for (const pieceMap of groups.values()) {
    const present = ARMOR_PIECES.filter(p => pieceMap.has(p))
    if (present.length === 0) continue
    const repKey: ArmorPieceKey = present.includes('chestplate') ? 'chestplate' : present[0]
    const rep = pieceMap.get(repKey)!
    sets.push({
      name: rep.item.item_name,
      location: Array.from(new Set(present.map(p => pieceMap.get(p)!.location))).join(' + '),
      piecesPresent: present,
      reforge: rep.item.reforge,
      stars: rep.item.total_stars,
      enchants: Object.entries(rep.item.enchantments || {}).map(([n, l]) => `${n} ${l}`),
      pieces: Object.fromEntries(present.map(p => [p, pieceMap.get(p)!.item])) as any,
    })
  }
  return sets
}

export function formatOwnedArmorSets(sets: OwnedArmorSet[]): string {
  if (sets.length === 0) return 'Nothing owned (no armor anywhere -- equipped, inventory, ender chest, backpacks, vault, wardrobe).'
  return sets
    .map(s => `- "${s.name}" (${s.piecesPresent.join(', ')}) [${s.location}]`)
    .join('\n')
}

// Attaches real rarity/color and builds the render_setup for ONE named set --
// called once Claude has picked current.armor_set_used for a given card.
// Exact name match only: these names come from OUR OWN grouping above, never
// freeform Claude text, so no fuzzy matching is needed or wanted here (and a
// name Claude gets wrong/hallucinates simply resolves to nothing rather than
// a wrong guess).
export async function resolveOwnedArmorSet(sets: OwnedArmorSet[], name: string | null | undefined): Promise<RenderSetup> {
  if (!name) return {}
  const target = cleanItemName(name)
  const set = sets.find(s => s.name === target)
  if (!set) return {}

  const itemIds = Object.values(set.pieces).map((p: any) => p.item_id)
  const { data: stats } = await supabase.from('item_stats').select('item_id, rarity, default_color').in('item_id', itemIds)
  const byId = new Map((stats || []).map(s => [s.item_id, s]))

  const setup: RenderSetup = {}
  for (const p of set.piecesPresent) {
    const meta = byId.get(set.pieces[p]!.item_id)
    if (meta?.default_color) setup[PIECE_TO_COLOR_FIELD[p]] = meta.default_color
    if (!setup.armor_rarity && meta?.rarity) setup.armor_rarity = meta.rarity
  }
  setup.armor_set = set.name
  setup.armor_stars = set.stars
  setup.armor_reforge = set.reforge
  setup.enchants_armor = set.enchants
  return setup
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
