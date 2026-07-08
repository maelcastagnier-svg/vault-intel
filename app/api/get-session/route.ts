import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-06-24.dahlia',
})

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!sessionId) return NextResponse.json({ email: '' })
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    return NextResponse.json({ email: session.customer_details?.email || '' })
  } catch {
    return NextResponse.json({ email: '' })
  }
}