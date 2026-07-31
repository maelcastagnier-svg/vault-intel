// Temp debug route -- Bloc 7, dumps raw structure for zones under
// investigation (7.1 mythos, 7.2 rift, 7.4 garden/crystals/accessory tuning/
// pets care/gifts, 7.5 hotm forge, 7.6 dojo). Read-only, no persistence.
// Deleted after validation.
import { NextResponse } from 'next/server'

const HYPIXEL_KEY = process.env.HYPIXEL_API_KEY!
const CUCUMBER_UUID = '74a06395-3a99-4796-95d0-9e392ba3da7e'
const CUCUMBER_PROFILE = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'

function findKeysContaining(obj: any, needle: string, path = '', depth = 0, out: string[] = []): string[] {
  if (depth > 6 || !obj || typeof obj !== 'object') return out
  for (const key of Object.keys(obj)) {
    const p = path ? `${path}.${key}` : key
    if (key.toLowerCase().includes(needle)) out.push(p)
    if (typeof obj[key] === 'object' && obj[key] !== null) findKeysContaining(obj[key], needle, p, depth + 1, out)
  }
  return out
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const uuid = url.searchParams.get('uuid') || CUCUMBER_UUID
  const profileParam = url.searchParams.get('profile') || CUCUMBER_PROFILE

  const res = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`, { headers: { 'API-Key': HYPIXEL_KEY } })
  const data = await res.json()
  if (!data.success) return NextResponse.json({ error: 'hypixel_fetch_failed', data }, { status: 502 })

  const profiles = data.profiles || []
  const profile = profileParam ? profiles.find((p: any) => p.profile_id === profileParam) : profiles.find((p: any) => p.selected)
  if (!profile) return NextResponse.json({ error: 'profile_not_found', available: profiles.map((p: any) => p.profile_id) }, { status: 404 })

  const member = profile.members?.[uuid.replace(/-/g, '')]
  if (!member) return NextResponse.json({ error: 'member_not_found' }, { status: 404 })

  const museumRes = await fetch(`https://api.hypixel.net/v2/skyblock/museum?profile=${profileParam}`, { headers: { 'API-Key': HYPIXEL_KEY } })
  const museumData = await museumRes.json()
  const museumMember = museumData?.members?.[uuid.replace(/-/g, '')]

  return NextResponse.json({
    top_level_member_keys: Object.keys(member),
    top_level_profile_keys: Object.keys(profile),
    mythos:            member.player_stats?.mythos ?? 'ABSENT',
    rift:               member.rift ?? 'ABSENT',
    mining_core:        member.mining_core ?? 'ABSENT',
    garden_player_data: member.garden_player_data ?? 'ABSENT',
    garden_chips:       member.player_data?.garden_chips ?? 'ABSENT',
    accessory_bag_storage: member.accessory_bag_storage ?? 'ABSENT',
    pets_data_autopet:  member.pets_data?.autopet ?? 'ABSENT',
    pet_keys_found:     findKeysContaining(member, 'pet'),
    gift_keys_found:    findKeysContaining(member, 'gift'),
    santa_keys_found:   findKeysContaining(member, 'santa').concat(findKeysContaining(member, 'winter')).concat(findKeysContaining(member, 'jerry')),
    dojo:               member.nether_island_player_data?.dojo ?? 'ABSENT',
    dojo_keys_found:    findKeysContaining(member, 'dojo'),
    museum_success:     museumData?.success ?? false,
    museum_top_keys:    museumMember ? Object.keys(museumMember) : 'ABSENT',
    museum_sample:      museumMember ?? museumData,
  })
}
