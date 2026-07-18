// app/api/method/vote/route.ts
// POST → soumet un vote + commentaire optionnel
// GET  → récupère le feedback agrégé pour une méthode
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/method/vote
export async function POST(req: NextRequest) {
  try {
    const { method_id, tier, vote, comment } = await req.json()

    if (!method_id || !tier || !['works', 'doesnt_work'].includes(vote)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { error } = await supabase.from('method_feedback').insert({
      method_id,
      tier,
      vote,
      comment: comment?.trim().slice(0, 500) || null,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET /api/method/vote?method_id=X&tier=Y
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const method_id = searchParams.get('method_id')
    const tier      = searchParams.get('tier')

    if (!method_id || !tier) {
      return NextResponse.json({ error: 'method_id and tier required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('method_feedback_summary')
      .select('*')
      .eq('method_id', method_id)
      .eq('tier', tier)
      .single()

    if (error || !data) {
      return NextResponse.json({ positive: 0, negative: 0, total: 0, approval_pct: null })
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}