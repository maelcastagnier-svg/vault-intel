// app/api/cron/historic-import/route.ts
// Import historique SkyCofl → price_history_ah
// Applique le mapping SkyCofl ID → Hypixel ID
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { extractVariantFromName } from '@/lib/text-variant-extractor'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PER_RUN = 20
const SKYCOFL_HEADERS = {
  'Authorization': `Bearer ${process.env.SKYCOFL_ACCOUNT_TOKEN}`,
  'Accept':        'application/json'
}

// Mapping SkyCofl ID → Hypixel ID
const SKYCOFL_TO_HYPIXEL: Record<string, string> = {
  // Necron set
  'POWER_WITHER_HELMET':     'NECRON_HELMET',
  'POWER_WITHER_CHESTPLATE': 'NECRON_CHESTPLATE',
  'POWER_WITHER_LEGGINGS':   'NECRON_LEGGINGS',
  'POWER_WITHER_BOOTS':      'NECRON_BOOTS',
  // Storm set
  'SPEED_WITHER_HELMET':     'STORM_HELMET',
  'SPEED_WITHER_CHESTPLATE': 'STORM_CHESTPLATE',
  'SPEED_WITHER_LEGGINGS':   'STORM_LEGGINGS',
  'SPEED_WITHER_BOOTS':      'STORM_BOOTS',
  // Maxor set
  'TANK_WITHER_HELMET':      'MAXOR_HELMET',
  'TANK_WITHER_CHESTPLATE':  'MAXOR_CHESTPLATE',
  'TANK_WITHER_LEGGINGS':    'MAXOR_LEGGINGS',
  'TANK_WITHER_BOOTS':       'MAXOR_BOOTS',
  // Goldor set
  'WISE_WITHER_HELMET':      'GOLDOR_HELMET',
  'WISE_WITHER_CHESTPLATE':  'GOLDOR_CHESTPLATE',
  'WISE_WITHER_LEGGINGS':    'GOLDOR_LEGGINGS',
  'WISE_WITHER_BOOTS':       'GOLDOR_BOOTS',
  // Shadow Assassin set
  'WITHER_HELMET':            'SHADOW_ASSASSIN_HELMET',
  'WITHER_CHESTPLATE':        'SHADOW_ASSASSIN_CHESTPLATE',
  'WITHER_LEGGINGS':          'SHADOW_ASSASSIN_LEGGINGS',
  'WITHER_BOOTS':             'SHADOW_ASSASSIN_BOOTS',
  // Starred items
  'STARRED_MIDAS_SWORD':      'MIDAS_SWORD',
  'STARRED_MIDAS_STAFF':      'MIDAS_STAFF',
  'STARRED_DAEDALUS_AXE':     'DAEDALUS_AXE',
}

function getDailyBucket(ts: Date): string {
  return ts.toISOString().split('T')[0]
}

function isDeadError(msg: string): boolean {
  return msg.includes('400') || msg.includes('404') ||
         msg.includes('403') || msg.includes('No data') ||
         msg.includes('item_not_found')
}

async function importAH(skycofl_id: string): Promise<number> {
  const res = await fetch(
    `https://sky.coflnet.com/api/item/price/${encodeURIComponent(skycofl_id)}/history/full`,
    { headers: SKYCOFL_HEADERS }
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AH ${res.status} ${text.slice(0, 100)}`)
  }

  const points: { min: number; max: number; avg: number; volume: number; time: string }[] = await res.json()
  if (!Array.isArray(points) || points.length === 0) throw new Error('No data')

  // Applique le mapping SkyCofl → Hypixel si disponible
  const base_item_id = SKYCOFL_TO_HYPIXEL[skycofl_id] || skycofl_id
  const item_name    = base_item_id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  const variant_key  = 'nostar_norecomb_noreforge'  // historique brut SkyCofl = base

  let inserted = 0
  for (let i = 0; i < points.length; i += 50) {
    const batch = points.slice(i, i + 50)
    const results = await Promise.all(batch.map(p => {
      const ts = new Date(typeof p.time === 'number' ? p.time * 1000 : p.time)
      return supabase.rpc('upsert_ah_price_bucket', {
        p_base_item_id: base_item_id,
        p_variant_key:  variant_key,
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

async function processItem(item: { item_id: string; item_type: string }) {
  try {
    const rows = await importAH(item.item_id)

    await supabase.from('historic_import_progress')
      .update({ status: 'done', years_completed: 3, last_processed_at: new Date().toISOString() })
      .eq('item_id', item.item_id)

    return { item_id: item.item_id, rows, ok: true, dead: false, error: '' }

  } catch (err: any) {
    const dead = isDeadError(err.message)
    await supabase.from('historic_import_progress')
      .update({ status: 'done', last_processed_at: new Date().toISOString() })
      .eq('item_id', item.item_id)
    return { item_id: item.item_id, rows: 0, ok: false, dead, error: err.message.slice(0, 100) }
  }
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: items } = await supabase
    .from('historic_import_progress')
    .select('item_id, item_type')
    .eq('status', 'pending')
    .eq('item_type', 'AH')
    .order('item_id', { ascending: true })
    .limit(PER_RUN)

  if (!items || items.length === 0) {
    return NextResponse.json({ message: 'All items done! 🎉' })
  }

  const results = []
  for (const item of items) {
    results.push(await processItem(item))
  }

  return NextResponse.json({
    success:    true,
    processed:  results.length,
    successful: results.filter(r => r.ok).length,
    dead:       results.filter(r => r.dead).length,
    total_rows: results.reduce((s, r) => s + r.rows, 0),
    errors:     results.filter(r => !r.ok && !r.dead).map(r => ({ item_id: r.item_id, error: r.error })),
    sample_ok:  results.filter(r => r.ok).slice(0, 3).map(r => ({ item_id: r.item_id, rows: r.rows })),
  })
}