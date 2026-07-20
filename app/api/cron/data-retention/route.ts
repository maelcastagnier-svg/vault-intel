// app/api/cron/data-retention/route.ts
// Chaque nuit à 3h — purge les données anciennes
// Avec le nouveau système ah_scan_buffer, plus de SCAN dans price_history_ah
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, number> = {}

  // 1. Purge SCAN résiduels dans price_history_ah (ancienne architecture)
  const { count: scanDeleted } = await supabase
    .from('price_history_ah')
    .delete({ count: 'exact' })
    .eq('granularity', 'SCAN')
  results.scan_deleted = scanDeleted || 0

  // 2. Purge DAILY > 3 ans
  const threeYearsAgo = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString().split('T')[0]
  const { count: dailyDeleted } = await supabase
    .from('price_history_ah')
    .delete({ count: 'exact' })
    .in('granularity', ['DAILY', 'DAILY_EXACT'])
    .lt('bucket_date', threeYearsAgo)
  results.daily_deleted = dailyDeleted || 0

  // 3. Purge price_history Bazaar > 6 ans
  const sixYearsAgo = new Date(Date.now() - 6 * 365 * 86_400_000).toISOString().split('T')[0]
  const { count: bzDeleted } = await supabase
    .from('price_history')
    .delete({ count: 'exact' })
    .lt('bucket_date', sixYearsAgo)
  results.bazaar_deleted = bzDeleted || 0

  // 4. Purge ah_scan_buffer résiduel (au cas où ah-aggregate aurait raté)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]
  const { count: bufferDeleted } = await supabase
    .from('ah_scan_buffer')
    .delete({ count: 'exact' })
    .lt('scan_date', yesterday)
  results.buffer_deleted = bufferDeleted || 0

  // 5. Purge claude_memory > 90 jours
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { count: memDeleted } = await supabase
    .from('claude_memory')
    .delete({ count: 'exact' })
    .lt('archived_at', ninetyDaysAgo)
  results.memory_deleted = memDeleted || 0

  return NextResponse.json({ success: true, ...results })
}