import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const revalidate = 300 // cache 5 minutes, this is a marketing stat not a live dashboard

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exactCount(supabase: any, table: string) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`${table}: ${error.message}`)
  return count ?? 0
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase server credentials not configured' }, { status: 500 })
  }
  // Service-role client (server-only) so exact counts bypass RLS instead of hitting the
  // plan-gated policies on price_history/price_history_ah — same pattern as
  // app/api/player/sync/route.ts. These are aggregate counts only (a number), never row
  // content, so it's safe to expose publicly on the marketing homepage.
  const supabase = createClient(url, key)

  try {
    const [itemsCatalog, priceHistory, priceHistoryAh, variants] = await Promise.all([
      exactCount(supabase, 'items_catalog'),
      exactCount(supabase, 'price_history'),
      exactCount(supabase, 'price_history_ah'),
      exactCount(supabase, 'price_history_ah_variants'),
    ])

    return NextResponse.json({
      itemsTracked: itemsCatalog,
      priceDataPoints: priceHistory + priceHistoryAh,
      variantDataPoints: variants,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
