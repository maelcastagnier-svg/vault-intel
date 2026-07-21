// app/api/cron/historic-import/route.ts
// Import historique complet :
// BAZAAR → Hypixel API (1933 items officiels) → SkyCofl history → price_history
// AH     → SkyCofl AUCTION (3798 items)       → SkyCofl history → price_history_ah
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PER_TYPE = 10
const SKYCOFL_HEADERS = {
  'Authorization': `Bearer ${process.env.SKYCOFL_ACCOUNT_TOKEN}`,
  'Accept': 'application/json'
}

function getDailyBucket(ts: Date): string {
  return ts.toISOString().split('T')[0]
}

function isDeadError(msg: string): boolean {
  return msg.includes('400') || msg.includes('404') ||
         msg.includes('403') || msg.includes('No data') ||
         msg.includes('item_not_found')
}

// ── BAZAAR ────────────────────────────────────────────────────
async function importBazaar(item_id: string): Promise<number> {
  const res = await fetch(
    `https://sky.coflnet.com/api/bazaar/${encodeURIComponent(item_id)}/history`,
    { headers: SKYCOFL_HEADERS }
  )
  if (!res.ok) throw new Error(`Bazaar ${res.status}`)

  const points: { buy: number; sell: number; sellVolume: number; buyVolume: number; timestamp: string }[] = await res.json()
  if (!Array.isArray(points) || points.length === 0) throw new Error('No data')

  let inserted = 0
  for (let i = 0; i < points.length; i += 50) {
    const results = await Promise.all(points.slice(i, i + 50).map(p =>
      supabase.rpc('upsert_bazaar_price_bucket', {
        p_item_id:     item_id,
        p_item_name:   item_id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()),
        p_buy_price:   p.buy   ?? 0,
        p_sell_price:  p.sell  ?? 0,
        p_avg_price:   ((p.buy ?? 0) + (p.sell ?? 0)) / 2,
        p_volume:      p.sellVolume ?? p.buyVolume ?? 0,
        p_bucket_date: getDailyBucket(new Date(p.timestamp))
      })
    ))
    inserted += results.filter(r => !r.error).length
  }
  return inserted
}

// ── AH ───────────────────────────────────────────────────────
async function importAH(item_id: string): Promise<number> {
  const res = await fetch(
    `https://sky.coflnet.com/api/item/price/${encodeURIComponent(item_id)}/history/full`,
    { headers: SKYCOFL_HEADERS }
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AH ${res.status} ${text.slice(0, 100)}`)
  }

  const points: { min: number; max: number; avg: number; volume: number; time: string }[] = await res.json()
  if (!Array.isArray(points) || points.length === 0) throw new Error('No data')

  let inserted = 0
  for (let i = 0; i < points.length; i += 50) {
    const results = await Promise.all(points.slice(i, i + 50).map(p => {
      const ts = new Date(typeof p.time === 'number' ? p.time * 1000 : p.time)
      return supabase.rpc('upsert_ah_price_bucket', {
        p_base_item_id: item_id,
        p_variant_key:  'nostar_norecomb_noreforge',
        p_total_stars:  0,
        p_is_recomb:    false,
        p_reforge:      null,
        p_buy_price:    p.max ?? p.avg,
        p_sell_price:   p.min ?? p.avg,
        p_avg_price:    p.avg,
        p_volume:       p.volume ?? 0,
        p_granularity:  'DAILY',
        p_bucket_date:  getDailyBucket(ts),
      })
    }))
    inserted += results.filter(r => !r.error).length
  }
  return inserted
}

// ── Process item ─────────────────────────────────────────────
async function processItem(item: { item_id: string; item_type: string }) {
  try {
    const rows = item.item_type === 'BAZAAR'
      ? await importBazaar(item.item_id)
      : await importAH(item.item_id)

    await supabase.from('historic_import_progress')
      .update({ status: 'done', years_completed: 3, last_processed_at: new Date().toISOString() })
      .eq('item_id', item.item_id)

    return { item_id: item.item_id, type: item.item_type, rows, ok: true, dead: false, error: '' }
  } catch (err: any) {
    const dead = isDeadError(err.message)
    await supabase.from('historic_import_progress')
      .update({ status: 'done', last_processed_at: new Date().toISOString() })
      .eq('item_id', item.item_id)
    return { item_id: item.item_id, type: item.item_type, rows: 0, ok: false, dead, error: err.message.slice(0, 100) }
  }
}

// ── Handler ──────────────────────────────────────────────────
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch items pending (BAZAAR en priorité)
  const [{ data: bzItems }, { data: ahItems }] = await Promise.all([
    supabase.from('historic_import_progress')
      .select('item_id, item_type')
      .eq('status', 'pending').eq('item_type', 'BAZAAR')
      .order('item_id').limit(PER_TYPE),
    supabase.from('historic_import_progress')
      .select('item_id, item_type')
      .eq('status', 'pending').eq('item_type', 'AH')
      .order('item_id').limit(PER_TYPE),
  ])

  const items = [...(bzItems || []), ...(ahItems || [])]
  if (items.length === 0) return NextResponse.json({ message: 'All done! 🎉' })

  const results = []
  for (const item of items) {
    results.push(await processItem(item))
  }

  return NextResponse.json({
    success:    true,
    processed:  results.length,
    bazaar:     results.filter(r => r.type === 'BAZAAR').length,
    ah:         results.filter(r => r.type === 'AH').length,
    successful: results.filter(r => r.ok).length,
    dead:       results.filter(r => r.dead).length,
    total_rows: results.reduce((s, r) => s + r.rows, 0),
    errors:     results.filter(r => !r.ok && !r.dead).map(r => ({ item_id: r.item_id, error: r.error })),
    sample_ok:  results.filter(r => r.ok).slice(0, 3).map(r => ({ item_id: r.item_id, rows: r.rows })),
  })
}