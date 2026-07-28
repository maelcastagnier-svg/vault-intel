// app/api/patch-insights/route.ts
// Gate par plan ajoute le 23 juillet (voir lib/get-plan.ts) — Free : titre + impact 1
// phrase, patches Live uniquement. Alert+ : contenu complet, Live + Alpha.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserPlan } from '../../../lib/get-plan'
import { filterPatchInsight } from '../../../lib/gate-content'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { plan } = await getUserPlan()

    const { data, error } = await supabase
      .from('insight_patch')
      .select('*')
      .in('status', ['active', null])
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) return NextResponse.json([], { status: 200 })

    // Normalise patch_type depuis is_alpha si manquant
    const normalized = (data || []).map(p => ({
      ...p,
      patch_type: p.patch_type || (p.is_alpha ? 'alpha' : 'live'),
      items_affected: Array.isArray(p.items_affected) ? p.items_affected : [],
      methods_affected: Array.isArray(p.methods_affected) ? p.methods_affected : [],
      predicted_items: Array.isArray(p.predicted_items) ? p.predicted_items : [],
      gameplay_changes: Array.isArray(p.gameplay_changes) ? p.gameplay_changes : [],
    }))

    const gated = normalized.map(p => filterPatchInsight(p, plan)).filter(Boolean)

    return NextResponse.json(gated)
  } catch {
    return NextResponse.json([])
  }
}