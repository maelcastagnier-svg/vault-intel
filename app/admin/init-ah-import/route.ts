// app/api/admin/init-ah-import/route.ts
// ONE-SHOT : peuple historic_import_progress avec les vrais tags SkyCofl
// Lance UNE SEULE FOIS puis supprime cette route
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Fetch tous les items depuis SkyCofl
  const res = await fetch('https://sky.coflnet.com/api/items', {
    headers: {
      'Authorization': `Bearer ${process.env.SKYCOFL_ACCOUNT_TOKEN}`,
      'Accept': 'application/json'
    }
  })

  if (!res.ok) throw new Error(`SkyCofl items list: ${res.status}`)

  const items: { name: string | null; tag: string; flags: string | number }[] = await res.json()

  // 2. Filtre uniquement les items AUCTION avec un tag valide
  const auctionItems = items.filter(i =>
    i.tag &&
    i.tag.length > 0 &&
    !i.tag.includes(':') &&  // exclut les items avec format invalide (FISHING_ROD:12)
    i.flags === 'AUCTION'    // uniquement AUCTION
  )

  // 3. Récupère les items déjà dans historic_import_progress
  const { data: existing } = await supabase
    .from('historic_import_progress')
    .select('item_id')
    .eq('item_type', 'AH')

  const existingIds = new Set((existing || []).map(e => e.item_id))

  // 4. Insère uniquement les nouveaux items SkyCofl
  const toInsert = auctionItems
    .filter(i => !existingIds.has(i.tag))
    .map(i => ({
      item_id:           i.tag,
      item_type:         'AH',
      liquidity:         'HIGH',  // SkyCofl a de la data = HIGH par défaut
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

  // 5. Marque les anciens items AH qui ne sont pas dans SkyCofl comme dead
  // (évite de les retenter indéfiniment)
  const skycoflTags = new Set(auctionItems.map(i => i.tag))
  const { data: oldItems } = await supabase
    .from('historic_import_progress')
    .select('item_id')
    .eq('item_type', 'AH')
    .eq('status', 'pending')

  const deadItems = (oldItems || []).filter(i => !skycoflTags.has(i.item_id))
  if (deadItems.length > 0) {
    for (let i = 0; i < deadItems.length; i += 200) {
      await supabase
        .from('historic_import_progress')
        .update({ status: 'done', last_processed_at: new Date().toISOString() })
        .in('item_id', deadItems.slice(i, i + 200).map(d => d.item_id))
    }
  }

  return NextResponse.json({
    success:              true,
    skycofl_auction_items: auctionItems.length,
    already_existing:     existingIds.size,
    newly_inserted:       inserted,
    marked_dead:          deadItems.length,
    sample_new:           toInsert.slice(0, 5).map(i => i.item_id),
  })
}