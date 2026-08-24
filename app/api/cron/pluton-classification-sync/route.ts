// app/api/cron/pluton-classification-sync/route.ts
// Rejoue runActivityClassification() (lib/pluton-classification.ts, 24 aout)
// -- applique le ruleset pluton_classification_rules aux lignes pluton_elements
// encore non classees. Idempotent (chaque regle est WHERE activity IS NULL),
// donc safe a rejouer sans risque de double-classification. Cadence
// hebdomadaire (meme rythme que pluton-weekly-sync) -- la cartographie
// grandit lentement, pas besoin d'une frequence plus elevee. N'invente
// aucune regle : ce cron REJOUE un ruleset deja ecrit/verifie, il n'en crée
// pas de nouvelles -- voir sampleUnclassifiedPageTitles() pour la voie
// d'extension (revue manuelle avant tout INSERT dans le ruleset).
import { NextResponse } from 'next/server'
import { runActivityClassification } from '../../../../lib/pluton-classification'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 120

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('pluton-classification-sync')
  try {
    const report = await runActivityClassification()
    await finishSync(logId, 'success', report.rows_classified_source_table + report.rows_classified_keyword, report)
    return NextResponse.json(report)
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
