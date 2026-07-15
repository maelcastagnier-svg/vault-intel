import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import zlib from 'zlib'
import { promisify } from 'util'
import { extractVariantFromName } from '@/lib/text-variant-extractor'

const inflateRaw = promisify(zlib.inflateRaw)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const YEARS_TARGET    = 3
const ITEMS_PER_RUN   = 10
const SKYCOFL_TOKEN   = process.env.SKYCOFL_ACCOUNT_TOKEN!
const SKYCOFL_HEADERS = {
  'Authorization': `Bearer ${SKYCOFL_TOKEN}`,
  'Accept':        'application/json'
}

// ============================================================
// ZIP PARSER
// ============================================================
async function parseZipBuffer(buffer: Buffer): Promise<{ name: string; data: Buffer }[]> {
  const files: { name: string; data: Buffer }[] = []
  const EOCD_SIG = 0x06054b50
  const CD_SIG   = 0x02014b50

  let eocdOffset = -1
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break }
  }
  if (eocdOffset === -1) throw new Error('Invalid ZIP: EOCD not found')

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16)
  const cdSize   = buffer.readUInt32LE(eocdOffset + 12)

  let offset = cdOffset
  while (offset < cdOffset + cdSize) {
    if (buffer.readUInt32LE(offset) !== CD_SIG) break

    const compression    = buffer.readUInt16LE(offset + 10)
    const fileNameLen    = buffer.readUInt16LE(offset + 28)
    const extraLen       = buffer.readUInt16LE(offset + 30)
    const commentLen     = buffer.readUInt16LE(offset + 32)
    const lfhOffset      = buffer.readUInt32LE(offset + 42)
    const fileName       = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLen)
    const compSize       = buffer.readUInt32LE(offset + 20)

    const lfhFileNameLen = buffer.readUInt16LE(lfhOffset + 26)
    const lfhExtraLen    = buffer.readUInt16LE(lfhOffset + 28)
    const dataOffset     = lfhOffset + 30 + lfhFileNameLen + lfhExtraLen

    const compressed = buffer.slice(dataOffset, dataOffset + compSize)
    const fileData   = compression === 0
      ? compressed
      : compression === 8
        ? await inflateRaw(compressed) as Buffer
        : (() => { throw new Error(`Unsupported ZIP compression: ${compression}`) })()

    files.push({ name: fileName, data: fileData })
    offset += 46 + fileNameLen + extraLen + commentLen
  }

  return files
}

// ============================================================
// HELPERS TEMPORELS
// ============================================================
function getDateBoundary(yearsAgo: number): Date {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - yearsAgo)
  return d
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

// Erreurs qui indiquent que l'item n'existe pas sur SkyCofl
// → marquer done immédiatement, pas la peine de retenter
function isDeadError(msg: string): boolean {
  return msg.includes('404') ||
         msg.includes('No JSON') ||
         msg.includes('403') ||
         msg.includes('No data')
}

// ============================================================
// IMPORT BAZAAR
// ============================================================
async function importBazaar(item_id: string, fromDate: Date, toDate: Date): Promise<number> {
  const res = await fetch(
    `https://sky.coflnet.com/api/item/price/${item_id}/history`,
    { headers: { ...SKYCOFL_HEADERS, 'Accept': 'application/zip' } }
  )
  if (!res.ok) throw new Error(`SkyCofl Bazaar ${res.status} for ${item_id}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const files  = await parseZipBuffer(buffer)
  const json   = files.find(f => f.name.endsWith('.json'))
  if (!json) throw new Error(`No JSON in ZIP for ${item_id}`)

  const points: { timestamp: string; avg: number; min: number; max: number; volume: number }[] =
    JSON.parse(json.data.toString('utf8'))

  const filtered = points.filter(p => {
    const ts = new Date(p.timestamp)
    return ts >= fromDate && ts <= toDate
  })

  for (let i = 0; i < filtered.length; i += 20) {
    await Promise.all(
      filtered.slice(i, i + 20).map(p => {
        const ts = new Date(p.timestamp)
        return supabase.rpc('upsert_bazaar_price_bucket', {
          p_item_id:     item_id,
          p_item_name:   item_id.replace(/_/g, ' '),
          p_buy_price:   p.max,
          p_sell_price:  p.min,
          p_avg_price:   p.avg,
          p_volume:      p.volume ?? 0,
          p_bucket_date: getDailyBucket(ts)
        }).then()
      })
    )
  }

  return filtered.length
}

// ============================================================
// IMPORT AH
// ============================================================
async function importAH(
  item_id:   string,
  liquidity: 'HIGH' | 'LOW',
  fromDate:  Date,
  toDate:    Date
): Promise<number> {
  const res = await fetch(
    `https://sky.coflnet.com/api/item/price/${item_id}/history/overview`,
    { headers: SKYCOFL_HEADERS }
  )
  if (!res.ok) throw new Error(`SkyCofl AH ${res.status} for ${item_id}`)

  const points: { time: number; avg: number; min: number; max: number; volume?: number }[] =
    await res.json()

  // Pas de data = item sans historique sur SkyCofl
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error(`No data for ${item_id}`)
  }

  const isHigh    = liquidity === 'HIGH'
  const item_name = item_id.replace(/_/g, ' ')
  const filtered  = points.filter(p => {
    const ts = new Date(p.time * 1000)
    return ts >= fromDate && ts <= toDate
  })

  const v            = extractVariantFromName(item_name)
  const base_item_id = toBaseItemId(v.baseName) || item_id

  for (let i = 0; i < filtered.length; i += 20) {
    await Promise.all(
      filtered.slice(i, i + 20).map(p => {
        const ts          = new Date(p.time * 1000)
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
        }).then()
      })
    )
  }

  return filtered.length
}

