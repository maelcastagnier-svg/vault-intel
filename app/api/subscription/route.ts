import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, username')
    .eq('email', email)
    .single()
  
  if (error) {
    return NextResponse.json({ plan: 'free', username: '', debug_error: error.message })
  }
  
  return NextResponse.json(data || { plan: 'free', username: '' })
}