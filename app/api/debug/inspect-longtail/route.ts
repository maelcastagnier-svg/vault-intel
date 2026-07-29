// TEMP debug route -- fetches Cucumber's REAL raw Hypixel profile and
// searches it for dojo/harp/abiphone/community shop/festival related fields,
// same method as every prior zone. Zero Claude cost -- Hypixel API only.
// Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CUCUMBER_PROFILE_ID = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'
const SEARCH_TERMS = ['dojo', 'harp', 'abiphone', 'phone', 'community', 'festival', 'bits', 'fragment']

function findMatchingPaths(obj: any, path: string, results: { path: string; value: any }[], depth = 0) {
  if (depth > 8 || obj === null || typeof obj !== 'object') return
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase()
    const fullPath = path ? `${path}.${key}` : key
    if (SEARCH_TERMS.some(term => lowerKey.includes(term))) {
      const value = obj[key]
      const preview = typeof value === 'object' && value !== null
        ? (Array.isArray(value) ? `[array len=${value.length}] ${JSON.stringify(value.slice(0, 10))}` : `{keys: ${Object.keys(value).slice(0, 30).join(', ')}} ${JSON.stringify(value).slice(0, 500)}`)
        : value
      results.push({ path: fullPath, value: preview })
    }
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      findMatchingPaths(obj[key], fullPath, results, depth + 1)
    }
  }
}

export async function GET() {
  const { data: player } = await supabase
    .from('player_data').select('hypixel_uuid').eq('profile_id', CUCUMBER_PROFILE_ID).single()
  if (!player) return NextResponse.json({ error: 'Cucumber not found in player_data' }, { status: 404 })

  const uuid = player.hypixel_uuid
  const profileRes = await fetch(
    `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`,
    { headers: { 'API-Key': process.env.HYPIXEL_API_KEY! } }
  )
  if (!profileRes.ok) {
    return NextResponse.json({ error: `Hypixel HTTP ${profileRes.status}`, body: (await profileRes.text()).slice(0, 500) }, { status: 502 })
  }
  const profileData = await profileRes.json()
  if (!profileData.success) {
    return NextResponse.json({ error: 'Hypixel API returned success:false', raw: profileData }, { status: 502 })
  }

  const profiles = profileData.profiles || []
  const profile = profiles.find((p: any) => p.profile_id === CUCUMBER_PROFILE_ID) || profiles[0]
  const member = profile?.members?.[uuid.replace(/-/g, '')]
  if (!member) return NextResponse.json({ error: 'No member data found', profileCount: profiles.length })

  // Only the properly-resolved single member object -- never a whole-profile
  // recursive scan (co-op profile contains every teammate's data too).
  const results: { path: string; value: any }[] = []
  findMatchingPaths(member, 'member', results)

  return NextResponse.json({
    topLevelMemberKeys: Object.keys(member),
    matches: results,
    netherIslandTopLevelKeys: Object.keys(member.nether_island_player_data || {}),
    netherIslandDojo: member.nether_island_player_data?.dojo ?? 'MISSING',
    netherIslandKuudra: member.nether_island_player_data?.kuudra_completed_tiers ?? 'MISSING (checked separately, see boss kills zone)',
    communityUpgrades: profile.community_upgrades ?? 'MISSING',
    foragingSongsFull: member.foraging?.songs ?? 'MISSING',
  })
}
