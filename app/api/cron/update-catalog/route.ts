// app/api/cron/update-catalog/route.ts
// Tourne tous les jours à 2h — met à jour items_catalog avec les nouveaux items
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Nouveaux items Bazaar
    const { data: bzItems } = await supabase
      .from('price_history')
      .select('item_id')
      .gt('sell_price', 0)
      .order('item_id')

    // Nouveaux items AH
    const { data: ahItems } = await supabase
      .from('price_history_ah')
      .select('base_item_id')
      .not('base_item_id', 'is', null)
      .order('base_item_id')

    // Déduplique
    const bzIds = [...new Set((bzItems || []).map(r => r.item_id))]
    const ahIds = [...new Set((ahItems || []).map(r => r.base_item_id))]

    // Upsert Bazaar
    let bzAdded = 0
    for (let i = 0; i < bzIds.length; i += 200) {
      const batch = bzIds.slice(i, i + 200).map(id => ({
        item_id:   id,
        item_name: id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()),
        source:    'bazaar',
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase
        .from('items_catalog')
        .upsert(batch, { onConflict: 'item_id', ignoreDuplicates: true })
      if (!error) bzAdded += batch.length
    }

    // Upsert AH
    let ahAdded = 0
    for (let i = 0; i < ahIds.length; i += 200) {
      const batch = ahIds.slice(i, i + 200).map(id => ({
        item_id:   id,
        item_name: id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()),
        source:    'ah',
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase
        .from('items_catalog')
        .upsert(batch, { onConflict: 'item_id', ignoreDuplicates: true })
      if (!error) ahAdded += batch.length
    }

    // Compte total
    const { count } = await supabase
      .from('items_catalog')
      .select('*', { count: 'exact', head: true })

    return NextResponse.json({
      success:   true,
      bazaar:    bzAdded,
      ah:        ahAdded,
      total:     count,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}