// Route de debug temporaire — validation du grounding de setup-generate-agent
// (voir app/api/cron/setup-generate-agent/route.ts). Génère UN setup réel
// pour une méthode LATE existante (money_making_late) via le vrai pipeline
// (loadPricedItems/gearCatalogForBudget/buildWikiContext/generateOne, importés
// directement — pas de self-fetch, même pattern que runAhAggregate). Route à
// supprimer après validation.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  loadPricedItems, gearCatalogForBudget, buildWikiContext, GROUNDING_RULES,
  generateOne, methodKey,
} from '../../cron/setup-generate-agent/route'
import { TIER_CONFIG } from '../../../../lib/money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data: analysis } = await supabase
    .from('claude_analysis')
    .select('content')
    .eq('section', 'money_making_late')
    .single()

  if (!analysis) {
    return NextResponse.json({ error: 'No money_making_late section in claude_analysis — run money-making-agent first' }, { status: 400 })
  }

  let tierData: any
  try { tierData = JSON.parse(analysis.content) } catch (e: any) {
    return NextResponse.json({ error: 'Failed to parse money_making_late content: ' + e.message }, { status: 500 })
  }

  const methods: any[] = [...(tierData.active || []), ...(tierData.vault || [])]
  if (methods.length === 0) {
    return NextResponse.json({ error: 'money_making_late has zero methods' }, { status: 400 })
  }

  const method =
    methods.find((m: any) => /mining|gemstone|crystal|glacite|hollow/i.test(m.method || '') || m.skill === 'mining') ||
    methods[0]

  const [{ data: ctx }, pricedItems] = await Promise.all([
    supabase.rpc('get_full_context'),
    loadPricedItems(),
  ])

  const catalog = gearCatalogForBudget(pricedItems, TIER_CONFIG.late.max_gear_cost)
  const wikiContext = buildWikiContext(ctx) + '\n' + GROUNDING_RULES + '\n\n' + catalog

  const ok = await generateOne(method, 'late', wikiContext)

  const key = methodKey(method)
  const { data: savedRow } = await supabase
    .from('method_setups')
    .select('setup, generated_at')
    .eq('method_key', key)
    .eq('tier', 'late')
    .single()

  return NextResponse.json({
    method_chosen: {
      id: method.id, method: method.method, skill: method.skill || method.skills_combined,
      coins_display: method.coins_display,
    },
    generation_ok: ok,
    priced_items_total: pricedItems.length,
    late_catalog_row_count: catalog.split('\n').filter(l => /^[A-Z0-9_]+ /.test(l)).length,
    late_catalog_top20: catalog.split('\n').slice(0, 21).join('\n'),
    generated_setup: savedRow ? JSON.parse(savedRow.setup) : null,
  })
}
