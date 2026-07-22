// app/api/player/sync/debug-inventory/route.ts
// TEMPORAIRE — teste decodeItemListBytes sur inv_contents et ender_chest_contents
// d'un vrai joueur. Lecture seule, n'ecrit rien dans player_data. A supprimer une fois valide.
// GET /api/player/sync/debug-inventory?username=X
import { NextRequest, NextResponse } from 'next/server'
import { decodeItemListBytes } from '../../../../../lib/skyblock-item-decoder'

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

function summarize(bytesBase64: string | undefined) {
  if (!bytesBase64) return { present: false, raw_slot_count: 0, item_count: 0, items: [] }
  const decoded = decodeItemListBytes(bytesBase64)
  const items = decoded
    .map((item, index) => item ? { slot: index, ...item } : null)
    .filter(Boolean)
  return { present: true, raw_slot_count: decoded.length, item_count: items.length, items }
}

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

    const inventory = summarize(member.inventory?.inv_contents?.data)
    const enderChest = summarize(member.inventory?.ender_chest_contents?.data)

    return NextResponse.json({
      username,
      uuid,
      inventory,
      ender_chest: enderChest,
      available_inventory_keys: Object.keys(member.inventory || {}),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
