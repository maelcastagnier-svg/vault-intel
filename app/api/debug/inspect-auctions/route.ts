// TEMP debug route -- dumps member.player_stats.auctions directly on Cucumber's real
// profile. Path confirmed via hypixel-api-reborn reference audit, verified here against
// real data before coding. Zero Claude cost -- Hypixel API only. Deleted after use.
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

  const auctions = member.player_stats?.auctions || {}

  return NextResponse.json({
    auctionsTopLevelKeys: Object.keys(auctions),
    bids: auctions.bids,
    highest_bid: auctions.highest_bid,
    won: auctions.won,
    gold_spent: auctions.gold_spent,
    created: auctions.created,
    fees: auctions.fees,
    completed: auctions.completed,
    gold_earned: auctions.gold_earned,
    no_bids: auctions.no_bids,
    total_sold: auctions.total_sold,
    total_bought: auctions.total_bought,
  })
}
