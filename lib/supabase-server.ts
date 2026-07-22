// lib/supabase-server.ts
// Client Supabase lié aux cookies de la requête — pour les Route Handlers qui doivent
// lire ou poser une session réelle (auth.getUser(), signInWithPassword) plutôt que
// contourner RLS avec le service role et faire confiance à un paramètre client.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
}
