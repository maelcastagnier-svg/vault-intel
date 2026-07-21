// app/api/admin/build-id-mapping/route.ts
// ONE-SHOT : fetch Hypixel items API + SkyCofl items API
// Match par nom d'affichage → mapping SkyCofl tag → Hypixel ID
// Met à jour price_history_ah + item_id_mapping
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalize(name: string): string {
  return (name || '').toLowerCase()
    .replace(/['''`'']/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Fetch tous les items Hypixel officiel
  const hypixelRes = await fetch('https://api.hypixel.net/v2/resources/skyblock/items')
  const hypixelData = await hypixelRes.json()
  const hypixelItems: { id: string; name: string }[] = hypixelData.items || []

  // Build map nom normalisé → Hypixel ID
  const hypixelByName = new Map<string, string>()
  for (const item of hypixelItems) {
    if (item.name && item.id) {
      const key = normalize(item.name)
      if (key && !hypixelByName.has(key)) {
        hypixelByName.set(key, item.id)
      }
    }
  }

  // 2. Fetch tous les items SkyCofl AUCTION
  const skycoflRes = await fetch('https://sky.coflnet.com/api/items', {
    headers: { 'Accept': 'application/json' }
  })
  const skycoflItems: { name: string; tag: string; flags: string }[] = await skycoflRes.json()
  const skycoflAuction = skycoflItems.filter(i => i.flags === 'AUCTION' && i.name && i.tag)

  // 3. Match par nom
  const mappings: { skycofl_id: string; hypixel_id: string; skycofl_name: string }[] = []
  const exact_match: string[] = []
  const unmatched: string[] = []

  for (const item of skycoflAuction) {
    const key = normalize(item.name)
    const hypixelId = hypixelByName.get(key)

    if (!hypixelId) {
      unmatched.push(`${item.tag} (${item.name})`)
    } else if (hypixelId === item.tag) {
      exact_match.push(item.tag) // Déjà le bon ID → pas besoin de mapper
    } else {
      // Mismatch → besoin de mapper
      mappings.push({
        skycofl_id:   item.tag,
        hypixel_id:   hypixelId,
        skycofl_name: item.name,
      })
    }
  }

  // 4. Sauvegarde dans item_id_mapping
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

  // 5. Met à jour price_history_ah avec les vrais IDs Hypixel
  let updated = 0
  for (const m of mappings) {
    const { error } = await supabase
      .from('price_history_ah')
      .update({ base_item_id: m.hypixel_id })
      .eq('base_item_id', m.skycofl_id)
    if (!error) updated++
  }

  return NextResponse.json({
    success:          true,
    hypixel_items:    hypixelItems.length,
    skycofl_auction:  skycoflAuction.length,
    exact_match:      exact_match.length,
    mappings_found:   mappings.length,
    rows_updated:     updated,
    unmatched:        unmatched.length,
    sample_mappings:  mappings.slice(0, 15),
    sample_unmatched: unmatched.slice(0, 10),
  })
}