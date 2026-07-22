// app/api/login/route.ts
// POST { identifier, password } — identifier = email ou username Vault.
// Resout username -> email cote serveur uniquement (jamais renvoye au client), puis
// authentifie via un client Supabase lie aux cookies de la reponse (pose la session
// directement, pas besoin que le client refasse l'appel avec l'email resolu).
// Erreur volontairement generique (pas de distinction username-inconnu vs mot-de-passe-faux)
// pour ne pas laisser fuiter l'existence d'un compte.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerSupabaseClient } from '../../../lib/supabase-server'

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const INVALID = () => NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

export async function POST(req: NextRequest) {
  const { identifier, password } = await req.json()
  if (!identifier || !password) return INVALID()

  let email = String(identifier)
  if (!email.includes('@')) {
    const { data } = await adminClient
      .from('subscriptions')
      .select('email')
      .eq('username', email)
      .single()
    if (!data?.email) return INVALID()
    email = data.email
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return INVALID()

  return NextResponse.json({ success: true })
}
