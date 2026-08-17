// Route de debug TEMPORAIRE -- appelle runPlutonWeeklySync() directement pour
// verification avant merge dans vercel.json (meme pattern que tout le projet).
// Appelle startSync/finishSync comme le vrai handler cron -- sinon le
// watermark de la phase d'extraction n'avance jamais et chaque retest
// rescanne le meme residu (trouve en testant, corrige avant d'aller plus loin).
// A supprimer une fois le comportement verifie en base reelle.
import { NextResponse } from 'next/server'
import { runPlutonWeeklySync } from '../../cron/pluton-weekly-sync/route'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 300

export async function GET() {
  const logId = await startSync('pluton-weekly-sync')
  try {
    const result = await runPlutonWeeklySync()
    const rows = result.extraction.b1_rows + result.classification.wte_rows + result.classification.whe_rows
    await finishSync(logId, 'success', rows, result)
    return NextResponse.json(result)
  } catch (error: any) {
    await finishSync(logId, 'error', 0, undefined, error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
