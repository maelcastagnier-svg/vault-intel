// app/api/cron/ah-aggregate/route.ts
// 23h59 chaque soir :
// 1. Lit ah_scan_buffer (toutes les variantes du jour avec moyenne calculée)
// 2. INSERT 1 bucket DAILY par variante dans price_history_ah
// 3. TRUNCATE ah_scan_buffer → repart à 0 demain
import { createClient } from '@supabase/supabase-js'
import { NextResponse }  from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TODAY = new Date().toISOString().split('T')[0]

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Lit tout le buffer du jour
    const { data: buffer, error: bufErr } = await supabase
      .from('ah_scan_buffer')
      .select('*')
      .eq('scan_date', TODAY)

    if (bufErr) throw new Error('Buffer read: ' + bufErr.message)
    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ message: 'Buffer empty', date: TODAY })
    }

    // 2. Construit les rows DAILY à insérer dans price_history_ah
    const dailyRows = buffer.map(b => ({
      base_item_id:     b.base_item_id,
      variant_key:      b.variant_key,
      variant_key_base: b.variant_key_base,
      item_name:        b.item_name,
      granularity:      b.scan_count >= 3 ? 'DAILY_EXACT' : 'DAILY',
      bucket_date:      TODAY,
      avg_price:        b.avg_price,
      sell_price:       b.min_price,
      buy_price:        b.avg_price,
      volume:           b.volume,
      data_points:      b.scan_count,
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
    }))

    // INSERT par batch de 100 (upsert pour éviter doublons si relancé)
    let inserted = 0
    for (let i = 0; i < dailyRows.length; i += 100) {
      const { error } = await supabase
        .from('price_history_ah')
        .upsert(dailyRows.slice(i, i + 100), {
          onConflict:       'base_item_id, variant_key, granularity, bucket_date',
          ignoreDuplicates: false,
        })
      if (!error) inserted += Math.min(100, dailyRows.length - i)
      else console.error('Aggregate upsert error:', error.message)
    }

    // 3. TRUNCATE ah_scan_buffer → prêt pour demain
    await supabase.from('ah_scan_buffer').delete().lte('scan_date', TODAY)

    return NextResponse.json({
      success:          true,
      date:             TODAY,
      variants_today:   buffer.length,
      daily_inserted:   inserted,
      daily_exact:      dailyRows.filter(r => r.granularity === 'DAILY_EXACT').length,
      daily:            dailyRows.filter(r => r.granularity === 'DAILY').length,
    })

  } catch (e: any) {
    console.error('ah-aggregate error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}