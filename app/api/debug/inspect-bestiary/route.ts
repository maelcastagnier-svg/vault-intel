// TEMP debug route -- fetches Cucumber's REAL raw Hypixel profile and dumps
// member.bestiary directly (already known to exist as a top-level member key
// from the minions investigation). Zero Claude cost -- Hypixel API only.
// Deleted after use.
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

  const bestiary = member.bestiary || {}
  const kills = bestiary.kills || {}
  const killEntries = Object.entries(kills)

  return NextResponse.json({
    bestiaryTopLevelKeys: Object.keys(bestiary),
    killsCount: killEntries.length,
    killsSample: Object.fromEntries(killEntries.slice(0, 15)),
    milestoneField: bestiary.milestone,
    otherNonKillsFields: Object.fromEntries(Object.entries(bestiary).filter(([k]) => k !== 'kills')),
  })
}
