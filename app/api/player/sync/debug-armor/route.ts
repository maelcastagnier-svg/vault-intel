// app/api/player/sync/debug-armor/route.ts
// TEMPORAIRE — teste le decodeur NBT existant (lib/skyblock-item-decoder.ts) sur inv_armor
// d'un vrai joueur. Lecture seule, n'ecrit rien dans player_data. A supprimer une fois
// le chantier NBT joueur valide.
// GET /api/player/sync/debug-armor?username=X
import { NextRequest, NextResponse } from 'next/server'
import { gunzipSync } from 'zlib'
import { parseNBT, getNBT } from '../../../../../lib/nbt-parser'

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username')
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })

  try {
    const mojangRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`)
    if (!mojangRes.ok) return NextResponse.json({ error: 'Player not found on Mojang' }, { status: 404 })
    const mojangData = await mojangRes.json()
    const uuid = mojangData.id
      ? `${mojangData.id.slice(0,8)}-${mojangData.id.slice(8,12)}-${mojangData.id.slice(12,16)}-${mojangData.id.slice(16,20)}-${mojangData.id.slice(20)}`
      : null
    if (!uuid) return NextResponse.json({ error: 'Invalid username' }, { status: 404 })

    const profileRes = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`, { headers: { 'API-Key': HYPIXEL_KEY } })
    const profileData = await profileRes.json()
    const profiles = profileData.profiles || []
    const profile = profiles.find((p: any) => p.selected) || profiles[profiles.length - 1]
    if (!profile) return NextResponse.json({ error: 'No Skyblock profile found' }, { status: 404 })

    const member = profile.members?.[uuid.replace(/-/g, '')]
    if (!member) return NextResponse.json({ error: 'Player data not found in profile' }, { status: 404 })

    const armorData = member.inventory?.inv_armor?.data
    if (!armorData) return NextResponse.json({ error: 'No inv_armor data on this profile' }, { status: 404 })

    // ── Decode brut : gzip -> NBT -> liste d'items (pas encore l'extracteur AH, juste la structure) ──
    const compressed = Buffer.from(armorData, 'base64')
    const raw = gunzipSync(compressed)
    const nbt = parseNBT(raw)
    const items = getNBT(nbt, 'i') as any[]

    const slots = (items || []).map((itemNbt: any, index: number) => {
      if (!itemNbt || Object.keys(itemNbt).length === 0) return { slot: index, empty: true }
      const tag = itemNbt.tag || {}
      const display = tag.display || {}
      const extra = tag.ExtraAttributes || {}
      return {
        slot: index,
        empty: false,
        item_id: extra.id || null,
        item_name: (display.Name || '').replace(/§[0-9a-fk-or]/gi, ''),
        reforge: extra.modifier || null,
        stars: extra.upgrade_level || 0,
        recomb: Number(extra.rarity_upgrades || 0) >= 1,
        enchantments: extra.enchantments || {},
        gems: extra.gems || {},
        raw_extra_attributes_keys: Object.keys(extra),
      }
    })

    return NextResponse.json({
      username,
      uuid,
      raw_item_count: items?.length ?? 0,
      slots,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
