// app/api/cron/historic-import/route.ts
// 10 BAZAAR + 10 AH par run — jamais bloqué par l'ordre alphabétique
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { extractVariantFromName } from '@/lib/text-variant-extractor'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PER_TYPE      = 10  // 10 Bazaar + 10 AH = 20 par run
const SKYCOFL_TOKEN = process.env.SKYCOFL_ACCOUNT_TOKEN!
const SKYCOFL_HEADERS = {
  'Authorization': `Bearer ${SKYCOFL_TOKEN}`,
  'Accept':        'application/json'
}

function getDailyBucket(ts: Date): string {
  return ts.toISOString().split('T')[0]
}

function getMonthlyBucket(ts: Date): string {
  return `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function toBaseItemId(baseName: string): string {
  return baseName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
}

function isDeadError(msg: string): boolean {
  return msg.includes('404') || msg.includes('403') ||
         msg.includes('No data') || msg.includes('No JSON')
}

// ── Bazaar ───────────────────────────────────────────────────
async function importBazaar(item_id: string): Promise<number> {
  const res = await fetch(
    `https://sky.coflnet.com/api/bazaar/${item_id}/history`,
    { headers: SKYCOFL_HEADERS }
  )
  if (!res.ok) throw new Error(`Bazaar ${res.status}`)

  const points: { buy: number; sell: number; sellVolume: number; timestamp: string }[] = await res.json()
  if (!Array.isArray(points) || points.length === 0) throw new Error('No data')

  for (let i = 0; i < points.length; i += 50) {
    await Promise.all(points.slice(i, i + 50).map(p =>
      supabase.rpc('upsert_bazaar_price_bucket', {
        p_item_id:     item_id,
        p_item_name:   item_id.replace(/_/g, ' '),
        p_buy_price:   p.buy,
        p_sell_price:  p.sell,
        p_avg_price:   (p.buy + p.sell) / 2,
        p_volume:      p.sellVolume ?? 0,
        p_bucket_date: getDailyBucket(new Date(p.timestamp))
      })
    ))
  }
  return points.length
}

// ── AH ──────────────────────────────────────────────────────
async function importAH(item_id: string, liquidity: 'HIGH' | 'LOW'): Promise<number> {
  const res = await fetch(
    `https://sky.coflnet.com/api/item/price/${item_id}/history/full`,
    { headers: SKYCOFL_HEADERS }
  )
  if (!res.ok) throw new Error(`AH ${res.status}`)

  const points: { min: number; max: number; avg: number; volume: number; time: string }[] = await res.json()
  if (!Array.isArray(points) || points.length === 0) throw new Error('No data')

  const item_name    = item_id.replace(/_/g, ' ')
  const v            = extractVariantFromName(item_name)
  const base_item_id = toBaseItemId(v.baseName) || item_id
  const isHigh       = liquidity === 'HIGH'

  for (let i = 0; i < points.length; i += 50) {
    await Promise.all(points.slice(i, i + 50).map(p => {
      const ts = new Date(p.time)
      return supabase.rpc('upsert_ah_price_bucket', {
        p_base_item_id: base_item_id,
        p_variant_key:  v.variantKey,
        p_item_name:    item_name,
        p_total_stars:  v.totalStars,
        p_is_recomb:    v.recombobulated,
        p_reforge:      v.reforge ?? null,
        p_has_dye:      v.hasDye,
        p_buy_price:    p.max,
        p_sell_price:   p.min,
        p_avg_price:    p.avg,
        p_volume:       p.volume ?? 0,
        p_granularity:  isHigh ? 'DAILY' : 'MONTHLY',
        p_bucket_date:  isHigh ? getDailyBucket(ts) : getMonthlyBucket(ts)
      })
    }))
  }
  return points.length
}

// ── Process un item ──────────────────────────────────────────
async function processItem(item: { item_id: string; item_type: string; liquidity: string }) {
  try {
    const rows = item.item_type === 'BAZAAR'
      ? await importBazaar(item.item_id)
      : await importAH(item.item_id, item.liquidity as 'HIGH' | 'LOW')

    await supabase.from('historic_import_progress')
      .update({ status: 'done', years_completed: 3, last_processed_at: new Date().toISOString() })
      .eq('item_id', item.item_id)

    return { item_id: item.item_id, type: item.item_type, rows, ok: true }
  } catch (err: any) {
    const dead = isDeadError(err.message)
    await supabase.from('historic_import_progress')
      .update({ status: dead ? 'done' : 'pending', last_processed_at: new Date().toISOString() })
      .eq('item_id', item.item_id)
    return { item_id: item.item_id, type: item.item_type, rows: 0, ok: false, dead, error: err.message }
  }
}

// ── Handler ──────────────────────────────────────────────────
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Récupère 10 BAZAAR + 10 AH séparément — jamais bloqués l'un par l'autre
    const [bazaarRes, ahRes] = await Promise.all([
      supabase.from('historic_import_progress')
        .select('item_id, item_type, liquidity')
        .eq('status', 'pending')
        .eq('item_type', 'BAZAAR')
        .order('item_id', { ascending: true })
        .limit(PER_TYPE),
      supabase.from('historic_import_progress')
        .select('item_id, item_type, liquidity')
        .eq('status', 'pending')
        .eq('item_type', 'AH')
        .order('item_id', { ascending: true })
        .limit(PER_TYPE),
    ])

    const items = [...(bazaarRes.data || []), ...(ahRes.data || [])]

    if (items.length === 0) {
      return NextResponse.json({ message: 'All items done!' })
    }

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
      dead:       results.filter(r => !r.ok && r.dead).length,
      total_rows: results.reduce((s, r) => s + r.rows, 0),
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}