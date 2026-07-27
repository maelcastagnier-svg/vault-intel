// app/api/debug/test-variant-base/route.ts
// TEMPORAIRE — validation du 3e bloc de ah-aggregate (price_history_ah_variant_base).
// Runs server-side on the preview deployment, so it can read CRON_SECRET/
// SUPABASE_SERVICE_ROLE_KEY straight from Vercel's own env — no secret needs to
// pass through the person testing this. Supprimée après validation.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin

  // 1. Déclenche le vrai cron ah-aggregate sur ce déploiement
  const cronRes = await fetch(`${origin}/api/cron/ah-aggregate`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const cronResult = await cronRes.json().catch(() => ({ error: 'non-JSON response', status: cronRes.status }))

  // 2. Cherche des lignes Necron's Armor spécifiquement (sans supposer les IDs
  //    exacts -- "Necron's Boots" est en vrai POWER_WITHER_BOOTS, pas NECRON_BOOTS)
  const { data: necronRows } = await supabase
    .from('price_history_ah_variant_base')
    .select('*')
    .ilike('item_name', '%necron%')
    .order('contributing_variants', { ascending: false })
    .order('data_points', { ascending: false })
    .limit(10)

  // 3. Sinon, top rows toutes catégories par contributing_variants -- garantit
  //    un exemple concret même si Necron's n'a pas encore assez de scans aujourd'hui
  const { data: topRows } = await supabase
    .from('price_history_ah_variant_base')
    .select('*')
    .order('contributing_variants', { ascending: false })
    .order('data_points', { ascending: false })
    .limit(10)

  const { count: totalRows } = await supabase
    .from('price_history_ah_variant_base')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({
    cron_result:  cronResult,
    total_rows_in_table: totalRows,
    necron_rows:  necronRows || [],
    top_rows_by_contributing_variants: topRows || [],
  })
}
