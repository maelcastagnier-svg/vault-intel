// TEMP debug route -- calls extractLongTail() directly against Cucumber's
// real freshly-fetched member/profile objects, and writes the result
// straight to player_data via Supabase, bypassing the full
// /api/player/sync GET handler entirely (never triggers runEvolveSkills).
// Zero Claude cost. Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { extractLongTail } from '../../player/sync/route'

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

  const longTail = extractLongTail(member, profile)

  const { error: updateError } = await supabase
    .from('player_data')
    .update({
      dojo_status: longTail.dojo_status,
      harp_songs: longTail.harp_songs,
      abiphone_contacts: longTail.abiphone_contacts,
      community_upgrades: longTail.community_upgrades,
      festival_candy: longTail.festival_candy,
      updated_at: new Date().toISOString(),
    })
    .eq('profile_id', CUCUMBER_PROFILE_ID)

  return NextResponse.json({
    extracted: {
      dojo_status: longTail.dojo_status,
      harp_songs: longTail.harp_songs,
      abiphone_contacts: longTail.abiphone_contacts,
      community_upgrades_count: longTail.community_upgrades.length,
      festival_candy: longTail.festival_candy,
    },
    persisted: !updateError,
    updateError: updateError?.message,
  })
}
