import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { email, username } = await req.json()
  const { error } = await supabase
    .from('subscriptions')
    .update({ username })
    .eq('email', email)
  return NextResponse.json({ success: !error })
}