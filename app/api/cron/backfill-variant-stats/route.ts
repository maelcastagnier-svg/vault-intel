// app/api/cron/backfill-variant-stats/route.ts
// Version paginee — traite un lot d'items a chaque appel, resumable via offset
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractVariantFromName } from '../../../../lib/text-variant-extractor';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 50000; // lignes traitees par appel

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');

  try {
    const { data: allRows, error } = await supabase
      .from('price_history')
      .select('item_name, buy_price, sell_price, timestamp')
      .eq('source', 'AH')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!allRows || allRows.length === 0) {
      return NextResponse.json({ status: 'all_done', message: 'No more rows to process', offset });
    }

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
      const { error: upsertError } = await supabase
        .from('item_variant_price_stats')
        .upsert(chunk, { onConflict: 'base_item_id,variant_key' });
      if (!upsertError) upserted += chunk.length;
    }

    const nextOffset = offset + allRows.length;
    const isDone = allRows.length < BATCH_SIZE;

    // Auto-declenche le prochain lot si pas encore termine (fire-and-forget, ne bloque pas la reponse actuelle)
    if (!isDone) {
      const nextUrl = new URL(req.url);
      nextUrl.searchParams.set('offset', nextOffset.toString());
      fetch(nextUrl.toString(), {
        headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }
      }).catch(() => {}); // ne pas attendre la reponse, laisse tourner en fond
    }

    return NextResponse.json({
      status: isDone ? 'ALL_DONE' : 'processing_next_batch_automatically',
      rowsProcessedThisBatch: allRows.length,
      uniqueVariantsThisBatch: statsRows.length,
      upserted,
      currentOffset: offset,
      nextOffset: isDone ? null : nextOffset
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}