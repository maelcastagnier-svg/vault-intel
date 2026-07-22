// app/api/player/sync/debug-wardrobe/route.ts
// TEMPORAIRE — teste le decodage du wardrobe (member.loadout.armor, jusqu'a 27 slots x 4 pieces)
// d'un vrai joueur. Lecture seule, n'ecrit rien dans player_data. A supprimer une fois valide.
// GET /api/player/sync/debug-wardrobe?username=X&profile_id=Y
import { NextRequest, NextResponse } from 'next/server'
import { decodeItemListBytes } from '../../../../../lib/skyblock-item-decoder'

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

function decodeOne(bytesBase64: string | undefined) {
  if (!bytesBase64) return null
  return decodeItemListBytes(bytesBase64).find(i => i) || null
}

export async function GET(req: NextRequest) {
  const username  = req.nextUrl.searchParams.get('username')
  const profileId = req.nextUrl.searchParams.get('profile_id')
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
    const cleanUuid = uuid.replace(/-/g, '')

    const profile = profileId
      ? profiles.find((p: any) => p.profile_id === profileId)
      : profiles.find((p: any) => p.selected) || profiles[profiles.length - 1]
    if (!profile) return NextResponse.json({ error: 'No matching Skyblock profile found' }, { status: 404 })

    const member = profile.members?.[cleanUuid]
    if (!member) return NextResponse.json({ error: 'Player data not found in profile' }, { status: 404 })

    const loadoutArmor = member.loadout?.armor

    const rawShape = {
      exists:      loadoutArmor !== undefined,
      isArray:     Array.isArray(loadoutArmor),
      type:        typeof loadoutArmor,
      keys:        loadoutArmor ? Object.keys(loadoutArmor) : [],
      member_top_level_has_loadout: !!member.loadout,
      loadout_keys: member.loadout ? Object.keys(member.loadout) : [],
    }

    const slots = loadoutArmor
      ? Object.entries(loadoutArmor).map(([key, slotData]: [string, any]) => {
          const helmet     = decodeOne(slotData?.HELMET?.data)
          const chestplate = decodeOne(slotData?.CHESTPLATE?.data)
          const leggings   = decodeOne(slotData?.LEGGINGS?.data)
          const boots      = decodeOne(slotData?.BOOTS?.data)
          const empty = !helmet && !chestplate && !leggings && !boots
          return {
            key,
            slot_id: slotData?.id ?? null,
            empty,
            helmet_name:     helmet?.item_name ?? null,
            chestplate_name: chestplate?.item_name ?? null,
            leggings_name:   leggings?.item_name ?? null,
            boots_name:      boots?.item_name ?? null,
          }
        })
      : []

    return NextResponse.json({
      username,
      uuid,
      profile_id: profile.profile_id,
      cute_name:  profile.cute_name ?? null,
      raw_shape:  rawShape,
      slot_count: slots.length,
      non_empty_slot_count: slots.filter(s => !s.empty).length,
      slots,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
