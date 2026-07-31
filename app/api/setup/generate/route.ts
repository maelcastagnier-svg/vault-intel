// app/api/setup/generate/route.ts
// Lecture DB uniquement — JAMAIS d'appel Claude
// Le setup est pré-généré par setup-generate-agent (lundi 7h)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePlan } from '../../../../lib/get-plan'
import { SLAYER_BUG_CONTAMINATED_METHOD_IDS } from '../../../../lib/money-making-constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function methodKey(method: any): string {
  return (method.id || method.method || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80)
}

export async function POST(req: NextRequest) {
  // Sous-feature de Money Making, reserve Pro+.
  const gate = await requirePlan('pro')
  if (!gate.ok) return gate.response

  try {
    const { method, tier } = await req.json()
    if (!method || !tier) {
      return NextResponse.json({ error: 'method and tier required' }, { status: 400 })
    }

    const key = methodKey(method)

    // Défense en profondeur — ces 3 setups (voir CLAUDE.md) sont générés sur la base du
    // bug Slayer Blaze/Spider inversé. Déjà exclus de la liste servie par /api/market-data,
    // mais un client ne devrait de toute façon jamais pouvoir en récupérer le setup.
    if (SLAYER_BUG_CONTAMINATED_METHOD_IDS.has(key)) {
      return NextResponse.json({ not_ready: true })
    }

    const { data } = await supabase
      .from('method_setups')
      .select('setup')
      .eq('method_key', key)
      .eq('tier', tier)
      .single()

    if (!data?.setup) {
      return NextResponse.json({ not_ready: true })
    }

    return NextResponse.json({ setup: JSON.parse(data.setup) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}