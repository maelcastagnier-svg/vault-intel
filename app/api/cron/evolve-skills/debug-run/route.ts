// app/api/cron/evolve-skills/debug-run/route.ts
// TEMPORAIRE — déclenche runEvolveSkills() sans le header CRON_SECRET (indisponible en local)
// pour valider les 9 cartes sur Cucumber et Orange avant de faire confiance au cron réel.
// Ecrit dans player_skill_cards comme le vrai cron (pas un dry-run). À supprimer après validation.
import { NextRequest, NextResponse } from 'next/server'
import { runEvolveSkills } from '../route'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const profileIdsParam = req.nextUrl.searchParams.get('profile_ids')
  const filterProfileIds = profileIdsParam ? profileIdsParam.split(',') : undefined
  const result = await runEvolveSkills(filterProfileIds)
  return NextResponse.json(result)
}
