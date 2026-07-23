// TEMPORAIRE — verifie les 3 formes de donnees reelles (Skills/Milestones/Missions) pour
// Cucumber ET Orange avant de committer le frontend Evolve. Supprime apres validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeMilestones } from '../../player/milestones/route'
import { buildMissionCandidates } from '../../player/missions/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UUID = '74a06395-3a99-4796-95d0-9e392ba3da7e' // Voxui09
const CUCUMBER = 'b077f27a-60f7-46d9-be13-c4689a01dc3b'
const ORANGE   = '35938937-7db6-4f5e-95c5-fecae9084be5'

async function skillsFor(profileId: string) {
  const { data, error } = await supabase
    .from('player_skill_cards')
    .select('game_stage, networth, purse, cards, model, generated_at')
    .eq('hypixel_uuid', UUID)
    .eq('profile_id', profileId)
    .single()
  return error ? { error: error.message } : data
}

export async function GET() {
  const cucumber = {
    skills: await skillsFor(CUCUMBER),
    milestones: await computeMilestones(UUID, CUCUMBER),
    missions: await buildMissionCandidates(UUID, CUCUMBER),
  }
  const orange = {
    skills: await skillsFor(ORANGE),
    milestones: await computeMilestones(UUID, ORANGE),
    missions: await buildMissionCandidates(UUID, ORANGE),
  }
  return NextResponse.json({ cucumber, orange })
}
