import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runPatchAnalysisAgent } from '../../cron/patch-analysis-agent/route'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const result = await runPatchAnalysisAgent()

  // Relit ce qui vient réellement d'être écrit pour confirmer que les nouveaux
  // champs se remplissent (pas juste que l'upsert n'a pas erroré).
  const { data: rows } = await supabase
    .from('insight_patch')
    .select('patch_title, patch_type, mechanics_impact, gameplay_changes')
    .order('updated_at', { ascending: false })
    .limit(8)

  // Diagnostic pour alpha_count:0 -- distingue "rien à analyser" de "parse cassé"
  const { data: alphaSource } = await supabase
    .from('patch_notes')
    .select('title, published_at')
    .eq('is_alpha', true)
    .order('published_at', { ascending: false })
    .limit(3)

  return NextResponse.json({
    run_result: result,
    saved_rows: rows,
    rows_with_mechanics: (rows || []).filter(r => r.mechanics_impact).length,
    rows_with_gameplay_changes: (rows || []).filter(r => Array.isArray(r.gameplay_changes) && r.gameplay_changes.length > 0).length,
    _debug_alpha_source_available: alphaSource,
  })
}
