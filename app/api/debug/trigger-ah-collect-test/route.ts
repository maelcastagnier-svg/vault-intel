// Route de debug TEMPORAIRE (11 aout) -- verification des 2 fixes cout
// ah-collect (batch sold-prices + suppression du calcul blended gaspille)
// avant merge sur master. Appelle runAhCollect() directement, meme pattern
// que toutes les verifications precedentes de ce cron -- a supprimer apres
// validation.
import { NextResponse } from 'next/server'
import { runAhCollect } from '../../cron/ah-collect/route'

export const maxDuration = 60

export async function GET() {
  const started = Date.now()
  try {
    const result = await runAhCollect()
    return NextResponse.json({ success: true, duration_ms: Date.now() - started, result })
  } catch (e: any) {
    return NextResponse.json({ success: false, duration_ms: Date.now() - started, error: String(e?.message ?? e) }, { status: 500 })
  }
}
