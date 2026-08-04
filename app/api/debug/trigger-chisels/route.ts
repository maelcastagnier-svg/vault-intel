import { NextResponse } from 'next/server'
import { runWikiReferentialSync } from '../../cron/wiki-referential-sync/route'

export const maxDuration = 60

export async function GET() {
  const result = await runWikiReferentialSync()
  return NextResponse.json(result)
}
