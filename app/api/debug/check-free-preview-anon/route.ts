// app/api/debug/check-free-preview-anon/route.ts
// TEMPORAIRE -- vérifie que les vues sont vraiment lisibles avec la clé ANON
// (celle que le frontend utilise réellement), pas seulement en service-role.
// Supprimée après vérification.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data: ahPreview, error: ahErr } = await supabaseAnon.from('ah_live_free_preview').select('*')
  const { data: bazaarPreview, error: bazaarErr } = await supabaseAnon.from('bazaar_1h_free_preview').select('*')
  // Contrôle : vérifie que ah_live/bazaar_1h réels restent bien bloqués pour anon
  const { data: realAh, error: realAhErr } = await supabaseAnon.from('ah_live').select('*').limit(1)

  return NextResponse.json({
    ah_live_free_preview: { error: ahErr?.message || null, count: ahPreview?.length || 0 },
    bazaar_1h_free_preview: { error: bazaarErr?.message || null, count: bazaarPreview?.length || 0 },
    real_ah_live_blocked_check: { error: realAhErr?.message || null, rows_returned: realAh?.length || 0 },
  })
}
