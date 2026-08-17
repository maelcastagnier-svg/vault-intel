// Route de debug TEMPORAIRE -- appelle runPlutonWeeklySync() directement pour
// verification avant merge dans vercel.json (meme pattern que tout le projet).
// A supprimer une fois le comportement verifie en base reelle.
import { NextResponse } from 'next/server'
import { runPlutonWeeklySync } from '../../cron/pluton-weekly-sync/route'

export const maxDuration = 300

export async function GET() {
  const result = await runPlutonWeeklySync()
  return NextResponse.json(result)
}
