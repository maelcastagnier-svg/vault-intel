// app/api/cron/backfill-variant-stats/route.ts
// Rediecompose TOUTES les entrees existantes de price_history par variante, retroactivement
// A executer une fois manuellement (pas un vrai cron recurrent), traite par lots pour eviter le timeout

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractVariantFromName } from '../../../../lib/text-variant-extractor';

export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Recupere TOUTES les lignes AH de price_history (avec pagination pour eviter les limites Supabase)
    let allRows: any[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('price_history')
        .select('item_name, buy_price, sell_price, timestamp')
        .eq('source', 'AH')
        .range(from, from + pageSize - 1);

      if (error || !data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    if (allRows.length === 0) {
      return NextResponse.json({ status: 'no_data', message: 'No AH price_history rows found' });
    }

    // Re-parse chaque ligne avec la vraie extraction de variante depuis item_name
    const buckets: Record<string, {
      base_item_id: string; variant_key: string;
      buys_1d: number[]; sells_1d: number[];
      buys_week: number[]; sells_week: number[];
      buys_month: number[]; sells_month: number[];
    }> = {};

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    for (const row of allRows) {
      if (!row.item_name || row.buy_price == null || row.sell_price == null || !row.timestamp) continue;

      const variant = extractVariantFromName(row.item_name);
      const baseItemId = variant.baseName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
      if (!baseItemId) continue;

      const bucketKey = `${baseItemId}__${variant.variantKey}`;
      if (!buckets[bucketKey]) {
        buckets[bucketKey] = {
          base_item_id: baseItemId, variant_key: variant.variantKey,
          buys_1d: [], sells_1d: [], buys_week: [], sells_week: [], buys_month: [], sells_month: []
        };
      }

      const rowTime = new Date(row.timestamp).getTime();
      const ageMs = now - rowTime;

      if (ageMs <= 30 * DAY) {
        buckets[bucketKey].buys_month.push(row.buy_price);
        buckets[bucketKey].sells_month.push(row.sell_price);
      }
      if (ageMs <= 7 * DAY) {
        buckets[bucketKey].buys_week.push(row.buy_price);
        buckets[bucketKey].sells_week.push(row.sell_price);
      }
      if (ageMs <= 1 * DAY) {
        buckets[bucketKey].buys_1d.push(row.buy_price);
        buckets[bucketKey].sells_1d.push(row.sell_price);
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const statsRows = Object.values(buckets).map(b => ({
      base_item_id: b.base_item_id,
      variant_key: b.variant_key,
      avg_buy_1d: avg(b.buys_1d), avg_sell_1d: avg(b.sells_1d),
      avg_buy_week: avg(b.buys_week), avg_sell_week: avg(b.sells_week),
      avg_buy_month: avg(b.buys_month), avg_sell_month: avg(b.sells_month),
      points_1d: b.buys_1d.length, points_week: b.buys_week.length, points_month: b.buys_month.length,
      last_updated: new Date().toISOString()
    }));

    let upserted = 0;
    for (let i = 0; i < statsRows.length; i += 200) {
      const chunk = statsRows.slice(i, i + 200);
      const { error } = await supabase
        .from('item_variant_price_stats')
        .upsert(chunk, { onConflict: 'base_item_id,variant_key' });
      if (!error) upserted += chunk.length;
    }

    return NextResponse.json({
      status: 'done',
      totalRowsProcessed: allRows.length,
      uniqueVariantsFound: statsRows.length,
      upserted
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}