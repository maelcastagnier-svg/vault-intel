// app/api/admin/build-id-mapping/route.ts
// ONE-SHOT : compare noms SkyCofl vs noms NBT et construit le mapping automatiquement
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalize(name: string): string {
  return name.toLowerCase()
    .replace(/['''`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Fetch tous les items SkyCofl avec leur name + tag
  const res = await fetch('https://sky.coflnet.com/api/items', {
    headers: { 'Accept': 'application/json' }
  })
  const skycoflItems: { name: string; tag: string; flags: string }[] = await res.json()

  // Filtre AUCTION uniquement
  const skycoflAuction = skycoflItems.filter(i => i.flags === 'AUCTION' && i.name && i.tag)

  // 2. Charge nos items NBT depuis ah_scan_buffer (vrai nom Hypixel)
  const { data: nbtItems } = await supabase
    .from('ah_scan_buffer')
    .select('base_item_id, item_name')

  // Build map normalisé : nom → hypixel_id
  const nbtByName = new Map<string, string>()
  for (const item of nbtItems || []) {
    if (item.item_name) {
      nbtByName.set(normalize(item.item_name), item.base_item_id)
    }
    // Aussi par ID normalisé
    nbtByName.set(normalize(item.base_item_id.replace(/_/g, ' ')), item.base_item_id)
  }

  // 3. Trouve les mismatches
  const mappings: { skycofl_id: string; hypixel_id: string; skycofl_name: string }[] = []
  const unmatched: { skycofl_id: string; skycofl_name: string }[] = []

  for (const item of skycoflAuction) {
    const hypixelId = nbtByName.get(normalize(item.name))

    if (hypixelId && hypixelId !== item.tag) {
      // Mismatch trouvé !
      mappings.push({
        skycofl_id:   item.tag,
        hypixel_id:   hypixelId,
        skycofl_name: item.name,
      })
    } else if (!hypixelId) {
      unmatched.push({ skycofl_id: item.tag, skycofl_name: item.name })
    }
  }

  // 4. Applique les mappings dans price_history_ah
  let updated = 0
  for (const m of mappings) {
    const { error } = await supabase
      .from('price_history_ah')
      .update({ base_item_id: m.hypixel_id })
      .eq('base_item_id', m.skycofl_id)
    if (!error) updated++
  }

  // 5. Sauvegarde le mapping dans item_id_mapping
  if (mappings.length > 0) {
    await supabase.from('item_id_mapping').upsert(
      mappings.map(m => ({
        skycofl_id:   m.skycofl_id,
        hypixel_id:   m.hypixel_id,
        display_name: m.skycofl_name,
      })),
      { onConflict: 'skycofl_id' }
    )
  }

  return NextResponse.json({
    success:          true,
    skycofl_items:    skycoflAuction.length,
    mappings_found:   mappings.length,
    rows_updated:     updated,
    unmatched:        unmatched.length,
    sample_mappings:  mappings.slice(0, 10),
    sample_unmatched: unmatched.slice(0, 5),
  })
}