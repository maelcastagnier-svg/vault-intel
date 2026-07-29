// TEMP debug route -- verifies bucketizeTier() on real Cucumber/Orange
// Milestones data. Zero API cost: pure Supabase reads + JS, no Claude call
// anywhere in this path (computeMilestones is deterministic, confirmed
// earlier). Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { computeMilestones } from '../../player/milestones/route'
import { bucketizeTier, BUCKET_COUNT } from '../../../../lib/milestone-buckets'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PROFILES = {
  cucumber: 'b077f27a-60f7-46d9-be13-c4689a01dc3b',
  orange: '35938937-7db6-4f5e-95c5-fecae9084be5',
}

export async function GET() {
  const out: any = {}
  for (const [name, profileId] of Object.entries(PROFILES)) {
    const { data: player } = await supabase
      .from('player_data').select('hypixel_uuid').eq('profile_id', profileId).single()
    if (!player) { out[name] = { error: 'player not found' }; continue }

    const result = await computeMilestones(player.hypixel_uuid, profileId)
    if ('error' in result) { out[name] = { error: result.error }; continue }

    out[name] = result.tiers.map(tier => {
      const allTasks = [...tier.wiki_tasks, ...tier.vault_tasks]
      const buckets = bucketizeTier(tier)
      const sizeCounts = { big: 0, medium: 0, small: 0 }
      const stateCounts: Record<string, number> = { complete: 0, partial: 0, not_started: 0, untrackable: 0, no_tasks: 0 }
      let taskSum = 0
      for (const b of buckets) {
        sizeCounts[b.sizeClass]++
        stateCounts[b.state]++
        taskSum += b.tasks.length
      }
      return {
        tier: tier.tier,
        realTaskCount: allTasks.length,
        bucketCount: buckets.length,
        taskSumAcrossBuckets: taskSum,
        countsMatch: taskSum === allTasks.length,
        sizeCounts,
        stateCounts,
        tasks_completed: tier.tasks_completed,
        tasks_computable: tier.tasks_computable,
      }
    })
  }
  return NextResponse.json({ BUCKET_COUNT, results: out })
}
