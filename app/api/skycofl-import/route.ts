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
  // Cherche le End of Central Directory record (EOCD) : signature PK\x05\x06
  const eocdSig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.slice(i, i + 4).equals(eocdSig)) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('EOCD not found - not a valid ZIP');

  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  // Lit la premiere entree du Central Directory : signature PK\x01\x02
  const cdSig = buffer.slice(centralDirOffset, centralDirOffset + 4);
  if (!cdSig.equals(Buffer.from([0x50, 0x4b, 0x01, 0x02]))) {
    throw new Error('Central Directory signature mismatch');
  }

  const compressionMethod = buffer.readUInt16LE(centralDirOffset + 10);
  const compressedSize = buffer.readUInt32LE(centralDirOffset + 20);
  const fileNameLength = buffer.readUInt16LE(centralDirOffset + 28);
  const localHeaderOffset = buffer.readUInt32LE(centralDirOffset + 42);

  // Utilise l'offset du Local Header pour trouver le debut des donnees, mais la taille du Central Directory (fiable)
  const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const localExtraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
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

    if (req.nextUrl.searchParams.get('debug2') === 'true') {
      return NextResponse.json({
        dataLength: data.length,
        firstItem: data[0] || null,
        sampleKeys: data[0] ? Object.keys(data[0]) : []
      });
    }

    // 3. Prepare les lignes valides
    const rows = data
      .filter((point: any) => point.buyPrice != null && point.sellPrice != null && point.timeStamp)
      .map((point: any) => ({
        item_id: tag,
        item_name: tag.replace(/_/g, ' '),
        source: 'BAZAAR_SKYCOFL_HISTORIC',
        buy_price: point.buyPrice,
        sell_price: point.sellPrice,
        avg_price: (point.buyPrice + point.sellPrice) / 2,
        volume: (point.buyVolume || 0) + (point.sellVolume || 0),
        timestamp: point.timeStamp,
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