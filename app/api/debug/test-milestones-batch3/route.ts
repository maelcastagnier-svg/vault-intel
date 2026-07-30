// TEMP debug route -- calls computeMilestones() directly against Cucumber and Orange's
// already-synced player_data (no Hypixel call needed). Watches the 4 temporary test
// task rows inserted directly in milestone_tasks (task_key starting with zzz_test_) to
// verify the 3 net-new requirement types (no existing task references them yet).
// Zero Claude cost. Deleted after use, temp task rows deleted separately.
import { NextResponse } from 'next/server'
import { computeMilestones } from '../../player/milestones/route'

const CUCUMBER_PROFILE_ID = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'
const ORANGE_PROFILE_ID   = '35938937-7db6-4f5e-95c5-fecae9084be5'
const VOXUI09_UUID        = '74a06395-3a99-4796-95d0-9e392ba3da7e'

const WATCH_LABELS = new Set([
  'temp: dungeon floor 6', 'temp: chocolate amount', 'temp: auction gold earned', 'temp: fishing sea creatures',
])

function summarize(result: any) {
  if ('error' in result) return result
  const watched = result.tiers
    .flatMap((t: any) => [...t.wiki_tasks, ...t.vault_tasks])
    .filter((task: any) => WATCH_LABELS.has(task.label))
  return watched
}

export async function GET() {
  const cucumber = await computeMilestones(VOXUI09_UUID, CUCUMBER_PROFILE_ID)
  const orange   = await computeMilestones(VOXUI09_UUID, ORANGE_PROFILE_ID)
  return NextResponse.json({
    cucumber: summarize(cucumber),
    orange:   summarize(orange),
  })
}
