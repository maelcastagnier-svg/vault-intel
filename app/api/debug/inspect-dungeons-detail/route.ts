// TEMP debug route -- dumps member.dungeons.dungeon_types.catacombs directly on
// Cucumber's real profile (220 Catacombs runs, good test data for floor detail).
// Path confirmed via hypixel-api-reborn reference audit, verified here against real
// data before coding (never guessed). Zero Claude cost -- Hypixel API only.
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

  const dungeons = member.dungeons || {}
  const catacombs = dungeons.dungeon_types?.catacombs || {}
  const masterCatacombs = dungeons.dungeon_types?.master_catacombs || {}

  return NextResponse.json({
    dungeonsTopLevelKeys: Object.keys(dungeons),
    catacombsTopLevelKeys: Object.keys(catacombs),
    catacombs_highest_tier_completed: catacombs.highest_tier_completed,
    catacombs_tier_completions: catacombs.tier_completions,
    catacombs_best_score: catacombs.best_score,
    catacombs_mobs_killed: catacombs.mobs_killed,
    catacombs_most_mobs_killed: catacombs.most_mobs_killed,
    catacombs_most_damage_berserk: catacombs.most_damage_berserk,
    catacombs_watcher_kills: catacombs.watcher_kills,
    catacombs_fastest_time_s: catacombs.fastest_time_s,
    catacombs_fastest_time_s_plus: catacombs.fastest_time_s_plus,
    catacombs_best_runs_floor_sample: catacombs.best_runs?.['1']?.slice?.(0, 1) ?? catacombs.best_runs?.['1'],
    masterCatacombsTopLevelKeys: Object.keys(masterCatacombs),
    masterCatacombs_highest_tier_completed: masterCatacombs.highest_tier_completed,
    secrets: dungeons.secrets,
    dungeon_journal: dungeons.dungeon_journal,
    treasuresTopLevelKeys: Object.keys(dungeons.treasures || {}),
    treasures_runs_sample: (dungeons.treasures?.runs || []).slice(0, 1),
    treasures_chests_sample: (dungeons.treasures?.chests || []).slice(0, 1),
    daily_runs: dungeons.daily_runs,
    dungeons_blah_blah: dungeons.dungeons_blah_blah,
    catacombs_milestone_completions: catacombs.milestone_completions,
    catacombs_fastest_time_raw: catacombs.fastest_time,
  })
}
