// app/api/skycofl-import/route.ts
// Route de traitement — telecharge, dezippe (zlib natif Node.js), et insere dans Supabase
// Appelee depuis n8n via HTTP Request, aucune donnee ne reste stockee ici

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import zlib from 'zlib';
import { promisify } from 'util';

const inflateRaw = promisify(zlib.inflateRaw);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function extractJsonFromZip(buffer: Buffer): { compressionMethod: number; compressedData: Buffer } {
  const sig = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (sig === -1) throw new Error('Not a valid ZIP');

  const compressionMethod = buffer.readUInt16LE(sig + 8);
  const compressedSize = buffer.readUInt32LE(sig + 18);
  const fileNameLength = buffer.readUInt16LE(sig + 26);
  const extraFieldLength = buffer.readUInt16LE(sig + 28);
  const dataStart = sig + 30 + fileNameLength + extraFieldLength;
  const compressedData = buffer.slice(dataStart, dataStart + compressedSize);

  return { compressionMethod, compressedData };
}

export async function POST(req: NextRequest) {
  try {
    const { tag, accountToken, startDate, endDate } = await req.json();

    if (!tag || !accountToken) {
      return NextResponse.json({ error: 'Missing tag or accountToken' }, { status: 400 });
    }

    const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    // 1. Telecharge le ZIP
    const exportRes = await fetch(
      `https://sky.coflnet.com/api/bazaar/${tag}/export?start=${start}&end=${end}`,
      { headers: { Authorization: `Bearer ${accountToken}` } }
    );

    if (!exportRes.ok) {
      return NextResponse.json({ error: `SkyCofl export failed: ${exportRes.status}` }, { status: 502 });
    }

    const arrayBuffer = await exportRes.arrayBuffer();
    const zipBuffer = Buffer.from(arrayBuffer);

    // DEBUG temporaire
    if (req.nextUrl.searchParams.get('debug') === 'true') {
      return NextResponse.json({
        bufferLength: zipBuffer.length,
        first20Bytes: Array.from(zipBuffer.slice(0, 20)),
        contentType: exportRes.headers.get('content-type'),
        first100AsString: zipBuffer.slice(0, 100).toString('utf8').replace(/[^\x20-\x7E]/g, '?')
      });
    }

    // 2. Dezippe avec zlib natif
    const { compressionMethod, compressedData } = extractJsonFromZip(zipBuffer);
    let jsonText: string;

    if (compressionMethod === 0) {
      jsonText = compressedData.toString('utf8');
    } else if (compressionMethod === 8) {
      const decompressed = await inflateRaw(compressedData);
      jsonText = decompressed.toString('utf8');
    } else {
      return NextResponse.json({ error: `Unsupported compression method: ${compressionMethod}` }, { status: 500 });
    }

    const data = JSON.parse(jsonText);
    if (!Array.isArray(data)) {
      return NextResponse.json({ error: 'Unexpected data format', preview: jsonText.substring(0, 200) }, { status: 500 });
    }

    // 3. Prepare les lignes valides
    const rows = data
      .filter((point: any) => point.buy != null && point.sell != null && point.timestamp)
      .map((point: any) => ({
        item_id: tag,
        item_name: tag.replace(/_/g, ' '),
        source: 'BAZAAR_SKYCOFL_HISTORIC',
        buy_price: point.buy,
        sell_price: point.sell,
        avg_price: (point.buy + point.sell) / 2,
        volume: (point.buyVolume || 0) + (point.sellVolume || 0),
        timestamp: point.timestamp,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ status: 'done', inserted: 0, reason: 'no valid rows' });
    }

    // 4. Verifie les doublons existants
    const { data: existing } = await supabase
      .from('price_history')
      .select('timestamp')
      .eq('item_id', tag)
      .eq('source', 'BAZAAR_SKYCOFL_HISTORIC');

    const existingTimestamps = new Set((existing || []).map((r) => r.timestamp));
    const dedupedRows = rows.filter((r) => !existingTimestamps.has(r.timestamp));

    // 5. Insere par batch
    let inserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < dedupedRows.length; i += chunkSize) {
      const chunk = dedupedRows.slice(i, i + chunkSize);
      const { error } = await supabase.from('price_history').insert(chunk);
      if (!error) inserted += chunk.length;
    }

    return NextResponse.json({ status: 'done', tag, totalPoints: rows.length, inserted, skipped: rows.length - dedupedRows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}