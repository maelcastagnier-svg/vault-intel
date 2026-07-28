// app/api/debug/audit-ah-collect/route.ts
// TEMPORAIRE -- urgence : ah_live vide signalé, diagnostic direct sur
// sync_log + ah_live avant de proposer un fix. Supprimée après diagnostic.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data: lock } = await supabase
    .from('cron_locks').select('*').eq('job_name', 'ah_collect').maybeSingle()

  const { count: ahLiveCount } = await supabase
    .from('ah_live').select('*', { count: 'exact', head: true })

  const { data: ahLiveSample } = await supabase
    .from('ah_live').select('*').limit(3)

  const { count: bufferCount } = await supabase
    .from('ah_scan_buffer').select('*', { count: 'exact', head: true })

  const { data: bufferLatest } = await supabase
    .from('ah_scan_buffer').select('*').order('last_scan_at', { ascending: false }).limit(3)

  // Test direct de l'endpoint Hypixel lui-même (public, sans clé) pour
  // écarter une panne côté Hypixel avant de suspecter notre code.
  let hypixelStatus: any = null
  try {
    const res = await fetch('https://api.hypixel.net/v2/skyblock/auctions')
    const data = await res.json()
    hypixelStatus = { http: res.status, success: data.success, totalPages: data.totalPages, auctionsOnPage0: data.auctions?.length }
  } catch (e: any) {
    hypixelStatus = { error: e.message }
  }

  return NextResponse.json({
    cron_lock: lock,
    ah_live_count: ahLiveCount,
    ah_live_sample: ahLiveSample,
    ah_scan_buffer_count: bufferCount,
    ah_scan_buffer_latest: bufferLatest,
    hypixel_endpoint_test: hypixelStatus,
    now: new Date().toISOString(),
  })
}
