// app/api/init-ah-import/route.ts
// ONE-SHOT : peuple historic_import_progress avec tous les vrais tags SkyCofl
// Supporte les flags string "AUCTION" et bitmask numérique (bit 4 = AUCTION)
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuction(flags: any): boolean {
  if (typeof flags === 'string') return flags === 'AUCTION'
  if (typeof flags === 'number') return (flags & 4) !== 0 // bit AUCTION
  return false
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Fetch tous les items SkyCofl
  const res = await fetch('https://sky.coflnet.com/api/items', {
    headers: { 'Accept': 'application/json' }
  })
  const items: { name: string; tag: string; flags: any }[] = await res.json()

  // 2. Filtre AUCTION (string ou bitmask) + exclut les tags invalides (format Minecraft legacy avec :)
  const auctionItems = items.filter(i => 
    i.tag && 
    isAuction(i.flags) && 
    !i.tag.includes(':') &&  // exclut LOG_2:2, LEATHER_BOOTS:31 etc.
    i.tag.length > 0
  )

  // 3. Récupère les items déjà en DB
  const { data: existing } = await supabase
    .from('historic_import_progress')
    .select('item_id')
    .eq('item_type', 'AH')

  const existingIds = new Set((existing || []).map(e => e.item_id))

  // 4. Insère les nouveaux
  const toInsert = auctionItems
    .filter(i => !existingIds.has(i.tag))
    .map(i => ({
      item_id:           i.tag,
      item_type:         'AH',
      liquidity:         'HIGH',
      status:            'pending',
      years_completed:   0,
      last_processed_at: null,
    }))

  let inserted = 0
  for (let i = 0; i < toInsert.length; i += 200) {
    const { error } = await supabase
      .from('historic_import_progress')
      .insert(toInsert.slice(i, i + 200))
    if (!error) inserted += Math.min(200, toInsert.length - i)
  }

  // 5. Stats par type de flag
  const flagStats: Record<string, number> = {}
  for (const item of auctionItems) {
    const key = String(item.flags)
    flagStats[key] = (flagStats[key] || 0) + 1
  }

  return NextResponse.json({
    success:              true,
    total_skycofl:        items.length,
    skycofl_auction:      auctionItems.length,
    already_existing:     existingIds.size,
    newly_inserted:       inserted,
    flag_breakdown:       flagStats,
    sample_new:           toInsert.slice(0, 5).map(i => i.item_id),
  })
}