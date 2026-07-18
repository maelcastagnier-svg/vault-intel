// app/api/debug/nbt-test/route.ts
// Teste le decode NBT sur un item réel de l'AH Hypixel
import { NextResponse } from 'next/server'
import { gunzipSync }   from 'zlib'

export async function GET() {
  try {
    // Fetch première page AH
    const res  = await fetch('https://api.hypixel.net/v2/skyblock/auctions?page=0')
    const data = await res.json()
    const bins = (data.auctions || []).filter((a: any) => a.bin && !a.claimed && a.item_bytes)

    if (bins.length === 0) {
      return NextResponse.json({ error: 'No BIN auctions with item_bytes found' })
    }

    // Prend les 3 premiers avec item_bytes
    const samples = bins.slice(0, 3).map((auc: any) => {
      try {
        const compressed = Buffer.from(auc.item_bytes, 'base64')
        const raw        = gunzipSync(compressed)

        // Log les premiers bytes pour comprendre la structure
        const hex    = raw.slice(0, 64).toString('hex')
        const hasTag = raw.toString('utf8', 0, 100)

        return {
          auction_uuid: auc.uuid,
          item_name:    auc.item_name,
          item_bytes_length: auc.item_bytes.length,
          decompressed_length: raw.length,
          first_bytes_hex: hex,
          readable_preview: hasTag.replace(/[^\x20-\x7E]/g, '.'),
        }
      } catch (e: any) {
        return { auction_uuid: auc.uuid, error: e.message }
      }
    })

    return NextResponse.json({ samples })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}