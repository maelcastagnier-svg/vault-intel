import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerSupabaseClient } from '../../../lib/supabase-server'

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // Ignore tout email fourni par le client — ne renvoie jamais que l'abonnement de la
  // session authentifiee reelle, jamais celui d'un email arbitraire passe en parametre.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ plan: 'free', username: '' }, { status: 401 })
  }

  const { data, error } = await adminClient
    .from('subscriptions')
    .select('plan, username')
    .eq('email', user.email)
    .single()

  if (error) {
    return NextResponse.json({ plan: 'free', username: '', debug_error: error.message })
  }

  return NextResponse.json(data || { plan: 'free', username: '' })
}