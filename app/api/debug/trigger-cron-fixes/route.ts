// app/api/debug/trigger-cron-fixes/route.ts
// TEMPORAIRE -- vérification en conditions réelles des 3 fixes cron du 3 août
// (money-making-agent schema mismatch + get_full_context source périmée,
// setup-generate-agent timeout, radar-agent max_tokens). Supprimée après validation,
// même pattern que les routes de debug déjà utilisées ce chantier.
import { NextRequest, NextResponse } from 'next/server'
import { runMoneyMakingAgent } from '../../cron/money-making-agent/route'
import { runSetupGenerateAgent } from '../../cron/setup-generate-agent/route'
import { runRadarAgent } from '../../cron/radar-agent/route'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const job = req.nextUrl.searchParams.get('job')
  try {
    if (job === 'money-making') return NextResponse.json(await runMoneyMakingAgent())
    if (job === 'setup-generate') return NextResponse.json(await runSetupGenerateAgent())
    if (job === 'radar') return NextResponse.json(await runRadarAgent())
    return NextResponse.json({ error: 'pass ?job=money-making|setup-generate|radar' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
