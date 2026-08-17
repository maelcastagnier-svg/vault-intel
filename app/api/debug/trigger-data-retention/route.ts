// Route de debug TEMPORAIRE -- verifie le fix (purge par lots + error jamais
// checkee) sur data-retention avant de re-brancher le vrai cron. A supprimer
// apres verification. maxDuration eleve car premiere purge = ~1.5M lignes de
// retard (backlog jamais purge depuis des semaines).
import { NextResponse } from 'next/server'
import { runDataRetention } from '../../cron/data-retention/route'

export const maxDuration = 300

export async function GET() {
  try {
    const { results, errors } = await runDataRetention()
    return NextResponse.json({ success: errors.length === 0, ...results, errors })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
