// lib/rarity-colors.ts
// Real Hypixel rarity tiers (the `tier` field on /v2/resources/skyblock/items,
// now captured in item_stats.rarity) mapped to the standard Minecraft/Hypixel
// chat-color convention for each rarity -- not an invented palette. Shared
// between SetupOverlay's GearSlot and SkinArmorRender's on-character tooltip
// so both stay in sync rather than duplicating the same mapping twice.
export const RARITY_COLORS: Record<string, string> = {
  COMMON: '#AAAAAA', UNCOMMON: '#55FF55', RARE: '#5555FF', EPIC: '#AA00AA',
  LEGENDARY: '#FFAA00', MYTHIC: '#FF55FF', DIVINE: '#55FFFF',
  SPECIAL: '#FF5555', VERY_SPECIAL: '#FF5555', ADMIN: '#FF5555',
}
export const rarityColor = (r: string | null | undefined, fallback: string) => (r && RARITY_COLORS[r]) || fallback
