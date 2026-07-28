// app/api/debug/create-free-test-account/route.ts
// TEMPORAIRE -- crée un compte Vault jetable sans aucune ligne subscriptions
// (donc plan='free' par construction, voir lib/get-plan.ts) pour vérifier
// visuellement le tab Flash Alerts / Patch Analysis dégradé en vrai
// navigateur. Supprimé après le test (route + compte).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TEST_EMAIL = 'mael.castagnier+freetest@gmail.com'
const TEST_PASSWORD = 'VaultFreeTest2026!'

export async function GET() {
  const { data, error } = await supabase.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (error) return NextResponse.json({ error: error.message })

  return NextResponse.json({
    success: true,
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    user_id: data.user?.id,
    note: 'Aucune ligne subscriptions créée -- plan résout automatiquement à free (lib/get-plan.ts)',
  })
}
