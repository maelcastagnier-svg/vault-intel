// TEMP debug route -- checks Cucumber's real member.currencies object against the
// hypixel-api-reborn reference structure found during the audit (motes_purse as a
// flat number, not motes.current like our extractRift() currently assumes).
// Zero Claude cost -- Hypixel API only. Deleted after use.
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

  return NextResponse.json({
    currenciesTopLevelKeys: Object.keys(member.currencies || {}),
    motes_purse_flat: member.currencies?.motes_purse ?? 'MISSING',
    motes_nested_current: member.currencies?.motes?.current ?? 'MISSING',
    coin_purse: member.currencies?.coin_purse ?? 'MISSING',
  })
}
