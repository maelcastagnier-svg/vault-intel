// app/api/admin/sync-catalog-names/route.ts
// ONE-SHOT : met à jour items_catalog avec les vrais noms Hypixel
// Source : api.hypixel.net/v2/resources/skyblock/items
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Fetch tous les items Hypixel avec leurs noms officiels
  const res  = await fetch('https://api.hypixel.net/v2/resources/skyblock/items')
  const data = await res.json()
  const hypixelItems: { id: string; name: string }[] = data.items || []

  // Map ID → nom officiel
  const hypixelNames = new Map<string, string>()
  for (const item of hypixelItems) {
    if (item.id && item.name) hypixelNames.set(item.id, item.name)
  }

  // 2. Charge tous les items du catalog
  const { data: catalog } = await supabase
    .from('items_catalog')
    .select('item_id, item_name, source')

  // 3. Met à jour les noms par batch
  let updated   = 0
  let not_found = 0
  const samples: { item_id: string; old: string; new: string }[] = []
  const toUpdate: { item_id: string; item_name: string }[] = []

  for (const item of catalog || []) {
    const hypixelName = hypixelNames.get(item.item_id)
    if (!hypixelName) { not_found++; continue }
    if (hypixelName !== item.item_name) {
      if (samples.length < 15) samples.push({ item_id: item.item_id, old: item.item_name, new: hypixelName })
      toUpdate.push({ item_id: item.item_id, item_name: hypixelName })
    }
  }

  // Update par batch de 100 via upsert
  for (let i = 0; i < toUpdate.length; i += 100) {
    const batch = toUpdate.slice(i, i + 100)
    const { error } = await supabase
      .from('items_catalog')
      .upsert(batch.map(r => ({
        item_id:   r.item_id,
        item_name: r.item_name,
      })), { onConflict: 'item_id' })
    if (!error) updated += batch.length
  }

  return NextResponse.json({
    success:       true,
    hypixel_items: hypixelItems.length,
    catalog_items: (catalog || []).length,
    updated,
    not_found,
    sample_updates: samples,
  })
}