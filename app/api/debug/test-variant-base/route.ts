// app/api/debug/test-variant-base/route.ts
// TEMPORAIRE — validation du 3e bloc de ah-aggregate (price_history_ah_variant_base).
// Runs server-side on the preview deployment, so it can read CRON_SECRET/
// SUPABASE_SERVICE_ROLE_KEY straight from Vercel's own env — no secret needs to
// pass through the person testing this. Supprimée après validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAhAggregate } from '../../cron/ah-aggregate/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // Appel direct (pas de self-fetch HTTP) -- un self-fetch vers une autre
  // route du même déploiement se heurte au mur SSO de Vercel Deployment
  // Protection, qui n'a pas de cookie de bypass sur ce trafic serveur-serveur,
  // donc CRON_SECRET n'atteignait jamais le vrai handler (confirmé : 200 avec
  // un corps non-JSON au lieu du JSON réel de la route).
  let cronResult: any
  try {
    cronResult = await runAhAggregate()
  } catch (e: any) {
    cronResult = { error: e.message }
  }

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
