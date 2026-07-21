// app/api/cron/ah-aggregate/route.ts
// 23h59 chaque soir :
// 1. Lit ah_scan_buffer (toutes les variantes du jour)
// 2. Crée 2 buckets par variante :
//    - DAILY_EXACT  : variant_key_full  (prix exact par variante NBT complète)
//    - DAILY        : variant_key_base  (tendance par famille de variante)
// 3. bucket_date = scan_date réelle (pas TODAY)
// 4. TRUNCATE buffer → repart à 0 demain
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
    // 1. Lit tout le buffer (toutes dates confondues)
    const { data: buffer, error: bufErr } = await supabase
      .from('ah_scan_buffer')
      .select('*')
      .order('scan_date', { ascending: true })

    if (bufErr) throw new Error('Buffer read: ' + bufErr.message)
    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ message: 'Buffer empty' })
    }

    // 2. Génère 2 rows par variante :
    //    - DAILY_EXACT (variant_key_full) pour prix exact
    //    - DAILY       (variant_key_base) pour tendance famille
    const rows: any[] = []

    for (const b of buffer) {
      const base = {
        base_item_id:     b.base_item_id,
        item_name:        b.item_name,
        bucket_date:      b.scan_date,  // date réelle du scan
        avg_price:        b.avg_price,
        sell_price:       b.min_price,
        buy_price:        b.avg_price,
        volume:           b.volume,
        data_points:      b.scan_count,
        avg_sold_price:   b.avg_sold_price || 0,
        sold_count:       b.sold_count || 0,
        total_stars:      b.total_stars,
        master_stars:     b.master_stars,
        is_recomb:        b.is_recomb,
        reforge:          b.reforge,
        hot_potato_count: b.hot_potato_count,
        enchantments:     b.enchantments,
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
        dye_item:         b.dye_item,
        auction_uuid:     b.best_uuid,
        raw_price:        b.best_price,
      }

      // DAILY_EXACT → variant_key_full (prix exact par variante complète)
      // Seulement si scan_count >= 3 (données fiables)
      if (b.scan_count >= 3) {
        rows.push({
          ...base,
          granularity:      'DAILY_EXACT',
          variant_key:      b.variant_key,
          variant_key_base: b.variant_key_base,
        })
      }

      // DAILY → variant_key_base (tendance par famille, toujours)
      rows.push({
        ...base,
        granularity:      'DAILY',
        variant_key:      b.variant_key_base || b.variant_key,
        variant_key_base: b.variant_key_base,
      })
    }

    // 3. Upsert par batch de 100
    let inserted = 0
    let errors   = 0

    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase
        .from('price_history_ah')
        .upsert(rows.slice(i, i + 100), {
          onConflict:       'base_item_id, variant_key, granularity, bucket_date',
          ignoreDuplicates: true,
        })
      if (error) { console.error('Upsert error:', error.message); errors++ }
      else inserted += Math.min(100, rows.length - i)
    }

    // 4. TRUNCATE buffer → repart à 0 demain
    await supabase.from('ah_scan_buffer').delete().lte('scan_date', new Date().toISOString().split('T')[0])

    const daily_exact = rows.filter(r => r.granularity === 'DAILY_EXACT').length
    const daily       = rows.filter(r => r.granularity === 'DAILY').length

    return NextResponse.json({
      success:        true,
      variants_today: buffer.length,
      rows_generated: rows.length,
      daily_inserted: inserted,
      daily_exact,
      daily,
      errors,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}