// ============================================================
// TRAITEMENT D'UN ITEM
// ============================================================
async function processItem(item: {
  item_id:         string
  item_type:       string
  liquidity:       string
  years_completed: number
}): Promise<{ item_id: string; rows: number; error?: string; status: string }> {
  const { item_id, item_type, liquidity, years_completed } = item

  const toDate        = getDateBoundary(years_completed)
  const fromDate      = getDateBoundary(years_completed + 1)
  const hardLimit     = getDateBoundary(YEARS_TARGET)
  const effectiveFrom = fromDate < hardLimit ? hardLimit : fromDate

  try {
    let rowsInserted = 0

    if (item_type === 'BAZAAR') {
      rowsInserted = await importBazaar(item_id, effectiveFrom, toDate)
    } else {
      rowsInserted = await importAH(item_id, liquidity as 'HIGH' | 'LOW', effectiveFrom, toDate)
    }

    const newYearsCompleted = years_completed + 1
    const isDone            = newYearsCompleted >= YEARS_TARGET

    await supabase
      .from('historic_import_progress')
      .update({
        years_completed:   newYearsCompleted,
        status:            isDone ? 'done' : 'pending',
        last_processed_at: new Date().toISOString()
      })
      .eq('item_id', item_id)

    return { item_id, rows: rowsInserted, status: isDone ? 'done' : 'pending' }

  } catch (err: any) {
    const errMsg = err.message as string
    const dead   = isDeadError(errMsg)

    // 404 / No data → item sans historique SkyCofl → done définitivement
    // Autre erreur (timeout, réseau) → reste pending pour être retenté
    await supabase
      .from('historic_import_progress')
      .update({
        status:            dead ? 'done' : 'pending',
        last_processed_at: new Date().toISOString()
      })
      .eq('item_id', item_id)

    return { item_id, rows: 0, error: errMsg, status: dead ? 'done' : 'pending' }
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
      .select('item_id, item_type, liquidity, years_completed')
      .eq('status', 'pending')
      .lt('years_completed', YEARS_TARGET)
      .order('years_completed', { ascending: true })
      .order('item_id',         { ascending: true })
      .limit(ITEMS_PER_RUN)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!nextItems || nextItems.length === 0) {
      return NextResponse.json({ message: 'Nothing to import — all items done or at target' })
    }

    // Traitement séquentiel — évite les rate limits SkyCofl
    const results = []
    for (const item of nextItems) {
      const result = await processItem(item)
      results.push(result)
    }

    const successful = results.filter(r => !r.error).length
    const dead       = results.filter(r => r.status === 'done' && r.error).length
    const retryLater = results.filter(r => r.status === 'pending' && r.error).length
    const totalRows  = results.reduce((s, r) => s + r.rows, 0)

    return NextResponse.json({
      success:         true,
      items_processed: results.length,
      successful,
      dead_items:      dead,
      retry_later:     retryLater,
      total_rows:      totalRows,
      results
    })

  } catch (error: any) {
    console.error('historic-import fatal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}