// Route de debug TEMPORAIRE -- verifie le fix (error RPC jamais checkee) sur
// update-catalog avant de re-brancher le vrai cron. A supprimer apres verification.
import { NextResponse } from 'next/server'
import { runUpdateCatalog } from '../../cron/update-catalog/route'

export async function GET() {
  try {
    const result = await runUpdateCatalog()
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
