export default function ConfirmEmail() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; color: #e8e6df; font-family: 'Space Grotesk', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: #111110; border: 1px solid rgba(201,168,76,0.18); border-radius: 12px; padding: 2.5rem; width: 100%; max-width: 420px; margin: 2rem; text-align: center; }
        .logo { font-family: 'Space Mono', monospace; font-size: 1.1rem; font-weight: 700; color: #c9a84c; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 2rem; }
        .icon { font-size: 3rem; margin-bottom: 1.5rem; }
        h1 { font-size: 1.4rem; font-weight: 700; color: #e8e6df; margin-bottom: 0.75rem; }
        .subtitle { font-size: 0.9rem; color: #6b6960; line-height: 1.6; margin-bottom: 2rem; }
        .subtitle strong { color: #e8e6df; }
        .steps { background: rgba(201,168,76,0.05); border: 1px solid rgba(201,168,76,0.15); border-radius: 8px; padding: 1.25rem; margin-bottom: 2rem; text-align: left; }
        .step { display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.5rem 0; font-size: 0.85rem; color: #6b6960; }
        .step-num { font-family: 'Space Mono', monospace; font-size: 0.7rem; color: #c9a84c; background: rgba(201,168,76,0.15); width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
        .btn-gold { display: block; width: 100%; background: #c9a84c; color: #0a0a0a; border: none; border-radius: 6px; padding: 0.85rem; font-size: 0.95rem; font-weight: 700; cursor: pointer; font-family: 'Space Grotesk', sans-serif; text-decoration: none; margin-bottom: 0.75rem; }
        .note { font-size: 0.75rem; color: #6b6960; line-height: 1.5; }
        .note a { color: #c9a84c; text-decoration: none; }
      `}</style>
      <div className="card">
        <div className="logo">VAULT.</div>
        <div className="icon">✉️</div>
        <h1>Check your email</h1>
        <p className="subtitle">
          We sent a confirmation link to your email address.<br />
          Click it to <strong>activate your Vault account</strong>.
        </p>
        <div className="steps">
          <div className="step"><span className="step-num">1</span><span>Open your email inbox</span></div>
          <div className="step"><span className="step-num">2</span><span>Find the email from Vault</span></div>
          <div className="step"><span className="step-num">3</span><span>Click the confirmation link</span></div>
          <div className="step"><span className="step-num">4</span><span>Sign in and access your dashboard</span></div>
        </div>
        <a href="/login" className="btn-gold">Go to sign in</a>
        <p className="note">
          No email? Check your spam folder.<br />
          Still nothing? <a href="mailto:support@vault-intel.gg">Contact support</a>
        </p>
      </div>
    </>
  )
}