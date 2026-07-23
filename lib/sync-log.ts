// lib/sync-log.ts
// Helper commun pour que chaque cron de collecte de référence (neu-sync,
// skyblock-resources-sync, wiki-auto-sync, et les futurs crons de collecte
// joueur) écrive un état lisible dans sync_log — un job qui échoue ou
// n'écrit rien doit être visible en une requête, pas seulement dans les
// logs Vercel qu'on ne consulte qu'après coup.
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function startSync(jobName: string): Promise<number> {
  const { data, error } = await supabase
    .from('sync_log')
    .insert({ job_name: jobName, status: 'running' })
    .select('id')
    .single()
  if (error) throw new Error('sync_log insert failed: ' + error.message)
  return data.id
}

export async function finishSync(
  id: number,
  status: 'success' | 'partial' | 'error',
  rowsWritten: number,
  details?: Record<string, any>,
  errorMsg?: string
): Promise<void> {
  await supabase
    .from('sync_log')
    .update({
      finished_at:  new Date().toISOString(),
      status,
      rows_written: rowsWritten,
      details:      details ?? null,
      error:        errorMsg ?? null,
    })
    .eq('id', id)
}
