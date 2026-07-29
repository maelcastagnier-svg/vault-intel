// lib/milestone-buckets.ts
// Pure transform, zero network/API calls -- turns a tier's real task list
// (120 to 507 tasks depending on tier) into a fixed 100-bucket path so the
// horizontal route UI never renders more than ~130 nodes per tier
// regardless of how many real tasks exist underneath. Buckets are assigned
// by POSITION in the task list (a fixed structure, identical for every
// player), never by real completion -- only a bucket's fill STATE reflects
// this specific player's progress. Confirmed with the user: this is the
// intended interpretation, not a live-progress tick mark.
import type { MilestoneTier, EvaluatedTask } from '../app/dashboard/evolve/types'

export const BUCKET_COUNT = 100

export type BucketSizeClass = 'big' | 'medium' | 'small'
export type BucketState = 'complete' | 'partial' | 'not_started' | 'untrackable' | 'no_tasks'

export type MilestoneBucket = {
  index: number
  sizeClass: BucketSizeClass
  state: BucketState
  tasks: EvaluatedTask[]
}

function sizeClassFor(index: number): BucketSizeClass {
  if (index % 10 === 0) return 'big'
  if (index % 5 === 0) return 'medium'
  return 'small'
}

function stateFor(tasks: EvaluatedTask[]): BucketState {
  if (tasks.length === 0) return 'no_tasks'
  const trackable = tasks.filter(t => t.data_available)
  if (trackable.length === 0) return 'untrackable'
  const completedCount = trackable.filter(t => t.met).length
  if (completedCount === trackable.length) return 'complete'
  if (completedCount > 0) return 'partial'
  return 'not_started'
}

export function bucketizeTier(tier: MilestoneTier): MilestoneBucket[] {
  const allTasks = [...tier.wiki_tasks, ...tier.vault_tasks]

  const buckets: MilestoneBucket[] = Array.from({ length: BUCKET_COUNT }, (_, i) => ({
    index: i,
    sizeClass: sizeClassFor(i),
    state: 'no_tasks',
    tasks: [],
  }))

  allTasks.forEach((task, i) => {
    const bucketIndex = Math.min(BUCKET_COUNT - 1, Math.floor((i / allTasks.length) * BUCKET_COUNT))
    buckets[bucketIndex].tasks.push(task)
  })

  for (const bucket of buckets) bucket.state = stateFor(bucket.tasks)

  return buckets
}
