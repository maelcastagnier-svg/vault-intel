// app/api/debug/delete-free-test-account/route.ts
// TEMPORAIRE -- supprime le compte jetable créé pour valider le Free tier
// dégradé. Supprimée après usage.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) return NextResponse.json({ error: listErr.message })

  const user = users.find(u => u.email === 'mael.castagnier+freetest@gmail.com')
  if (!user) return NextResponse.json({ message: 'Already gone' })

  const { error } = await supabase.auth.admin.deleteUser(user.id)
  return NextResponse.json({ success: !error, error: error?.message || null })
}
