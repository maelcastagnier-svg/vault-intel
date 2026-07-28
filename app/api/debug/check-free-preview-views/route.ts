// app/api/debug/check-free-preview-views/route.ts
// TEMPORAIRE -- vérifie le vrai schéma des vues ah_live_free_preview /
// bazaar_1h_free_preview avant de les brancher côté frontend (colonnes
// réelles, présence de category, nombre de lignes réel). Supprimée après
// vérification.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data: ahPreview, error: ahErr } = await supabase.from('ah_live_free_preview').select('*')
  const { data: bazaarPreview, error: bazaarErr } = await supabase.from('bazaar_1h_free_preview').select('*')

  return NextResponse.json({
    ah_live_free_preview: { error: ahErr?.message || null, count: ahPreview?.length || 0, rows: ahPreview },
    bazaar_1h_free_preview: { error: bazaarErr?.message || null, count: bazaarPreview?.length || 0, rows: bazaarPreview },
  })
}
