// app/api/admin/build-id-mapping/route.ts
// Fetch /api/item/TAG/details pour chaque item SkyCofl
// → name → match avec Hypixel API → vrai ID Hypixel
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const maxDuration = 60

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

  // 1. Fetch tous les items Hypixel officiel → map nom → ID
  const hypixelRes  = await fetch('https://api.hypixel.net/v2/resources/skyblock/items')
  const hypixelData = await hypixelRes.json()
  const hypixelItems: { id: string; name: string }[] = hypixelData.items || []

  // Map nom normalisé → ID Hypixel (noms uniques uniquement)
  const nameCount = new Map<string, number>()
  for (const i of hypixelItems) {
    const k = normalize(i.name)
    nameCount.set(k, (nameCount.get(k) || 0) + 1)
  }
  const hypixelByName = new Map<string, string>()
  for (const i of hypixelItems) {
    const k = normalize(i.name)
    if (nameCount.get(k) === 1) hypixelByName.set(k, i.id)
  }

  // 2. Fetch tous les items SkyCofl AUCTION
  const skycoflRes   = await fetch('https://sky.coflnet.com/api/items', { headers: { 'Accept': 'application/json' } })
  const skycoflItems: { name: string; tag: string; flags: string }[] = await skycoflRes.json()
  const toProcess    = skycoflItems.filter(i => i.flags === 'AUCTION' && i.tag)

  // 3. Pour chaque item SkyCofl, fetch /details pour avoir le vrai nom
  const mappings: { skycofl_id: string; hypixel_id: string; name: string }[] = []
  const exact:    string[] = []
  const failed:   string[] = []

  // Traite par batch de 10 pour ne pas timeout
  const BATCH = 20
  for (let i = 0; i < Math.min(toProcess.length, 200); i += BATCH) {
    const batch = toProcess.slice(i, i + BATCH)
    await Promise.all(batch.map(async item => {
      try {
        const res  = await fetch(`https://sky.coflnet.com/api/item/${encodeURIComponent(item.tag)}/details`)
        if (!res.ok) { failed.push(item.tag); return }
        const details: { name: string; tag: string } = await res.json()
        const name       = details.name || item.name
        const hypixelId  = hypixelByName.get(normalize(name))

        if (!hypixelId) {
          failed.push(`${item.tag} (${name}) → no match`)
        } else if (hypixelId === item.tag) {
          exact.push(item.tag) // déjà le bon ID
        } else {
          mappings.push({ skycofl_id: item.tag, hypixel_id: hypixelId, name })
        }
      } catch { failed.push(item.tag) }
    }))
  }

  // 4. Sauvegarde dans item_id_mapping
  if (mappings.length > 0) {
    await supabase.from('item_id_mapping').upsert(
      mappings.map(m => ({ skycofl_id: m.skycofl_id, hypixel_id: m.hypixel_id, display_name: m.name })),
      { onConflict: 'skycofl_id' }
    )
  }

  // 5. Met à jour price_history_ah
  let updated = 0
  for (const m of mappings) {
    const { error } = await supabase
      .from('price_history_ah')
      .update({ base_item_id: m.hypixel_id })
      .eq('base_item_id', m.skycofl_id)
    if (!error) updated++
  }

  return NextResponse.json({
    success:         true,
    processed:       Math.min(toProcess.length, 200),
    total_skycofl:   toProcess.length,
    exact_match:     exact.length,
    mappings_found:  mappings.length,
    rows_updated:    updated,
    failed:          failed.length,
    sample_mappings: mappings.slice(0, 10),
    note: toProcess.length > 200 ? `Only processed 200/${toProcess.length} - run again for more` : 'All processed'
  })
}