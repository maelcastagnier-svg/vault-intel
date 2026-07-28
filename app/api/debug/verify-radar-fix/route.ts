import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseService = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const supabaseAnon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const TEST_EMAIL = 'mael.castagnier+radartest@gmail.com'

// Même logique que fmt() dans RadarSection.tsx, pour reproduire le texte exact affiché
function fmt(n: number) {
  if (!n || isNaN(n)) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}

export async function GET() {
  // 1. Confirme que le compte test résout bien à 'elite' (même requête que getUserPlan())
  const { data: sub } = await supabaseService
    .from('subscriptions')
    .select('plan, status')
    .eq('email', TEST_EMAIL)
    .single()
  const resolvedPlan = (sub?.status === 'active' && ['alert', 'pro', 'elite'].includes(sub.plan)) ? sub.plan : 'free'

  // 2. Reproduit exactement les requêtes anon de RadarSection.tsx pour obtenir
  //    les vrais chiffres qui s'afficheraient dans le composant.
  const { data: catalog } = await supabaseAnon
    .from('items_catalog')
    .select('item_id, item_name, source')
    .order('item_id')
  const { count: variantRows, error: variantErr } = await supabaseAnon
    .from('price_history_ah_variants')
    .select('*', { count: 'exact', head: true })
  const { count: itemCountHeader } = await supabaseAnon
    .from('items_catalog')
    .select('*', { count: 'exact', head: true })

  const total = catalog?.length ?? 0
  const bazaar = catalog?.filter(r => r.source === 'bazaar').length ?? 0
  const ah = catalog?.filter(r => r.source === 'ah').length ?? 0

  return NextResponse.json({
    test_account_resolves_plan: resolvedPlan,
    radar_tab_visible: ['pro', 'elite'].includes(resolvedPlan),
    rendered_strings: {
      radar_header: `Price explorer · ${itemCountHeader ?? '…'} items · Bazaar + AH · up to 3 years`,
      item_explorer_header: `📊 ITEM EXPLORER — ${total || '…'} ITEMS`,
      empty_state_line: `${bazaar} Bazaar · ${ah} AH · ${fmt(variantRows ?? 0)} variant price points tracked`,
    },
    _debug_variant_rows_raw: variantRows,
    _debug_variant_error: variantErr?.message || null,
  })
}
