// TEMP debug route -- calls extractDungeonDetail() directly against Cucumber's real
// freshly-fetched member object, and writes the result straight to player_data via
// Supabase, bypassing the full /api/player/sync GET handler entirely (never triggers
// runEvolveSkills). Zero Claude cost. Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { extractDungeonDetail } from '../../player/sync/route'

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

  const dungeonDetail = extractDungeonDetail(member)

  const { error: updateError } = await supabase
    .from('player_data')
    .update({
      dungeon_secrets: dungeonDetail.dungeon_secrets,
      dungeon_unlocked_journals: dungeonDetail.dungeon_unlocked_journals,
      catacombs_floors: dungeonDetail.catacombs_floors,
      master_catacombs_floors: dungeonDetail.master_catacombs_floors,
      updated_at: new Date().toISOString(),
    })
    .eq('profile_id', CUCUMBER_PROFILE_ID)

  return NextResponse.json({
    extracted: dungeonDetail,
    persisted: !updateError,
    updateError: updateError?.message,
  })
}
