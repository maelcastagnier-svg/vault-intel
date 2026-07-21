// app/api/cron/ah-aggregate/route.ts
// 23h59 chaque soir :
// 1. Lit ah_scan_buffer (toutes les variantes du jour)
// 2. INSERT dans price_history_ah_variants (1 DAILY_EXACT par variante)
// 3. INSERT dans price_history_ah (1 DAILY par item = moyenne toutes variantes)
// 4. TRUNCATE ah_scan_buffer
import { createClient } from '@supabase/supabase-js'
import { NextResponse }  from 'next/server'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Lit tout le buffer
    const { data: buffer, error: bufErr } = await supabase
      .from('ah_scan_buffer')
      .select('*')
      .order('scan_date', { ascending: true })

    if (bufErr) throw new Error('Buffer read: ' + bufErr.message)
    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ message: 'Buffer empty' })
    }

    // ── TABLE 1 : price_history_ah_variants ───────────────────
    // 1 row par variante exacte (variant_key_full) par jour
    const variantRows = buffer
      .filter(b => b.scan_count >= 3) // données fiables uniquement
      .map(b => ({
        base_item_id:     b.base_item_id,
        variant_key:      b.variant_key,
        variant_key_base: b.variant_key_base,
        item_name:        b.item_name,
        bucket_date:      b.scan_date,
        avg_price:        b.avg_price,
        min_price:        b.min_price,
        max_price:        b.max_price,
        sell_price:       b.min_price,
        avg_sold_price:   b.avg_sold_price || 0,
        sold_count:       b.sold_count     || 0,
        volume:           b.volume,
        data_points:      b.scan_count,
        total_stars:      b.total_stars,
        master_stars:     b.master_stars,
        is_recomb:        b.is_recomb,
        reforge:          b.reforge,
        hot_potato_count: b.hot_potato_count,
        ultimate_enchant: b.ultimate_enchant,
        ultimate_level:   b.ultimate_level,
        gems:             b.gems,
        gems_summary:     b.gems_summary,
        attributes:       b.attributes,
        attribute_1:      b.attribute_1,
        attribute_1_level:b.attribute_1_level,
        attribute_2:      b.attribute_2,
        attribute_2_level:b.attribute_2_level,
        has_dye:          b.has_dye,
        auction_uuid:     b.best_uuid,
      }))

    let variantsInserted = 0
    for (let i = 0; i < variantRows.length; i += 100) {
      const { error } = await supabase
        .from('price_history_ah_variants')
        .upsert(variantRows.slice(i, i + 100), {
          onConflict:       'base_item_id, variant_key, bucket_date',
          ignoreDuplicates: true,
        })
      if (!error) variantsInserted += Math.min(100, variantRows.length - i)
    }

    // ── TABLE 2 : price_history_ah ────────────────────────────
    // 1 row par item (base_item_id) par jour = moyenne toutes variantes
    // Groupe par base_item_id + scan_date
    const itemMap = new Map<string, { prices: number[]; volumes: number[]; scan_date: string }>()
    for (const b of buffer) {
      const key = `${b.base_item_id}::${b.scan_date}`
      if (!itemMap.has(key)) {
        itemMap.set(key, { prices: [], volumes: [], scan_date: b.scan_date })
      }
      itemMap.get(key)!.prices.push(Number(b.avg_price))
      itemMap.get(key)!.volumes.push(Number(b.volume))
    }

    const dailyRows = Array.from(itemMap.entries()).map(([key, { prices, volumes, scan_date }]) => {
      const base_item_id = key.split('::')[0]
      const avg_price    = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
      const volume       = volumes.reduce((s, v) => s + v, 0)
      return {
        base_item_id,
        variant_key:      'nostar_norecomb_noreforge',
        variant_key_base: 'nostar_norecomb_noreforge',
        granularity:      'DAILY',
        bucket_date:      scan_date,
        avg_price,
        sell_price:       avg_price,
        buy_price:        avg_price,
        volume,
        data_points:      prices.length,
      }
    })

    let dailyInserted = 0
    for (let i = 0; i < dailyRows.length; i += 100) {
      const { error } = await supabase
        .from('price_history_ah')
        .upsert(dailyRows.slice(i, i + 100), {
          onConflict:       'base_item_id, variant_key, granularity, bucket_date',
          ignoreDuplicates: true,
        })
      if (!error) dailyInserted += Math.min(100, dailyRows.length - i)
    }

    // 4. TRUNCATE buffer
    await supabase.from('ah_scan_buffer')
      .delete()
      .lte('scan_date', new Date().toISOString().split('T')[0])

    return NextResponse.json({
      success:           true,
      buffer_size:       buffer.length,
      variants_inserted: variantsInserted,
      daily_inserted:    dailyInserted,
      date:              buffer[0]?.scan_date,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}