// app/api/debug/test-radar-variants/route.ts
// TEMPORAIRE -- réplique exactement les deux requêtes corrigées de
// RadarSection.tsx (liste des variantes + série par variante) contre un vrai
// item connu pour avoir plusieurs vraies variantes (HYPERION), pour confirmer
// que le fix retourne de vraies variantes distinctes avant de merger.
// Supprimée après validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ITEM_ID = 'HYPERION'

export async function GET() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().split('T')[0]

  // Même requête que le fix pour la liste de variantes
  const { data: varRows, error: varErr } = await supabase
    .from('price_history_ah_variants')
    .select('variant_key')
    .eq('base_item_id', ITEM_ID)
    .gt('avg_price', 0)
    .gte('bucket_date', ninetyDaysAgo)

  const varCount = new Map<string, number>()
  for (const r of varRows || []) varCount.set(r.variant_key, (varCount.get(r.variant_key) || 0) + 1)
  const ordered = Array.from(varCount.entries()).sort((a, b) => b[1] - a[1])

  // Même requête que le fix pour la série d'UNE variante précise (la plus fréquente trouvée)
  const topVariant = ordered[0]?.[0]
  let seriesSample: any[] | null = null
  if (topVariant) {
    const startDate = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0]
    const { data } = await supabase
      .from('price_history_ah_variants')
      .select('bucket_date,avg_price,volume,variant_key')
      .eq('base_item_id', ITEM_ID)
      .eq('variant_key', topVariant)
      .gt('avg_price', 0)
      .gte('bucket_date', startDate)
      .order('bucket_date', { ascending: true })
      .limit(1500)
    seriesSample = data
  }

  return NextResponse.json({
    var_query_error: varErr?.message || null,
    distinct_variants_found: ordered.length,
    variants: ordered.map(([key, count]) => ({ key, count })),
    top_variant_tested: topVariant || null,
    top_variant_series_rows: seriesSample?.length ?? 0,
    top_variant_series_sample: seriesSample?.slice(0, 5) || [],
  })
}
