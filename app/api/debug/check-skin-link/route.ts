// app/api/debug/check-skin-link/route.ts
// TEMPORAIRE -- vérifie l'état réel de hypixel_account_links (quel compte
// Vault est lié à quel compte Hypixel) pour écarter le doute "Steve = bug"
// vs "Steve = compte de test pas lié". Supprimée après vérification.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data: links, error } = await supabase
    .from('hypixel_account_links')
    .select('user_id, hypixel_uuid, hypixel_username')

  if (error) return NextResponse.json({ error: error.message })

  const results = []
  for (const link of links || []) {
    const { data: userRes } = await supabase.auth.admin.getUserById(link.user_id)
    const email = userRes?.user?.email || null
    let plan: string | null = null
    if (email) {
      const { data: sub } = await supabase.from('subscriptions').select('plan, status').eq('email', email).maybeSingle()
      plan = sub ? `${sub.plan}/${sub.status}` : null
    }
    results.push({
      user_id: link.user_id,
      email,
      plan,
      hypixel_username: link.hypixel_username,
      hypixel_uuid: link.hypixel_uuid,
      skin_url: `https://crafatar.com/skins/${link.hypixel_uuid}`,
    })
  }

  return NextResponse.json({ total_links: links?.length || 0, results })
}
