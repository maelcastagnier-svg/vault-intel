import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerSupabaseClient } from '../../../lib/supabase-server'

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // Ignore l'email fourni par le client — ne renomme jamais que le compte de la
  // session authentifiee reelle, jamais un email arbitraire passe en parametre.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }

  const { username } = await req.json()
  if (!username || typeof username !== 'string' || username.length < 3 || username.length > 20) {
    return NextResponse.json({ success: false, error: 'Invalid username' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('subscriptions')
    .update({ username })
    .eq('email', user.email)
  return NextResponse.json({ success: !error })
}