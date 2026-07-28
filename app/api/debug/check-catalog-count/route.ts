// app/api/debug/check-catalog-count/route.ts
// TEMPORAIRE -- vérifie le vrai nombre de lignes dans items_catalog, si la
// requête plate client-side est vraiment tronquée par le plafond par défaut
// de Supabase, et si get_all_catalog_items() (déjà utilisée par
// update-catalog/route.ts en service-role) est aussi appelable en clé anon
// -- pour savoir si on peut la réutiliser côté client plutôt que de
// réimplémenter une pagination range() en parallèle. Supprimée après usage.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { count: realCount } = await supabaseService
    .from('items_catalog').select('*', { count: 'exact', head: true })

  const { data: plainAnonQuery } = await supabaseAnon
    .from('items_catalog').select('item_id').order('item_id')

  const { data: rpcAnonResult, error: rpcErr } = await supabaseAnon.rpc('get_all_catalog_items')

  return NextResponse.json({
    real_total_count: realCount,
    plain_anon_query_rows: plainAnonQuery?.length ?? null,
    rpc_anon_callable: !rpcErr,
    rpc_anon_error: rpcErr?.message || null,
    rpc_anon_rows: rpcAnonResult?.length ?? null,
  })
}
