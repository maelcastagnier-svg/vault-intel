import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const { priceId, email } = await req.json()

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email,
    success_url: `${req.headers.get('origin')}/dashboard?success=true`,
    cancel_url: `${req.headers.get('origin')}/#pricing`,
  })

  return NextResponse.json({ url: session.url })
}