// TEMPORAIRE — preview des missions candidates pour Cucumber et Orange, sans ecrire
// dans player_missions (test avant commit, comme demande). Supprime apres validation.
import { NextResponse } from 'next/server'
import { buildMissionCandidates } from '../../player/missions/route'

const UUID = '74a06395-3a99-4796-95d0-9e392ba3da7e' // Voxui09
const CUCUMBER = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'
const ORANGE   = '35938937-7db6-4f5e-95c5-fecae9084be5'

export async function GET() {
  const cucumber = await buildMissionCandidates(UUID, CUCUMBER)
  const orange   = await buildMissionCandidates(UUID, ORANGE)
  return NextResponse.json({ cucumber, orange })
}
