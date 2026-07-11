// app/api/cron/historic-import/route.ts
// Route autonome pilotee par Vercel Cron — aucune dependance a n8n pour cette tache
// Traite plusieurs items par execution, dans la limite de temps disponible (maxDuration)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import zlib from 'zlib';
import { promisify } from 'util';

export const maxDuration = 300; // 5 min sur Pro, sera plafonne a 60s sur Hobby automatiquement

const inflateRaw = promisify(zlib.inflateRaw);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ACCOUNT_TOKEN = process.env.SKYCOFL_ACCOUNT_TOKEN!;
const YEARS_TARGET = 4;
const TIME_BUDGET_MS = 270000; // s'arrete a 4min30 pour laisser une marge avant le maxDuration

function extractJsonFromZip(buffer: Buffer): { compressionMethod: number; compressedData: Buffer } {
  const eocdSig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.slice(i, i + 4).equals(eocdSig)) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('EOCD not found');
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const compressionMethod = buffer.readUInt16LE(centralDirOffset + 10);
  const compressedSize = buffer.readUInt32LE(centralDirOffset + 20);
  const localHeaderOffset = buffer.readUInt32LE(centralDirOffset + 42);
  const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const localExtraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
  const compressedData = buffer.slice(dataStart, dataStart + compressedSize);
  return { compressionMethod, compressedData };
}

async function processBazaarItem(tag: string, startDate: string, endDate: string, granularity: 'daily' | 'monthly') {
  const exportRes = await fetch(
    `https://sky.coflnet.com/api/bazaar/${tag}/export?start=${startDate}&end=${endDate}`,
    { headers: { Authorization: `Bearer ${ACCOUNT_TOKEN}` } }
  );
  if (!exportRes.ok) throw new Error(`Bazaar export failed: ${exportRes.status}`);

  const zipBuffer = Buffer.from(await exportRes.arrayBuffer());
  const { compressionMethod, compressedData } = extractJsonFromZip(zipBuffer);
  const jsonText = compressionMethod === 0 ? compressedData.toString('utf8') : (await inflateRaw(compressedData)).toString('utf8');
  const data = JSON.parse(jsonText);
  if (!Array.isArray(data)) throw new Error('Unexpected format');

  const buckets: Record<string, { buySum: number; sellSum: number; volSum: number; count: number }> = {};
  for (const point of data) {
    if (point.buyPrice == null || point.sellPrice == null || !point.timeStamp) continue;
    const key = granularity === 'monthly' ? point.timeStamp.substring(0, 7) : point.timeStamp.substring(0, 10);
    if (!buckets[key]) buckets[key] = { buySum: 0, sellSum: 0, volSum: 0, count: 0 };
    buckets[key].buySum += point.buyPrice;
    buckets[key].sellSum += point.sellPrice;
    buckets[key].volSum += (point.buyVolume || 0) + (point.sellVolume || 0);
    buckets[key].count += 1;
  }

  const rows = Object.entries(buckets).map(([bucket, agg]) => ({
    item_id: tag, item_name: tag.replace(/_/g, ' '),
    source: granularity === 'monthly' ? 'BAZAAR_SKYCOFL_MONTHLY' : 'BAZAAR_SKYCOFL_HISTORIC',
    buy_price: agg.buySum / agg.count, sell_price: agg.sellSum / agg.count,
    avg_price: (agg.buySum / agg.count + agg.sellSum / agg.count) / 2,
    volume: agg.volSum, timestamp: (granularity === 'monthly' ? bucket + '-01' : bucket) + 'T12:00:00.000Z',
  }));

  const { data: existing } = await supabase.from('price_history').select('timestamp')
    .eq('item_id', tag).eq('source', rows[0]?.source || 'BAZAAR_SKYCOFL_HISTORIC');
  const existingTs = new Set((existing || []).map((r) => r.timestamp));
  const deduped = rows.filter((r) => !existingTs.has(r.timestamp));

  let inserted = 0;
  for (let i = 0; i < deduped.length; i += 500) {
    const chunk = deduped.slice(i, i + 500);
    const { error } = await supabase.from('price_history').insert(chunk);
    if (!error) inserted += chunk.length;
  }
  return inserted;
}

