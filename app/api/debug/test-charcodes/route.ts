// TEMP debug route -- dump the raw equipped_armor.chestplate item_name for
// Cucumber, char-by-char, to find the exact character causing the
// leading-space mismatch that trim() didn't catch. Deleted after use.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data } = await supabase
    .from('player_data')
    .select('equipped_armor')
    .eq('profile_id', 'b077f27a-60f7-46d9-be13-c4689a01dc3b')
    .single()

  const chestplate = data?.equipped_armor?.chestplate
  const name: string = chestplate?.item_name || ''
  const codes = Array.from(name).slice(0, 15).map(ch => ({ ch, code: ch.codePointAt(0) }))

  return NextResponse.json({ chestplate, name, length: name.length, firstChars: codes })
}
