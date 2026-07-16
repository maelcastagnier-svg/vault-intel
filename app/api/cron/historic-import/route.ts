// app/api/cron/historic-import/route.ts
// Import historique depuis SkyCofl
// Bazaar : /api/bazaar/{item_id}/history         → 6 ans
// AH     : /api/item/price/{item_id}/history/full → historique complet
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { extractVariantFromName } from '@/lib/text-variant-extractor'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ITEMS_PER_RUN   = 20
const SKYCOFL_TOKEN   = process.env.SKYCOFL_ACCOUNT_TOKEN!
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

// ============================================================
// IMPORT BAZAAR — /api/bazaar/{id}/history
// ============================================================
async function importBazaar(item_id: string): Promise<number> {
  const res = await fetch(
    `https://sky.coflnet.com/api/bazaar/${item_id}/history`,
    { headers: SKYCOFL_HEADERS }
  )

  if (!res.ok) throw new Error(`SkyCofl Bazaar ${res.status} for ${item_id}`)

  const points: {
    buy:        number
    sell:       number
    sellVolume: number
    buyVolume:  number
    timestamp:  string
  }[] = await res.json()

  if (!Array.isArray(points) || points.length === 0)
    throw new Error(`No data for ${item_id}`)

  for (let i = 0; i < points.length; i += 50) {
    await Promise.all(
      points.slice(i, i + 50).map(p =>
        supabase.rpc('upsert_bazaar_price_bucket', {
          p_item_id:     item_id,
          p_item_name:   item_id.replace(/_/g, ' '),
          p_buy_price:   p.buy,
          p_sell_price:  p.sell,
          p_avg_price:   (p.buy + p.sell) / 2,
          p_volume:      p.sellVolume ?? 0,
          p_bucket_date: getDailyBucket(new Date(p.timestamp))
        })
      )
    )
  }

  return points.length
}

// ============================================================
// IMPORT AH — /api/item/price/{id}/history/full
// ============================================================
async function importAH(
  item_id:   string,
  liquidity: 'HIGH' | 'LOW'
): Promise<number> {
  const res = await fetch(
    `https://sky.coflnet.com/api/item/price/${item_id}/history/full`,
    { headers: SKYCOFL_HEADERS }
  )

  if (!res.ok) throw new Error(`SkyCofl AH ${res.status} for ${item_id}`)

  const points: {
    min:    number
    max:    number
    avg:    number
    volume: number
    time:   string
  }[] = await res.json()

  if (!Array.isArray(points) || points.length === 0)
    throw new Error(`No data for ${item_id}`)

  const item_name    = item_id.replace(/_/g, ' ')
  const v            = extractVariantFromName(item_name)
  const base_item_id = toBaseItemId(v.baseName) || item_id
  const isHigh       = liquidity === 'HIGH'

  for (let i = 0; i < points.length; i += 50) {
    await Promise.all(
      points.slice(i, i + 50).map(p => {
        const ts          = new Date(p.time)
        const granularity = isHigh ? 'DAILY' : 'MONTHLY'
        const bucketDate  = isHigh ? getDailyBucket(ts) : getMonthlyBucket(ts)

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
          p_granularity:  granularity,
          p_bucket_date:  bucketDate
        })
      })
    )
  }

  return points.length
}

// ============================================================
// TRAITEMENT D'UN ITEM
// ============================================================
async function processItem(item: {
  item_id:   string
  item_type: string
  liquidity: string
}): Promise<{ item_id: string; rows: number; error?: string; status: string }> {
  const { item_id, item_type, liquidity } = item

  try {
    const rows = item_type === 'BAZAAR'
      ? await importBazaar(item_id)
      : await importAH(item_id, liquidity as 'HIGH' | 'LOW')

    await supabase
      .from('historic_import_progress')
      .update({
        years_completed:   3,
        status:            'done',
        last_processed_at: new Date().toISOString()
      })
      .eq('item_id', item_id)

    return { item_id, rows, status: 'done' }

  } catch (err: any) {
    const dead = isDeadError(err.message)

    await supabase
      .from('historic_import_progress')
      .update({
        status:            dead ? 'done' : 'pending',
        last_processed_at: new Date().toISOString()
      })
      .eq('item_id', item_id)

    return { item_id, rows: 0, error: err.message, status: dead ? 'done' : 'pending' }
  }
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: nextItems, error } = await supabase
      .from('historic_import_progress')
      .select('item_id, item_type, liquidity')
      .eq('status', 'pending')
      .order('item_id', { ascending: true })
      .limit(ITEMS_PER_RUN)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!nextItems || nextItems.length === 0)
      return NextResponse.json({ message: 'All items done!' })

    const results = []
    for (const item of nextItems) {
      results.push(await processItem(item))
    }

    return NextResponse.json({
      success:         true,
      items_processed: results.length,
      successful:      results.filter(r => !r.error).length,
      dead_items:      results.filter(r => r.status === 'done' && r.error).length,
      retry_later:     results.filter(r => r.status === 'pending' && r.error).length,
      total_rows:      results.reduce((s, r) => s + r.rows, 0),
      results
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}