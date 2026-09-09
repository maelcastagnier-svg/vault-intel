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

// Corrigé le 9 sept -- ces 3 priceId n'existaient PAS dans le compte Stripe
// live (vérifié directement via l'API Stripe : "No such price" sur les 3),
// probablement un reliquat d'un compte/mode Stripe antérieur. Résultat réel :
// tout checkout.session.completed retombait sur le plan 'alert' par défaut
// (ligne "|| 'alert'" plus bas) quel que soit le plan réellement acheté et
// payé -- bug critique d'intégrité revenu, jamais déclenché par un vrai client
// (aucune ligne `subscriptions` ne provient d'un checkout live réel à ce jour,
// vérifié). Ces 3 valeurs sont désormais les vrais priceId actifs du compte
// Stripe live (mêmes valeurs que `PRICES` dans app/hypixel-skyblock/page.tsx,
// vérifiées via GET /v1/prices/:id -- Vault Alert 4.99€, Vault Pro 19.99€,
// Vault Elite 39.99€, tous `active:true`).
const PLAN_MAP: Record<string, string> = {
  'price_1TqXC5BmtpUo4AHWVzbSPY0e': 'alert',
  'price_1TxkeXBmtpUo4AHWAlz7jGFt': 'pro',
  'price_1TxkeXBmtpUo4AHW48EymVji': 'elite',
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

  // Ajoutes le 17 aout (audit V1) -- avant ce fix, seul checkout.session.completed
  // etait gere : un echec de renouvellement ou une annulation faite depuis le
  // dashboard Stripe (au lieu du bouton de l'app) ne redescendait jamais le
  // statut/plan dans `subscriptions`, laissant un client en 'active' indefiniment.
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    const priceId = sub.items.data[0]?.price?.id || ''
    const plan = PLAN_MAP[priceId]
    const status = event.type === 'customer.subscription.deleted' || sub.status === 'canceled'
      ? 'canceled'
      : (sub.status === 'active' || sub.status === 'trialing') ? 'active' : 'past_due'

    const update: Record<string, string> = { status }
    if (plan) update.plan = plan // ne touche jamais au plan si le price_id est inconnu (evite d'ecraser silencieusement)

    await supabase.from('subscriptions')
      .update(update)
      .eq('stripe_subscription_id', sub.id)
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const subscriptionId = (invoice as any).subscription as string | null
    if (subscriptionId) {
      await supabase.from('subscriptions')
        .update({ status: 'past_due' })
        .eq('stripe_subscription_id', subscriptionId)
    }
  }

  return NextResponse.json({ received: true })
}