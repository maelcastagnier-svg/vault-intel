// TEMPORAIRE — teste computeMilestones() sur Cucumber et Orange sans passer par
// l'auth de session (comptes de test jetables déjà nettoyés). Supprimé après validation.
import { NextResponse } from 'next/server'
import { computeMilestones } from '../../player/milestones/route'
import { runMilestonesSync } from '../milestones-sync/route'

export const maxDuration = 60

const UUID = '74a06395-3a99-4796-95d0-9e392ba3da7e' // Voxui09
const CUCUMBER = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'
const ORANGE   = '35938937-7db6-4f5e-95c5-fecae9084be5'

export async function GET() {
  const sync = await runMilestonesSync()

  const cucumber = await computeMilestones(UUID, CUCUMBER)
  const orange   = await computeMilestones(UUID, ORANGE)
  return NextResponse.json({ sync, cucumber, orange })
}
