// app/api/init-bazaar-import/route.ts
// ONE-SHOT : peuple historic_import_progress avec les 1933 items Bazaar Hypixel officiels
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

  // 1. Fetch tous les items Bazaar officiels Hypixel
  const res  = await fetch('https://api.hypixel.net/v2/skyblock/bazaar')
  const data = await res.json()
  const bazaarIds: string[] = Object.keys(data.products || {})

  if (bazaarIds.length === 0) {
    return NextResponse.json({ error: 'Hypixel API returned empty' }, { status: 500 })
  }

  // 2. Récupère les items déjà en DB
  const { data: existing } = await supabase
    .from('historic_import_progress')
    .select('item_id')
    .eq('item_type', 'BAZAAR')

  const existingIds = new Set((existing || []).map(e => e.item_id))

  // 3. Insère les nouveaux + remet en pending les existants
  const toInsert = bazaarIds.filter(id => !existingIds.has(id)).map(id => ({
    item_id:           id,
    item_type:         'BAZAAR',
    status:            'pending',
    years_completed:   0,
    last_processed_at: null,
  }))

  // Remet TOUS les Bazaar en pending (pour réimporter depuis zéro)
  await supabase.from('historic_import_progress')
    .update({ status: 'pending', years_completed: 0, last_processed_at: null })
    .eq('item_type', 'BAZAAR')

  // Insère les nouveaux
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += 200) {
    const { error } = await supabase
      .from('historic_import_progress')
      .insert(toInsert.slice(i, i + 200))
    if (!error) inserted += Math.min(200, toInsert.length - i)
  }

  return NextResponse.json({
    success:          true,
    hypixel_bazaar:   bazaarIds.length,
    already_existing: existingIds.size,
    newly_inserted:   inserted,
    total_pending:    bazaarIds.length,
    sample:           bazaarIds.slice(0, 5),
  })
}