// TEMP debug route -- dumps member.events.easter directly on Cucumber's real profile.
// Path confirmed via hypixel-api-reborn reference audit (Chocolate Factory), verified
// here against real data before coding. Zero Claude cost -- Hypixel API only.
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
    return NextResponse.json({ error: `Hypixel HTTP ${profileRes.status}` }, { status: 502 })
  }
  const profileData = await profileRes.json()
  const profiles = profileData.profiles || []
  const profile = profiles.find((p: any) => p.profile_id === CUCUMBER_PROFILE_ID) || profiles[0]
  const member = profile?.members?.[uuid.replace(/-/g, '')]
  if (!member) return NextResponse.json({ error: 'No member data found' }, { status: 404 })

  const easter = member.events?.easter || {}

  return NextResponse.json({
    easterTopLevelKeys: Object.keys(easter),
    chocolate: easter.chocolate,
    chocolate_since_prestige: easter.chocolate_since_prestige,
    total_chocolate: easter.total_chocolate,
    rabbit_barn_capacity_level: easter.rabbit_barn_capacity_level,
    chocolate_level: easter.chocolate_level,
    supreme_chocolate_bars: easter.supreme_chocolate_bars,
    employees: easter.employees,
    time_tower: easter.time_tower,
    click_upgrades: easter.click_upgrades,
    chocolate_multiplier_upgrades: easter.chocolate_multiplier_upgrades,
    rabbit_rarity_upgrades: easter.rabbit_rarity_upgrades,
    rabbit_hitmen: easter.rabbit_hitmen,
    rabbitsTopLevelKeys: Object.keys(easter.rabbits || {}),
  })
}
