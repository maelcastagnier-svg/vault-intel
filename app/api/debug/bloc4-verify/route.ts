// Temp debug route -- Bloc 4.4, verifies computeMilestones() on Cucumber and
// Orange after the 4-lot content insert. Deleted after validation.
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
    const bloc4TasksByTier: any[] = []
    for (const t of result.tiers) {
      totalKnown += t.tasks_known
      totalComputable += t.tasks_computable
      totalCompleted += t.tasks_completed
      const bloc4 = [...t.wiki_tasks, ...t.vault_tasks].filter((task: any) =>
        ['Kuudra Boss','Spider\'s Den Boss','Ender Dragon','Essence Shops','Slayer Milestones',
         'Farming Contest','Catacombs','Master Catacombs','Personal Bank','Minions','Bestiary',
         'Chocolate Factory','Auction House','Fishing'].includes(task.category)
      )
      if (bloc4.length) bloc4TasksByTier.push({ tier: t.tier, bloc4_count: bloc4.length, sample: bloc4.slice(0, 3) })
    }
    return {
      total_known: totalKnown,
      total_computable: totalComputable,
      total_completed: totalCompleted,
      pct_computable: Math.round((totalComputable / totalKnown) * 1000) / 10,
      bloc4TasksByTier,
    }
  }

  return NextResponse.json({
    cucumber: summarize(cucumber),
    orange: summarize(orange),
  })
}
