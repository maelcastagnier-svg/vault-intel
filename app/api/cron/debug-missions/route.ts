// TEMP debug route — verifies buildMissionCandidates() mixes current tier + unlocked
// tiers below, returns up to 10. Deleted after validation on Cucumber + Orange.
import { NextRequest, NextResponse } from 'next/server'
import { buildMissionCandidates } from '../../player/missions/route'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const uuid = req.nextUrl.searchParams.get('uuid')
  const profileId = req.nextUrl.searchParams.get('profile_id')
  if (!uuid || !profileId) return NextResponse.json({ error: 'uuid and profile_id required' }, { status: 400 })

  const candidates = await buildMissionCandidates(uuid, profileId)
  if (candidates === null) return NextResponse.json({ error: 'not synced' }, { status: 404 })

  const tierCounts: Record<string, number> = {}
  for (const c of candidates) tierCounts[c.tier] = (tierCounts[c.tier] || 0) + 1

  return NextResponse.json({
    count: candidates.length,
    tier_breakdown: tierCounts,
    candidates: candidates.map(c => ({ tier: c.tier, task_title: c.task.task_title, label: c.task.label, current: c.task.current, target: c.task.target })),
  })
}
