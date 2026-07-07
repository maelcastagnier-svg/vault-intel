import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-06-24.dahlia',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLAN_MAP: Record<string, string> = {
  'price_1TqY7aBngq0kxKkEbZqcwFZu': 'alert',
  'price_1TqY7mBngq0kxKkE2SBQjygJ': 'pro',
  'price_1TqY86Bngq0kxKkEdD00nNtx': 'elite',
}


export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const email = session.customer_details?.email || session.customer_email
    const customerId = session.customer as string
    const subscriptionId = session.subscription as string

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id)
    const priceId = lineItems.data[0]?.price?.id || ''
    const plan = PLAN_MAP[priceId] || 'alert'

    if (email) {
      await supabase.from('subscriptions').upsert({
        email,
        plan,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status: 'active',
      }, { onConflict: 'email' })
    }
  }

  return NextResponse.json({ received: true })
}