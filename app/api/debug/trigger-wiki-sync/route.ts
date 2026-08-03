// app/api/debug/trigger-wiki-sync/route.ts
// TEMPORAIRE -- vérification en conditions réelles de attribute_milestones (3 août,
// checkpoint wiki lot 1). Supprimée après validation.
import { NextResponse } from 'next/server'
import { runWikiReferentialSync } from '../../cron/wiki-referential-sync/route'

export const maxDuration = 60

export async function GET() {
  try {
    return NextResponse.json(await runWikiReferentialSync())
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
