// app/api/player/sync/debug-backpacks/route.ts
// TEMPORAIRE — teste le decodage des backpacks (backpack_icons + backpack_contents)
// d'un vrai joueur. Lecture seule, n'ecrit rien dans player_data. A supprimer une fois valide.
// GET /api/player/sync/debug-backpacks?username=X&profile_id=Y
import { NextRequest, NextResponse } from 'next/server'
import { decodeItemListBytes } from '../../../../../lib/skyblock-item-decoder'

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!

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

    const backpackIcons    = member.inventory?.backpack_icons || {}
    const backpackContents = member.inventory?.backpack_contents || {}

    const iconKeys    = Object.keys(backpackIcons)
    const contentKeys = Object.keys(backpackContents)

    // Verifie explicitement le mapping cle-a-cle plutot que de faire confiance a l'ordre
    const backpacks = iconKeys.map(slot => {
      const iconData    = backpackIcons[slot]?.data
      const contentData = backpackContents[slot]?.data
      const hasMatchingContent = contentKeys.includes(slot)

      const iconDecoded = iconData ? decodeItemListBytes(iconData).find(i => i) : null
      const contentDecoded = contentData
        ? decodeItemListBytes(contentData)
            .map((item, index) => item ? { slot: index, ...item } : null)
            .filter((item): item is NonNullable<typeof item> => !!item)
        : []

      return {
        backpack_slot: slot,
        has_matching_content_key: hasMatchingContent,
        icon_item_id:   iconDecoded?.item_id ?? null,
        icon_item_name: iconDecoded?.item_name ?? null,
        item_count:     contentDecoded.length,
        items: contentDecoded.map(i => ({
          slot: i.slot, item_id: i.item_id, item_name: i.item_name, item_count: i.item_count,
        })),
      }
    })

    return NextResponse.json({
      username,
      uuid,
      profile_id: profile.profile_id,
      cute_name:  profile.cute_name ?? null,
      icon_keys:    iconKeys,
      content_keys: contentKeys,
      keys_match:   JSON.stringify(iconKeys.sort()) === JSON.stringify(contentKeys.sort()),
      backpack_count: backpacks.length,
      backpacks,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
