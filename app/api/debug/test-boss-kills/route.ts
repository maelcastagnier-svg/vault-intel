// TEMP debug route -- calls extractBossKills() directly against Cucumber's
// real freshly-fetched member object (same Hypixel fetch pattern as
// inspect-boss-fields), and writes the result straight to player_data via
// Supabase -- bypassing the full /api/player/sync GET handler entirely, so
// this test never triggers the runEvolveSkills chain (a real Sonnet call).
// Zero Claude cost. Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { extractBossKills } from '../../player/sync/route'

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
  const profiles = profileData.profiles || []
  const profile = profiles.find((p: any) => p.profile_id === CUCUMBER_PROFILE_ID) || profiles[0]
  const member = profile?.members?.[uuid.replace(/-/g, '')]
  if (!member) return NextResponse.json({ error: 'No member data found' }, { status: 404 })

  const bossKills = extractBossKills(member)

  const { error: updateError } = await supabase
    .from('player_data')
    .update({ boss_kills: bossKills, updated_at: new Date().toISOString() })
    .eq('profile_id', CUCUMBER_PROFILE_ID)

  return NextResponse.json({
    extracted: bossKills,
    persisted: !updateError,
    updateError: updateError?.message,
  })
}
