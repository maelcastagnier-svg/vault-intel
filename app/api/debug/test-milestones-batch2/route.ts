// TEMP debug route -- calls computeMilestones() directly against Cucumber and Orange's
// already-synced player_data (no Hypixel call needed). Zero Claude cost. Deleted after use.
import { NextResponse } from 'next/server'
import { computeMilestones } from '../../player/milestones/route'

const CUCUMBER_PROFILE_ID = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'
const ORANGE_PROFILE_ID   = '35938937-7db6-4f5e-95c5-fecae9084be5'
const VOXUI09_UUID        = '74a06395-3a99-4796-95d0-9e392ba3da7e'

const WATCH_LABELS = new Set(['Participate in Spooky Festival', "Participate in Jacob's Farming Contest"])

function summarize(result: any) {
  if ('error' in result) return result
  const tierSummary = result.tiers.map((t: any) => ({
    tier: t.tier,
    tasks_known: t.tasks_known,
    tasks_computable: t.tasks_computable,
    tasks_completed: t.tasks_completed,
  }))
  const watched = result.tiers
    .flatMap((t: any) => [...t.wiki_tasks, ...t.vault_tasks])
    .filter((task: any) => WATCH_LABELS.has(task.label))
  return { tierSummary, watched }
}

export async function GET() {
  const cucumber = await computeMilestones(VOXUI09_UUID, CUCUMBER_PROFILE_ID)
  const orange   = await computeMilestones(VOXUI09_UUID, ORANGE_PROFILE_ID)
  return NextResponse.json({
    cucumber: summarize(cucumber),
    orange:   summarize(orange),
  })
}
