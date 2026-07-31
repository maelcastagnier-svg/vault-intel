// Temp debug route -- verifies the Museum Donations item_owned fix (real
// museum donation check instead of inventory presence). Deleted after
// validation.
import { NextResponse } from 'next/server'
import { computeMilestones } from '../../player/milestones/route'

const CUCUMBER_UUID = '74a06395-3a99-4796-95d0-9e392ba3da7e'
const CUCUMBER_PROFILE = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'
const ORANGE_PROFILE = '35938937-7db6-4f5e-95c5-fecae9084be5'

export async function GET() {
  const [cucumber, orange] = await Promise.all([
    computeMilestones(CUCUMBER_UUID, CUCUMBER_PROFILE),
    computeMilestones(CUCUMBER_UUID, ORANGE_PROFILE),
  ])

  function summarize(result: any) {
    if ('error' in result) return result
    let totalKnown = 0, totalComputable = 0, totalCompleted = 0
    const museumTasks: any[] = []
    for (const t of result.tiers) {
      totalKnown += t.tasks_known
      totalComputable += t.tasks_computable
      totalCompleted += t.tasks_completed
      for (const task of [...t.wiki_tasks, ...t.vault_tasks]) {
        if (task.category === 'Museum Donations') museumTasks.push({ tier: t.tier, ...task })
      }
    }
    return {
      total_known: totalKnown,
      total_computable: totalComputable,
      total_completed: totalCompleted,
      pct_computable: Math.round((totalComputable / totalKnown) * 1000) / 10,
      museum_found: museumTasks.length,
      museum_computable: museumTasks.filter(t => t.data_available).length,
      museum_met: museumTasks.filter(t => t.met).length,
      museum_met_sample: museumTasks.filter(t => t.met).slice(0, 15),
    }
  }

  return NextResponse.json({ cucumber: summarize(cucumber), orange: summarize(orange) })
}
