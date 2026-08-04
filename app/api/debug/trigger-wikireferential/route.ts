// Route de debug temporaire -- supprimée après vérification.
import { NextResponse } from 'next/server'
import { runWikiReferentialSync } from '../../cron/wiki-referential-sync/route'

export async function GET() {
  const result = await runWikiReferentialSync()
  return NextResponse.json(result)
}
