// app/api/skycofl-ah-import/route.ts
// Importe l'historique AH via archive/overview, agrege par jour, insere dans Supabase

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { tag, accountToken, startUnix, endUnix } = await req.json();

    if (!tag || !accountToken) {
      return NextResponse.json({ error: 'Missing tag or accountToken' }, { status: 400 });
    }

    const endBefore = endUnix || Math.floor(Date.now() / 1000);
    const endAfter = startUnix || Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);

    const archiveRes = await fetch(
      `https://sky.coflnet.com/api/auctions/tag/${tag}/archive/overview?EndAfter=${endAfter}&EndBefore=${endBefore}`,
      { headers: { Authorization: `Bearer ${accountToken}` } }
    );

    if (!archiveRes.ok) {
      const errText = await archiveRes.text();
      return NextResponse.json({ error: `Archive fetch failed: ${archiveRes.status}`, detail: errText.substring(0, 200) }, { status: 502 });
    }

    const data = await archiveRes.json();
    const auctions = data.auctions || [];

    if (auctions.length === 0) {
      return NextResponse.json({ status: 'done', tag, totalAuctions: 0, inserted: 0 });
    }

    // Agrege par jour
    const dailyBuckets: Record<string, { prices: number[] }> = {};

    for (const auc of auctions) {
      if (!auc.price || !auc.end) continue;
      const dayKey = auc.end.substring(0, 10);
      if (!dailyBuckets[dayKey]) dailyBuckets[dayKey] = { prices: [] };
      dailyBuckets[dayKey].prices.push(auc.price);
    }

    const rows = Object.entries(dailyBuckets).map(([day, bucket]) => {
      const prices = bucket.prices;
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      return {
        item_id: tag,
        item_name: tag.replace(/_/g, ' '),
        source: 'AH_SKYCOFL_HISTORIC',
        buy_price: Math.min(...prices),
        sell_price: Math.max(...prices),
        avg_price: avg,
        volume: prices.length,
        timestamp: day + 'T12:00:00.000Z',
      };
    });

    // Verifie doublons
    const { data: existing } = await supabase
      .from('price_history')
      .select('timestamp')
      .eq('item_id', tag)
      .eq('source', 'AH_SKYCOFL_HISTORIC');

    const existingTimestamps = new Set((existing || []).map((r) => r.timestamp));
    const dedupedRows = rows.filter((r) => !existingTimestamps.has(r.timestamp));

    let inserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < dedupedRows.length; i += chunkSize) {
      const chunk = dedupedRows.slice(i, i + chunkSize);
      const { error } = await supabase.from('price_history').insert(chunk);
      if (!error) inserted += chunk.length;
    }

    return NextResponse.json({ status: 'done', tag, totalAuctions: auctions.length, daysAggregated: rows.length, inserted });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}