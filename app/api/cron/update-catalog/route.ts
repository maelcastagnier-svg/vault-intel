// app/api/cron/update-catalog/route.ts
// Tourne chaque nuit à 2h :
// 1. Ajoute les nouveaux items depuis price_history + price_history_ah
// 2. Met à jour les noms depuis l'API Hypixel officielle
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function toLabel(id: string): string {
  return id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Fetch noms officiels Hypixel
  const hypixelRes  = await fetch('https://api.hypixel.net/v2/resources/skyblock/items')
  const hypixelData = await hypixelRes.json()
  const hypixelItems: { id: string; name: string }[] = hypixelData.items || []
  const hypixelNames = new Map<string, string>()
  for (const item of hypixelItems) {
    if (item.id && item.name) hypixelNames.set(item.id, item.name)
  }

  // 2. Nouveaux items Bazaar
  const { data: bzItems } = await supabase
    .from('price_history')
    .select('item_id')
    .gt('sell_price', 0)
    .limit(10000)
  const bzIds = [...new Set((bzItems || []).map(r => r.item_id))]

  // 3. Nouveaux items AH
  const { data: ahItems } = await supabase
    .from('price_history_ah')
    .select('base_item_id')
    .not('base_item_id', 'is', null)
    .limit(10000)
  const ahIds = [...new Set((ahItems || []).map(r => r.base_item_id))]

  // 4. Construit les rows avec noms Hypixel si disponible
  const allItems = [
    ...bzIds.map(id => ({
      item_id:    id,
      item_name:  hypixelNames.get(id) || toLabel(id),
      source:     'bazaar',
      updated_at: new Date().toISOString(),
    })),
    ...ahIds.map(id => ({
      item_id:    id,
      item_name:  hypixelNames.get(id) || toLabel(id),
      source:     'ah',
      updated_at: new Date().toISOString(),
    })),
  ]

  // 5. Upsert tout le catalog en une fois (met à jour les noms existants aussi)
  let upserted = 0
  for (let i = 0; i < allItems.length; i += 200) {
    const { error } = await supabase
      .from('items_catalog')
      .upsert(allItems.slice(i, i + 200), { onConflict: 'item_id' })
    if (!error) upserted += Math.min(200, allItems.length - i)
  }

  // Stats
  const hypixelMatched = allItems.filter(i => hypixelNames.has(i.item_id)).length
  const fallback       = allItems.length - hypixelMatched

  return NextResponse.json({
    success:          true,
    total:            allItems.length,
    upserted,
    hypixel_named:    hypixelMatched,
    fallback_named:   fallback,
    sample: allItems
      .filter(i => hypixelNames.has(i.item_id))
      .slice(0, 5)
      .map(i => ({ id: i.item_id, name: i.item_name }))
  })
}