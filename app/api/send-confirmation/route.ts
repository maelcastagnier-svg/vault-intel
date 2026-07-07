import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { email, username } = await req.json()

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Vault Intelligence <onboarding@resend.dev>',
        to: email,
        subject: 'Welcome to Vault — Your account is ready',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;margin:0;padding:40px 20px;font-family:Helvetica Neue,sans-serif;">
  <div style="max-width:500px;margin:0 auto;">
    <div style="font-family:monospace;font-size:1.1rem;font-weight:700;color:#c9a84c;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:2rem;">VAULT.</div>
    <div style="background:#111110;border:1px solid rgba(201,168,76,0.2);border-radius:12px;padding:2rem;">
      <h1 style="color:#f5f4f0;font-size:1.3rem;margin:0 0 0.75rem;">Welcome to the club, ${username}.</h1>
      <p style="color:#6b6960;font-size:0.9rem;line-height:1.6;margin:0 0 1.5rem;">
        Your Vault account is active. You now have access to the most advanced Hypixel Skyblock economy intelligence platform.
      </p>
      <a href="https://vault-intel-iota.vercel.app/login" style="display:block;background:#c9a84c;color:#0a0a0a;text-decoration:none;text-align:center;padding:0.9rem 2rem;border-radius:6px;font-weight:700;font-size:0.95rem;">
        Access my dashboard →
      </a>
      <hr style="border:none;border-top:1px solid rgba(201,168,76,0.15);margin:1.5rem 0;">
      <p style="color:#6b6960;font-size:0.8rem;margin:0;">
        If you didn't create a Vault account, you can safely ignore this email.
      </p>
    </div>
    <div style="text-align:center;font-size:0.75rem;color:#6b6960;margin-top:2rem;">
      © 2026 Vault Intelligence — Not affiliated with Hypixel or Mojang.
    </div>
  </div>
</body>
</html>`
      })
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ success: false, error: data })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message })
  }
}