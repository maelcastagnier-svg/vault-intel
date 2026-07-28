import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const TEST_EMAIL = 'mael.castagnier+radartest@gmail.com'
const TEST_PASSWORD = 'VaultRadarTest2026!'

export async function GET() {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (createErr) return NextResponse.json({ success: false, step: 'createUser', error: createErr.message }, { status: 500 })

  const { error: subErr } = await supabase.from('subscriptions').insert({
    email: TEST_EMAIL,
    username: 'radartest',
    plan: 'elite',
    status: 'active',
  })
  if (subErr) return NextResponse.json({ success: false, step: 'subscriptions insert', error: subErr.message }, { status: 500 })

  return NextResponse.json({ success: true, email: TEST_EMAIL, user_id: created.user?.id })
}
