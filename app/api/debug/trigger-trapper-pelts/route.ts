// Route de debug TEMPORAIRE -- verifie le fix du regex {{ID|...}}->{{Item|...}}
// sur la page wiki "Pelts" (regression reelle trouvee via sync_log le 17 aout,
// wiki-referential-sync partial : "pelts: 0 modificateurs extraits"). A
// supprimer une fois le comportement verifie en base reelle.
import { NextResponse } from 'next/server'
import { syncTrapperPelts } from '../../cron/wiki-referential-sync/route'

export async function GET() {
  try {
    const rows = await syncTrapperPelts()
    return NextResponse.json({ success: true, rows })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
