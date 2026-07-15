import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { extractVariantFromName } from '@/lib/text-variant-extractor'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HYPIXEL_AH_URL = 'https://api.hypixel.net/v2/skyblock/auctions'
const TOP_ITEMS      = 300

function toBaseItemId(baseName: string): string {
  return baseName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
}

type ScannedItem = {
  base_item_id:   string
  variant_key:    string
  item_name:      string
  total_stars:    number
  is_recomb:      boolean
  reforge:        string | null
  has_dye:        boolean
  category:       string | null
  best_price:     number
  best_uuid:      string
  prices:         number[]
  volume:         number
  avg_price:      number
  sell_price:     number
  buy_price:      number
  min_price:      number
  max_price:      number
  historical_avg: number
  discount_pct:   number
  spread_pct:     number
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: lock } = await supabase
    .from('cron_locks')
    .select('locked_until')
    .eq('job_name', 'ah_collect')
    .single()

  if (lock?.locked_until && new Date(lock.locked_until) > new Date()) {
    return NextResponse.json({ message: 'Already running' })
  }

  await supabase
    .from('cron_locks')
    .upsert({
      job_name:     'ah_collect',
      locked_until: new Date(Date.now() + 120_000).toISOString()
    }, { onConflict: 'job_name' })

  try {
    // 1. Fetch AH Hypixel
    const firstRes   = await fetch(HYPIXEL_AH_URL)
    const firstPage  = await firstRes.json()
    const totalPages = firstPage.totalPages as number

    let allAuctions: any[] = [...firstPage.auctions]

    const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 1)
    for (let i = 0; i < remainingPages.length; i += 10) {
      const batch   = remainingPages.slice(i, i + 10)
      const results = await Promise.all(
        batch.map(p => fetch(`${HYPIXEL_AH_URL}?page=${p}`).then(r => r.json()))
      )
      results.forEach(r => { allAuctions = allAuctions.concat(r.auctions) })
    }

    const binAuctions = allAuctions.filter(a => a.bin && !a.claimed)

    // 2. Groupe par variante
    const grouped = new Map<string, ScannedItem>()

    for (const auc of binAuctions) {
      const v            = extractVariantFromName(auc.item_name)
      const base_item_id = toBaseItemId(v.baseName)
      if (!base_item_id) continue

      const key = `${base_item_id}::${v.variantKey}`

      if (!grouped.has(key)) {
        grouped.set(key, {
          base_item_id,
          variant_key:    v.variantKey,
          item_name:      auc.item_name,
          total_stars:    v.totalStars,
          is_recomb:      v.recombobulated,
          reforge:        v.reforge ?? null,
          has_dye:        v.hasDye,
          category:       auc.category ?? null,
          best_price:     auc.starting_bid,
          best_uuid:      auc.uuid,
          prices:         [auc.starting_bid],
          volume:         1,
          avg_price:      0,
          sell_price:     0,
          buy_price:      0,
          min_price:      0,
          max_price:      0,
          historical_avg: 0,
          discount_pct:   0,
          spread_pct:     0
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

    // 3. Calcule prix
    const allItems = Array.from(grouped.values()).map(item => {
      const sorted = [...item.prices].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      const avg    = sorted.reduce((s, p) => s + p, 0) / sorted.length
      return {
        ...item,
        avg_price:  avg,
        sell_price: item.best_price,
        buy_price:  median,
        min_price:  sorted[0],
        max_price:  sorted[sorted.length - 1]
      }
    })

    // 4. Historique depuis price_history_ah (7 derniers jours)
    const baseItemIds = [...new Set(allItems.map(i => i.base_item_id))]
    const variantKeys = [...new Set(allItems.map(i => i.variant_key))]

    const { data: historicalData } = await supabase
      .from('price_history_ah')
      .select('base_item_id, variant_key, avg_price')
      .in('base_item_id', baseItemIds)
      .in('variant_key', variantKeys)
      .eq('granularity', 'DAILY')
      .gte('bucket_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])

    const historicalMap = new Map<string, number>()
    if (historicalData) {
      const grouped7d = new Map<string, number[]>()
      for (const h of historicalData) {
        const k = `${h.base_item_id}::${h.variant_key}`
        if (!grouped7d.has(k)) grouped7d.set(k, [])
        grouped7d.get(k)!.push(Number(h.avg_price))
      }
      for (const [k, prices] of grouped7d) {
        historicalMap.set(k, prices.reduce((s, p) => s + p, 0) / prices.length)
      }
    }

    // 5. Score combiné discount + spread
    const scoredItems = allItems.map(item => {
      const hKey         = `${item.base_item_id}::${item.variant_key}`
      const historical   = historicalMap.get(hKey) ?? 0
      const discount_pct = historical > 0
        ? Math.round(((historical - item.best_price) / historical) * 100)
        : 0
      const spread_pct   = item.avg_price > 0
        ? Math.round(((item.avg_price - item.best_price) / item.avg_price) * 100)
        : 0
      return { ...item, historical_avg: historical, discount_pct, spread_pct }
    })

    // 6. Top 300 — priorité au discount historique, sinon spread
    // Sélection équilibrée par catégorie pour couvrir tout le dashboard
    const byCategory = new Map<string, typeof scoredItems>()
    for (const item of scoredItems) {
      const cat = item.category ?? 'other'
      if (!byCategory.has(cat)) byCategory.set(cat, [])
      byCategory.get(cat)!.push(item)
    }

    // Trie chaque catégorie par score
    const topItems: typeof scoredItems = []
    for (const [, catItems] of byCategory) {
      const sorted = catItems
        .sort((a, b) =>
          (b.discount_pct * 0.6 + b.spread_pct * 0.4) -
          (a.discount_pct * 0.6 + a.spread_pct * 0.4)
        )
        .slice(0, 50) // Max 50 items par catégorie
      topItems.push(...sorted)
    }

    // Cap global à TOP_ITEMS
    const finalItems = topItems
      .sort((a, b) =>
        (b.discount_pct * 0.6 + b.spread_pct * 0.4) -
        (a.discount_pct * 0.6 + a.spread_pct * 0.4)
      )
      .slice(0, TOP_ITEMS)

    // 7. DELETE + INSERT
    const { error: deleteError } = await supabase
      .from('ah_live')
      .delete()
      .gte('id', 0)

    if (deleteError) throw new Error(`DELETE failed: ${deleteError.message}`)

    const rows = finalItems.map(item => ({
      item_id:           item.base_item_id,
      base_item_id:      item.base_item_id,
      variant_key:       item.variant_key,
      item_name:         item.item_name?.slice(0, 299) ?? '',
      total_stars:       item.total_stars  ?? 0,
      is_recomb:         item.is_recomb    ?? false,
      reforge:           item.reforge      ?? null,
      has_dye:           item.has_dye      ?? false,
      category:          item.category     ?? null,
      best_price:        item.best_price   ?? 0,
      best_auction_uuid: item.best_uuid    ?? null,
      buy_price:         item.buy_price    ?? 0,
      sell_price:        item.sell_price   ?? 0,
      avg_price:         item.avg_price    ?? 0,
      min_price:         item.min_price    ?? 0,
      max_price:         item.max_price    ?? 0,
      historical_avg:    item.historical_avg ?? 0,
      discount_pct:      item.discount_pct   ?? 0,
      spread_pct:        item.spread_pct     ?? 0,
      volume:            item.volume         ?? 0,
      timestamp:         new Date().toISOString(),
      scanned_at:        new Date().toISOString()
    }))

    // Insert par batch de 50
    for (let i = 0; i < rows.length; i += 50) {
      const { error: insertError } = await supabase
        .from('ah_live')
        .insert(rows.slice(i, i + 50))
      if (insertError) throw new Error(`INSERT failed batch ${i}: ${insertError.message}`)
    }

    await supabase
      .from('cron_locks')
      .update({ locked_until: null })
      .eq('job_name', 'ah_collect')

    return NextResponse.json({
      success:          true,
      total_auctions:   allAuctions.length,
      bin_auctions:     binAuctions.length,
      total_variants:   allItems.length,
      top_items:        finalItems.length,
      with_history:     finalItems.filter(i => i.historical_avg > 0).length,
      categories:       [...byCategory.keys()]
    })

  } catch (error: any) {
    await supabase
      .from('cron_locks')
      .update({ locked_until: null })
      .eq('job_name', 'ah_collect')
    console.error('ah-collect error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}