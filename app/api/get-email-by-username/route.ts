import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { username } = await req.json()
  const { data } = await supabase
    .from('subscriptions')
    .select('email')
    .eq('username', username)
    .single()
  return NextResponse.json({ email: data?.email || '' })
}