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
    // Ignore tout email fourni par le client — n'agit jamais que sur le compte de la
    // session authentifiee reelle, jamais sur un parametre.
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    const email = user.email

    const { data: sub } = await adminClient
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('email', email)
      .single()

    if (!sub?.stripe_subscription_id) {
      return NextResponse.json({ success: false, error: 'No subscription found' })
    }

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true
    })

    await adminClient
      .from('subscriptions')
      .update({ status: 'canceled' })
      .eq('email', email)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message })
  }
}