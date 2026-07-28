import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const TEST_EMAIL = 'mael.castagnier+radartest@gmail.com'

export async function GET() {
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) return NextResponse.json({ success: false, step: 'listUsers', error: listErr.message }, { status: 500 })

  const user = list.users.find(u => u.email === TEST_EMAIL)
  if (!user) return NextResponse.json({ success: false, error: 'test user not found (already deleted?)' }, { status: 404 })

  const { error: delErr } = await supabase.auth.admin.deleteUser(user.id)
  if (delErr) return NextResponse.json({ success: false, step: 'deleteUser', error: delErr.message }, { status: 500 })

  const { error: subErr } = await supabase.from('subscriptions').delete().eq('email', TEST_EMAIL)

  return NextResponse.json({ success: true, error: subErr?.message || null })
}
