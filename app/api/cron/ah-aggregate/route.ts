// app/api/cron/ah-aggregate/route.ts
// Tourne à 23h59 chaque soir
// Agrège les SCAN du jour en buckets DAILY et MONTHLY
// Deux niveaux :
//   DAILY_BASE  : groupé par variant_key_base (volume suffisant, statistiquement fiable)
//   DAILY_EXACT : groupé par variant_key_full (précis, moins de volume)
// Items peu liquides (<3 ventes/jour) → MONTHLY
import { createClient } from '@supabase/supabase-js'
import { NextResponse }  from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TODAY = new Date().toISOString().split('T')[0]
const MIN_DAILY_VOLUME = 3  // seuil liquidité pour DAILY vs MONTHLY

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Lit tous les SCAN du jour
    const { data: scans, error: scanErr } = await supabase
      .from('price_history_ah')
      .select(`
        base_item_id, variant_key, variant_key_base, item_name,
        avg_price, raw_price, volume,
        total_stars, master_stars, is_recomb, reforge,
        hot_potato_count, enchantments, ultimate_enchant, ultimate_level,
        gems, gems_summary, attributes,
        attribute_1, attribute_1_level, attribute_2, attribute_2_level,
        has_dye, dye_item
      `)
      .eq('granularity', 'SCAN')
      .eq('bucket_date', TODAY)

    if (scanErr) throw new Error('Scan read: ' + scanErr.message)
    if (!scans || scans.length === 0) {
      return NextResponse.json({ message: 'No scans today', date: TODAY })
    }

    // 2. Agrège par variant_key_base (prix de marché par famille de variante)
    const baseGroups = new Map<string, {
      base_item_id: string; variant_key_base: string; item_name: string
      prices: number[]; volumes: number[]
      sample: typeof scans[0]
    }>()

    for (const scan of scans) {
      const k = `${scan.base_item_id}::${scan.variant_key_base || 'nostar_norecomb'}`
      if (!baseGroups.has(k)) {
        baseGroups.set(k, {
          base_item_id:     scan.base_item_id,
          variant_key_base: scan.variant_key_base || 'nostar_norecomb',
          item_name:        scan.item_name,
          prices:           [],
          volumes:          [],
          sample:           scan,
        })
      }
      const g = baseGroups.get(k)!
      g.prices.push(Number(scan.avg_price || scan.raw_price || 0))
      g.volumes.push(Number(scan.volume || 1))
    }

    // 3. Agrège par variant_key_full (prix exact par variante complète)
    const fullGroups = new Map<string, {
      base_item_id: string; variant_key_full: string; variant_key_base: string; item_name: string
      prices: number[]; volumes: number[]
      sample: typeof scans[0]
    }>()

    for (const scan of scans) {
      const k = `${scan.base_item_id}::${scan.variant_key}`
      if (!fullGroups.has(k)) {
        fullGroups.set(k, {
          base_item_id:     scan.base_item_id,
          variant_key_full: scan.variant_key,
          variant_key_base: scan.variant_key_base || 'nostar_norecomb',
          item_name:        scan.item_name,
          prices:           [],
          volumes:          [],
          sample:           scan,
        })
      }
      const g = fullGroups.get(k)!
      g.prices.push(Number(scan.avg_price || scan.raw_price || 0))
      g.volumes.push(Number(scan.volume || 1))
    }

    // 4. Construit les rows à insérer
    const rows: any[] = []

    // ── DAILY_BASE (variant_key_base) ─────────────────────────
    for (const [, g] of baseGroups) {
      const totalVol = g.volumes.reduce((s, v) => s + v, 0)
      const avgPrice = g.prices.reduce((s, p) => s + p, 0) / g.prices.length
      const minPrice = Math.min(...g.prices)
      const maxPrice = Math.max(...g.prices)
      const granularity = totalVol >= MIN_DAILY_VOLUME ? 'DAILY' : 'MONTHLY'
      const bucketDate  = granularity === 'MONTHLY'
        ? TODAY.slice(0, 7) + '-01'
        : TODAY

      rows.push({
        base_item_id:     g.base_item_id,
        variant_key:      g.variant_key_base,
        variant_key_base: g.variant_key_base,
        item_name:        g.item_name,
        granularity,
        bucket_date:      bucketDate,
        avg_price:        avgPrice,
        sell_price:       minPrice,
        buy_price:        avgPrice,
        volume:           totalVol,
        data_points:      g.prices.length,
        // Stats de la variante de base (depuis sample)
        total_stars:      g.sample.total_stars,
        master_stars:     g.sample.master_stars,
        is_recomb:        g.sample.is_recomb,
        reforge:          null, // pas de reforge dans base
        ultimate_enchant: g.sample.ultimate_enchant,
        ultimate_level:   g.sample.ultimate_level,
        attributes:       g.sample.attributes,
        attribute_1:      g.sample.attribute_1,
        attribute_1_level:g.sample.attribute_1_level,
        attribute_2:      g.sample.attribute_2,
        attribute_2_level:g.sample.attribute_2_level,
      })
    }

    // ── DAILY_EXACT (variant_key_full) ────────────────────────
    for (const [, g] of fullGroups) {
      const totalVol = g.volumes.reduce((s, v) => s + v, 0)
      if (totalVol < MIN_DAILY_VOLUME) continue // pas assez de volume pour DAILY_EXACT

      const avgPrice = g.prices.reduce((s, p) => s + p, 0) / g.prices.length
      const minPrice = Math.min(...g.prices)

      rows.push({
        base_item_id:     g.base_item_id,
        variant_key:      g.variant_key_full,
        variant_key_base: g.variant_key_base,
        item_name:        g.item_name,
        granularity:      'DAILY_EXACT',
        bucket_date:      TODAY,
        avg_price:        avgPrice,
        sell_price:       minPrice,
        buy_price:        avgPrice,
        volume:           totalVol,
        data_points:      g.prices.length,
        total_stars:      g.sample.total_stars,
        master_stars:     g.sample.master_stars,
        is_recomb:        g.sample.is_recomb,
        reforge:          g.sample.reforge,
        hot_potato_count: g.sample.hot_potato_count,
        enchantments:     g.sample.enchantments,
        ultimate_enchant: g.sample.ultimate_enchant,
        ultimate_level:   g.sample.ultimate_level,
        gems:             g.sample.gems,
        gems_summary:     g.sample.gems_summary,
        attributes:       g.sample.attributes,
        attribute_1:      g.sample.attribute_1,
        attribute_1_level:g.sample.attribute_1_level,
        attribute_2:      g.sample.attribute_2,
        attribute_2_level:g.sample.attribute_2_level,
        has_dye:          g.sample.has_dye,
        dye_item:         g.sample.dye_item,
      })
    }

    // 5. Upsert par batch de 100
    let inserted = 0
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase
        .from('price_history_ah')
        .upsert(rows.slice(i, i + 100), {
          onConflict:       'base_item_id, variant_key, granularity, bucket_date',
          ignoreDuplicates: false,
        })
      if (error) console.error('Aggregate upsert error:', error.message)
      else inserted += Math.min(100, rows.length - i)
    }

    return NextResponse.json({
      success:          true,
      date:             TODAY,
      scans_read:       scans.length,
      base_groups:      baseGroups.size,
      full_groups:      fullGroups.size,
      rows_upserted:    inserted,
      daily_base:       rows.filter(r => r.granularity === 'DAILY').length,
      daily_exact:      rows.filter(r => r.granularity === 'DAILY_EXACT').length,
      monthly:          rows.filter(r => r.granularity === 'MONTHLY').length,
    })

  } catch (e: any) {
    console.error('ah-aggregate error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}