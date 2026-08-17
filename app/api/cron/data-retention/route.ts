// app/api/cron/data-retention/route.ts
// Chaque nuit à 3h — purge les données anciennes
// Avec le nouveau système ah_scan_buffer, plus de SCAN dans price_history_ah
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { startSync, finishSync } from '../../../../lib/sync-log'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Purge par lots via RPC (LIMIT+boucle) au lieu d'un DELETE monolithique --
// trouve en auditant le 17 aout : un DELETE direct sur ~1,5M lignes de
// price_history_ah retombait en erreur PostgREST (timeout probable) jamais
// verifiee (count coercé à 0 via `|| 0`, error jamais lu) -- le cron
// rapportait "success" chaque nuit depuis des semaines sans jamais rien purger.
async function purgeBatched(rpcName: string, cutoff: string, deadline: number): Promise<{ total: number; error?: string }> {
  let total = 0
  while (Date.now() < deadline) {
    const { data, error } = await supabase.rpc(rpcName, { cutoff_date: cutoff, batch_limit: 200000 })
    if (error) return { total, error: error.message }
    const deleted = (data as number) || 0
    total += deleted
    if (deleted < 200000) break // lot incomplet = plus rien à purger
  }
  return { total }
}

export async function runDataRetention() {
  const deadline = Date.now() + 50_000 // marge sous maxDuration=60
  const results: Record<string, number> = {}
  const errors: string[] = []

  // 1. Purge SCAN résiduels dans price_history_ah (ancienne architecture)
  const { count: scanDeleted, error: scanErr } = await supabase
    .from('price_history_ah')
    .delete({ count: 'exact' })
    .eq('granularity', 'SCAN')
  if (scanErr) errors.push('scan_deleted: ' + scanErr.message)
  results.scan_deleted = scanDeleted || 0

  // 2. Purge DAILY/DAILY_EXACT > 3 ans -- table volumineuse, purge par lots
  const threeYearsAgo = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString().split('T')[0]
  const daily = await purgeBatched('delete_old_price_history_ah', threeYearsAgo, deadline)
  if (daily.error) errors.push('daily_deleted: ' + daily.error)
  results.daily_deleted = daily.total

  // 3. Purge price_history Bazaar > 6 ans -- par lots aussi (même prudence)
  const sixYearsAgo = new Date(Date.now() - 6 * 365 * 86_400_000).toISOString().split('T')[0]
  const bazaar = await purgeBatched('delete_old_price_history_by_bucket_date', sixYearsAgo, deadline)
  if (bazaar.error) errors.push('bazaar_deleted: ' + bazaar.error)
  results.bazaar_deleted = bazaar.total

  // 4. Purge ah_scan_buffer résiduel (au cas où ah-aggregate aurait raté)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]
  const { count: bufferDeleted, error: bufErr } = await supabase
    .from('ah_scan_buffer')
    .delete({ count: 'exact' })
    .lt('scan_date', yesterday)
  if (bufErr) errors.push('buffer_deleted: ' + bufErr.message)
  results.buffer_deleted = bufferDeleted || 0

  // 5. Purge claude_memory > 90 jours
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { count: memDeleted, error: memErr } = await supabase
    .from('claude_memory')
    .delete({ count: 'exact' })
    .lt('archived_at', ninetyDaysAgo)
  if (memErr) errors.push('memory_deleted: ' + memErr.message)
  results.memory_deleted = memDeleted || 0

  return { results, errors }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logId = await startSync('data-retention')

  try {
    const { results, errors } = await runDataRetention()
    const total = Object.values(results).reduce((s, v) => s + v, 0)
    // Un des sous-purges en erreur ne doit plus jamais être masqué par les
    // autres purges réussis -- statut 'partial' explicite plutôt que 'success'.
    const status = errors.length > 0 ? 'partial' : 'success'
    await finishSync(logId, status, total, { ...results, errors })
    return NextResponse.json({ success: errors.length === 0, ...results, errors })
  } catch (e: any) {
    await finishSync(logId, 'error', 0, undefined, e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
