import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const sections = [
    'flash_alerts', 'ah_sniper', 'patch_analysis', 'radar',
    'money_making_early', 'money_making_mid',
    'money_making_end', 'money_making_late'
  ]
  const result: Record<string, string> = {}
  for (const section of sections) {
    const { data } = await supabase
      .from('claude_analysis')
      .select('content')
      .eq('section', section)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    result[section] = data?.content || ''
  }
  return NextResponse.json(result)
}