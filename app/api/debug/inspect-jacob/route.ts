// TEMP debug route -- dumps member.jacobs_contest directly on Cucumber's real profile.
// Path confirmed via hypixel-api-reborn reference audit, verified here against real data
// before coding (never guessed). Zero Claude cost -- Hypixel API only. Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CUCUMBER_PROFILE_ID = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'

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
    return NextResponse.json({ error: `Hypixel HTTP ${profileRes.status}` }, { status: 502 })
  }
  const profileData = await profileRes.json()
  const profiles = profileData.profiles || []
  const profile = profiles.find((p: any) => p.profile_id === CUCUMBER_PROFILE_ID) || profiles[0]
  const member = profile?.members?.[uuid.replace(/-/g, '')]
  if (!member) return NextResponse.json({ error: 'No member data found' }, { status: 404 })

  const jacob = member.jacobs_contest || {}
  const contestsKeys = Object.keys(jacob.contests || {})

  return NextResponse.json({
    jacobTopLevelKeys: Object.keys(jacob),
    perks: jacob.perks,
    medals_inv: jacob.medals_inv,
    unique_brackets: jacob.unique_brackets,
    personal_bests: jacob.personal_bests,
    contestsCount: contestsKeys.length,
    contestsSample: Object.fromEntries(contestsKeys.slice(0, 2).map(k => [k, jacob.contests[k]])),
  })
}
