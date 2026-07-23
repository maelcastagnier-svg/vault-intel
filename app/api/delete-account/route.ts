// app/api/delete-account/route.ts
// Suppression reelle et complete du compte — jamais un email fourni par le client,
// uniquement la session authentifiee reelle (meme principe que cancel-subscription/
// update-username). Action irreversible : annule l'abonnement Stripe actif immediatement
// (pas cancel_at_period_end, le compte n'existera plus), supprime player_data,
// hypixel_account_links, subscriptions, player_skill_cards, player_missions et
// player_progress, puis le compte Supabase Auth lui-meme en dernier.
//
// Ordre verifie via pg_constraint : player_data et subscriptions referencent
// auth.users(id) SANS ON DELETE CASCADE (RESTRICT) — doivent etre supprimes avant le
// compte Auth. hypixel_account_links a bien ON DELETE CASCADE mais est supprime
// explicitement quand meme, par clarte. player_skill_cards/player_missions/
// player_progress n'ont AUCUNE contrainte FK (verifie, zero ligne dans pg_constraint
// pour ces 3 tables) — elles ne se rattachent qu'a hypixel_uuid, jamais a user_id.
// Consequence : hypixel_uuid doit etre lu AVANT de supprimer hypixel_account_links,
// sinon la seule reference reliant ce user_id a son hypixel_uuid disparait et ces
// 3 tables deviennent impossibles a cibler pour ce compte.
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerSupabaseClient } from '../../../lib/supabase-server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-06-24.dahlia',
})

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    const { id: userId, email } = user

    // 1. Lit hypixel_uuid AVANT toute suppression — c'est la seule cle qui relie
    // player_skill_cards/player_missions/player_progress a ce compte, et elle
    // disparait des qu'on supprime hypixel_account_links.
    const { data: link } = await adminClient
      .from('hypixel_account_links')
      .select('hypixel_uuid')
      .eq('user_id', userId)
      .single()
    const hypixelUuid = link?.hypixel_uuid ?? null

    // 2. Annule l'abonnement Stripe actif immediatement, si il y en a un — ne bloque
    // jamais la suppression des donnees si Stripe echoue (l'utilisateur garde le droit
    // de supprimer son compte meme si l'appel Stripe rate).
    const { data: sub } = await adminClient
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('email', email)
      .single()

    let stripeCanceled = false
    if (sub?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id)
        stripeCanceled = true
      } catch (e: any) {
        console.error('Stripe cancel failed during account deletion:', e.message)
      }
    }

    // 3. Supprime les donnees applicatives, avant le compte Auth (player_data et
    // subscriptions n'ont pas de ON DELETE CASCADE vers auth.users — confirme via
    // pg_constraint). Les 3 tables par hypixel_uuid n'ont aucune FK, donc aucune
    // contrainte d'ordre entre elles, mais faites ici avant hypixel_account_links
    // par coherence logique (on vient d'en lire la valeur).
    await adminClient.from('player_data').delete().eq('user_id', userId)
    if (hypixelUuid) {
      await adminClient.from('player_skill_cards').delete().eq('hypixel_uuid', hypixelUuid)
      await adminClient.from('player_missions').delete().eq('hypixel_uuid', hypixelUuid)
      await adminClient.from('player_progress').delete().eq('hypixel_uuid', hypixelUuid)
    }
    await adminClient.from('hypixel_account_links').delete().eq('user_id', userId)
    await adminClient.from('subscriptions').delete().eq('email', email)

    // 4. Supprime le compte Supabase Auth lui-meme, en dernier.
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId)
    if (authError) throw authError

    return NextResponse.json({ success: true, stripe_canceled: stripeCanceled })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
