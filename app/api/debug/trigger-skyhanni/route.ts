// Route de debug temporaire -- supprimée après vérification.
import { NextResponse } from 'next/server'
import { runSkyhanniRepoSync } from '../../cron/skyhanni-repo-sync/route'

export async function GET() {
  const result = await runSkyhanniRepoSync()
  return NextResponse.json(result)
}
