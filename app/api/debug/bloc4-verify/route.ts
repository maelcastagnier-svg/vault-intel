// Temp debug route -- Bloc 4.4, verifies computeMilestones() on Cucumber and
// Orange after the 4-lot content insert. Deleted after validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeMilestones } from '../../player/milestones/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CUCUMBER_UUID = '74a06395-3a99-4796-95d0-9e392ba3da7e'
const CUCUMBER_PROFILE = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'
const ORANGE_PROFILE = '35938937-7db6-4f5e-95c5-fecae9084be5'

export async function GET() {
  // Real identifier for our own inserted rows -- task_title/label are free
  // text from Haiku and could coincidentally collide with existing wiki
  // categories (found the hard way: "Minions" matched hundreds of pre-
  // existing wiki "Craft Minions" rows). task_key is unique per insert.
  const { data: bloc4Rows } = await supabase
    .from('milestone_tasks')
    .select('tier, task_key, task_title, label, requirement')
    .like('task_key', 'bloc4_%')
  const bloc4Keys = new Set((bloc4Rows || []).map(r => r.task_key))

  const [cucumber, orange] = await Promise.all([
    computeMilestones(CUCUMBER_UUID, CUCUMBER_PROFILE),
    computeMilestones(CUCUMBER_UUID, ORANGE_PROFILE),
  ])

  // computeMilestones doesn't return task_key on EvaluatedTask -- match back
  // by (tier, task_title, label) triple instead, unique enough for our 69 rows.
  const bloc4Lookup = new Set((bloc4Rows || []).map(r => `${r.tier}::${r.task_title}::${r.label}`))

  function summarize(result: any) {
    if ('error' in result) return result
    let totalKnown = 0, totalComputable = 0, totalCompleted = 0
    const bloc4Tasks: any[] = []
    for (const t of result.tiers) {
      totalKnown += t.tasks_known
      totalComputable += t.tasks_computable
      totalCompleted += t.tasks_completed
      for (const task of [...t.wiki_tasks, ...t.vault_tasks]) {
        if (bloc4Lookup.has(`${t.tier}::${task.task_title}::${task.label}`)) {
          bloc4Tasks.push({ tier: t.tier, ...task })
        }
      }
    }
    return {
      total_known: totalKnown,
      total_computable: totalComputable,
      total_completed: totalCompleted,
      pct_computable: Math.round((totalComputable / totalKnown) * 1000) / 10,
      bloc4_tasks_found: bloc4Tasks.length,
      bloc4_computable: bloc4Tasks.filter(t => t.data_available).length,
      bloc4_completed: bloc4Tasks.filter(t => t.met).length,
      bloc4_sample: bloc4Tasks.slice(0, 12),
    }
  }

  return NextResponse.json({
    inserted_bloc4_rows: bloc4Keys.size,
    cucumber: summarize(cucumber),
    orange: summarize(orange),
  })
}