async function processAHItem(tag: string, startUnix: number, endUnix: number) {
  const archiveRes = await fetch(
    `https://sky.coflnet.com/api/auctions/tag/${tag}/archive/overview?EndAfter=${startUnix}&EndBefore=${endUnix}`,
    { headers: { Authorization: `Bearer ${ACCOUNT_TOKEN}` } }
  );
  if (!archiveRes.ok) throw new Error(`AH archive failed: ${archiveRes.status}`);

  const data = await archiveRes.json();
  const auctions = data.auctions || [];
  if (auctions.length === 0) return 0;

  const buckets: Record<string, { prices: number[] }> = {};
  for (const auc of auctions) {
    if (!auc.price || !auc.end) continue;
    const day = auc.end.substring(0, 10);
    if (!buckets[day]) buckets[day] = { prices: [] };
    buckets[day].prices.push(auc.price);
  }

  const rows = Object.entries(buckets).map(([day, b]) => {
    const avg = b.prices.reduce((a, c) => a + c, 0) / b.prices.length;
    return {
      item_id: tag, item_name: tag.replace(/_/g, ' '), source: 'AH_SKYCOFL_HISTORIC',
      buy_price: Math.min(...b.prices), sell_price: Math.max(...b.prices), avg_price: avg,
      volume: b.prices.length, timestamp: day + 'T12:00:00.000Z',
    };
  });

  const { data: existing } = await supabase.from('price_history').select('timestamp')
    .eq('item_id', tag).eq('source', 'AH_SKYCOFL_HISTORIC');
  const existingTs = new Set((existing || []).map((r) => r.timestamp));
  const deduped = rows.filter((r) => !existingTs.has(r.timestamp));

  let inserted = 0;
  for (let i = 0; i < deduped.length; i += 500) {
    const chunk = deduped.slice(i, i + 500);
    const { error } = await supabase.from('price_history').insert(chunk);
    if (!error) inserted += chunk.length;
  }
  return inserted;
}

export async function GET(req: NextRequest) {
  // Securite : verifie le secret Cron de Vercel
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const processed: any[] = [];

  while (Date.now() - startTime < TIME_BUDGET_MS) {
    const { data: batch } = await supabase
      .from('historic_import_progress')
      .select('*')
      .eq('status', 'pending')
      .order('years_completed', { ascending: true })
      .limit(1);

    if (!batch || batch.length === 0) {
      return NextResponse.json({ status: 'all_done', processed });
    }

    const entry = batch[0];
    const yearToProcess = entry.years_completed;
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() - yearToProcess);
    const startDate = new Date(endDate);
    startDate.setFullYear(startDate.getFullYear() - 1);
    const granularity = entry.liquidity === 'HIGH' ? 'daily' : 'monthly';

    try {
      let inserted = 0;
      if (entry.item_type === 'BAZAAR') {
        inserted = await processBazaarItem(entry.item_id, startDate.toISOString(), endDate.toISOString(), granularity);
      } else {
        inserted = await processAHItem(entry.item_id, Math.floor(startDate.getTime()/1000), Math.floor(endDate.getTime()/1000));
      }

      const newYears = yearToProcess + 1;
      await supabase.from('historic_import_progress').update({
        years_completed: newYears,
        status: newYears >= YEARS_TARGET ? 'done' : 'pending',
        last_processed_at: new Date().toISOString()
      }).eq('id', entry.id);

      processed.push({ item: entry.item_id, year: yearToProcess, inserted });
    } catch (e: any) {
      processed.push({ item: entry.item_id, year: yearToProcess, error: e.message });
      // Marque quand meme comme tente pour eviter de bloquer sur un item qui echoue systematiquement
      await supabase.from('historic_import_progress').update({
        last_processed_at: new Date().toISOString()
      }).eq('id', entry.id);
    }

    // Petite pause pour respecter le rate limit SkyCofl (5 unites/5min)
    await new Promise(r => setTimeout(r, 15000)); // 15s entre chaque item = ~4/min, sous la limite
  }

  return NextResponse.json({ status: 'batch_done', processed });
}