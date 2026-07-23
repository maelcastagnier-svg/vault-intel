// TEMPORAIRE — teste la restructuration granularite individuelle sur Cucumber et Orange
// avant commit. Supprime apres validation.
import { NextResponse } from 'next/server'
import { computeMilestones } from '../../player/milestones/route'
import { buildMissionCandidates } from '../../player/missions/route'
import { runMilestonesSync } from '../milestones-sync/route'

export const maxDuration = 60

const UUID = '74a06395-3a99-4796-95d0-9e392ba3da7e' // Voxui09
const CUCUMBER = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'
const ORANGE   = '35938937-7db6-4f5e-95c5-fecae9084be5'

export async function GET() {
  const sync = await runMilestonesSync()

  const cucumberMilestones = await computeMilestones(UUID, CUCUMBER)
  const orangeMilestones   = await computeMilestones(UUID, ORANGE)
  const cucumberMissions   = await buildMissionCandidates(UUID, CUCUMBER)
  const orangeMissions     = await buildMissionCandidates(UUID, ORANGE)

  const tierSummary = (r: any) => 'error' in r ? r : r.tiers.map((t: any) => ({
    tier: t.tier, known: t.tasks_known, announced: t.tasks_announced,
    computable: t.tasks_computable, completed: t.tasks_completed,
  }))

  return NextResponse.json({
    sync_total_tasks: sync.total_tasks,
    sync_results: sync.results,
    cucumber_tiers: tierSummary(cucumberMilestones),
    orange_tiers: tierSummary(orangeMilestones),
    cucumber_missions: cucumberMissions,
    orange_missions: orangeMissions,
  })
}
