import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { extractVariantFromName } from '@/lib/text-variant-extractor'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HYPIXEL_AH_URL = 'https://api.hypixel.net/v2/skyblock/auctions'
const TOP_ITEMS      = 50

function getDailyBucket(): string {
  return new Date().toISOString().split('T')[0]
}

function getWeeklyBucket(): string {
  const d      = new Date()
  const day    = d.getUTCDay()
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1))
  return monday.toISOString().split('T')[0]
}

function getMonthlyBucket(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function toBaseItemId(baseName: string): string {
  return baseName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
}

type AggItem = {
  base_item_id: string
  variant_key:  string
  item_name:    string
  total_stars:  number
  is_recomb:    boolean
  reforge:      string | null
  has_dye:      boolean
  category:     string | null
  best_price:   number
  best_uuid:    string
  prices:       number[]
  volume:       number
  avg_price:    number
  sell_price:   number
  buy_price:    number
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verrou anti-chevauchement
  const lockKey        = 'ah_collect'
  const { data: lock } = await supabase
    .from('cron_locks')
    .select('locked_until')
    .eq('job_name', lockKey)
    .single()

  if (lock?.locked_until && new Date(lock.locked_until) > new Date()) {
    return NextResponse.json({ message: 'Already running' })
  }

  await supabase
    .from('cron_locks')
    .upsert({
      job_name:     lockKey,
      locked_until: new Date(Date.now() + 90_000).toISOString()
    }, { onConflict: 'job_name' })

  try {
    // Liquidité depuis historic_import_progress
    const { data: liquidityData } = await supabase
      .from('historic_import_progress')
      .select('item_id, liquidity')

    const liquidityMap = Object.fromEntries(
      (liquidityData || []).map(r => [r.item_id, r.liquidity as 'HIGH' | 'LOW'])
    )

    // Fetch première page AH Hypixel
    const firstRes   = await fetch(HYPIXEL_AH_URL)
    const firstPage  = await firstRes.json()
    const totalPages = firstPage.totalPages as number

    let allAuctions: any[] = [...firstPage.auctions]

    // Fetch pages restantes par batch de 10
    const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 1)
    for (let i = 0; i < remainingPages.length; i += 10) {
      const batch   = remainingPages.slice(i, i + 10)
      const results = await Promise.all(
        batch.map(p => fetch(`${HYPIXEL_AH_URL}?page=${p}`).then(r => r.json()))
      )
      results.forEach(r => { allAuctions = allAuctions.concat(r.auctions) })
    }

    // BIN uniquement + actives
    const binAuctions = allAuctions.filter(a => a.bin && !a.claimed)

    // Groupe par base_item_id + variant_key
    const grouped = new Map<string, AggItem>()

    for (const auc of binAuctions) {
      const v            = extractVariantFromName(auc.item_name)
      const base_item_id = toBaseItemId(v.baseName)
      const key          = `${base_item_id}::${v.variantKey}`

      if (!grouped.has(key)) {
        grouped.set(key, {
          base_item_id,
          variant_key: v.variantKey,
          item_name:   auc.item_name,
          total_stars: v.totalStars,
          is_recomb:   v.recombobulated,
          reforge:     v.reforge ?? null,
          has_dye:     v.hasDye,
          category:    auc.category ?? null,
          best_price:  auc.starting_bid,
          best_uuid:   auc.uuid,
          prices:      [auc.starting_bid],
          volume:      1,
          avg_price:   0,
          sell_price:  0,
          buy_price:   0
        })
      } else {
        const existing = grouped.get(key)!
        existing.prices.push(auc.starting_bid)
        existing.volume++
        if (auc.starting_bid < existing.best_price) {
          existing.best_price = auc.starting_bid
          existing.best_uuid  = auc.uuid
        }
      }
    }

    // Top 50 par volume avec calcul prix
    const topItems: AggItem[] = Array.from(grouped.values())
      .sort((a, b) => b.volume - a.volume)
      .slice(0, TOP_ITEMS)
      .map(item => {
        const sorted = [...item.prices].sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)]
        const avg    = sorted.reduce((s, p) => s + p, 0) / sorted.length
        return {
          ...item,
          avg_price:  avg,
          sell_price: item.best_price,  // meilleur prix = prix de vente
          buy_price:  median,           // médiane = prix d'achat estimé
          min_price:  sorted[0],
          max_price:  sorted[sorted.length - 1]
        }
      })

    // 1. Snapshot ah_live (DELETE + INSERT)
    await supabase.from('ah_live').delete().neq('id', 0)
    await supabase.from('ah_live').insert(
      topItems.map(item => ({
        item_id:           item.base_item_id,
        base_item_id:      item.base_item_id,
        variant_key:       item.variant_key,
        item_name:         item.item_name,
        total_stars:       item.total_stars,
        is_recomb:         item.is_recomb,
        reforge:           item.reforge,
        has_dye:           item.has_dye,
        category:          item.category,
        best_price:        item.best_price,
        best_auction_uuid: item.best_uuid,
        buy_price:         item.buy_price,
        sell_price:        item.sell_price,
        avg_price:         item.avg_price,
        volume:            item.volume,
        timestamp:         new Date().toISOString(),
        scanned_at:        new Date().toISOString()
      }))
    )

    // 2. Upsert price_history_ah (buckets agrégés)
    const dailyBucket   = getDailyBucket()
    const weeklyBucket  = getWeeklyBucket()
    const monthlyBucket = getMonthlyBucket()

    type RpcJob = { item: AggItem; bucket: { granularity: string; bucket_date: string } }
    const rpcQueue: RpcJob[] = []

    for (const item of topItems) {
      const isHigh  = (liquidityMap[item.base_item_id] ?? 'LOW') === 'HIGH'
      const buckets = isHigh
        ? [
            { granularity: 'DAILY',   bucket_date: dailyBucket   },
            { granularity: 'WEEKLY',  bucket_date: weeklyBucket  }
          ]
        : [
            { granularity: 'MONTHLY', bucket_date: monthlyBucket }
          ]

      for (const bucket of buckets) {
        rpcQueue.push({ item, bucket })
      }
    }

    for (let i = 0; i < rpcQueue.length; i += 20) {
      await Promise.all(
        rpcQueue.slice(i, i + 20).map(({ item, bucket }) =>
          supabase.rpc('upsert_ah_price_bucket', {
            p_base_item_id: item.base_item_id,
            p_variant_key:  item.variant_key,
            p_item_name:    item.item_name,
            p_total_stars:  item.total_stars,
            p_is_recomb:    item.is_recomb,
            p_reforge:      item.reforge,
            p_has_dye:      item.has_dye,
            p_buy_price:    item.buy_price,
            p_sell_price:   item.sell_price,
            p_avg_price:    item.avg_price,
            p_volume:       item.volume,
            p_granularity:  bucket.granularity,
            p_bucket_date:  bucket.bucket_date
          }).then()
        )
      )
    }

    // Libère le verrou
    await supabase
      .from('cron_locks')
      .update({ locked_until: null })
      .eq('job_name', lockKey)

    return NextResponse.json({
      success:         true,
      total_auctions:  allAuctions.length,
      bin_auctions:    binAuctions.length,
      top_items:       topItems.length,
      buckets_written: rpcQueue.length
    })

  } catch (error: any) {
    await supabase
      .from('cron_locks')
      .update({ locked_until: null })
      .eq('job_name', lockKey)
    console.error('ah-collect error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}