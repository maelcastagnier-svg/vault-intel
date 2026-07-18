// components/PatchSection.tsx
// Section Patches — 2 colonnes Live | Alpha
// Visuel 100% React — Claude fournit uniquement du texte + JSON
'use client'
import { useState, useEffect } from 'react'

// ─── Types ───────────────────────────────────────────────────
type ItemAffected = {
  item_id:   string
  direction: 'up' | 'down' | 'neutral'
  reason:    string
  magnitude: 'LOW' | 'MED' | 'HIGH'
}

type MethodAffected = {
  method: string
  impact: 'buffed' | 'nerfed' | 'unchanged'
  reason: string
}

type PredictedItem = {
  item_id:             string
  predicted_change_pct:number
  timeframe_days:      number
  reasoning:           string
}

type PatchInsight = {
  id?:               number
  patch_title:       string
  patch_date?:       string
  patch_type:        'live' | 'alpha'
  direct_impact:     string
  items_affected:    ItemAffected[]
  methods_affected:  MethodAffected[]
  price_prediction:  string
  predicted_items:   PredictedItem[]
  action_signal:     string
  confidence:        string
  accuracy_score?:   number
  status?:           string
}

// ─── Config ──────────────────────────────────────────────────
const SIGNAL_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  BUY:    { color: '#1baf7a', bg: '#1baf7a15', label: '📈 BUY'    },
  SELL:   { color: '#e34948', bg: '#e3494815', label: '📉 SELL'   },
  HOLD:   { color: '#c9a84c', bg: '#c9a84c15', label: '⏸ HOLD'   },
  WATCH:  { color: '#2a78d6', bg: '#2a78d615', label: '👁 WATCH'  },
  INVEST: { color: '#9b59b6', bg: '#9b59b615', label: '💎 INVEST' },
}

const MAGNITUDE_COLORS: Record<string, string> = {
  HIGH: '#e34948', MED: '#c9a84c', LOW: '#1baf7a'
}

const CONF_COLORS: Record<string, string> = {
  HIGH: '#1baf7a', MED: '#c9a84c', LOW: '#e34948'
}

const IMPACT_COLORS: Record<string, string> = {
  buffed: '#1baf7a', nerfed: '#e34948', unchanged: '#4a4a45'
}

// ─── Atoms ───────────────────────────────────────────────────
function SignalBadge({ signal }: { signal: string }) {
  const cfg = SIGNAL_CONFIG[signal] || SIGNAL_CONFIG.HOLD
  return (
    <span style={{
      fontSize: 9.5, fontFamily: 'Space Mono, monospace', fontWeight: 700,
      padding: '2px 8px', borderRadius: 4,
      color: cfg.color, background: cfg.bg,
      border: '1px solid ' + cfg.color + '30',
      whiteSpace: 'nowrap'
    }}>{cfg.label}</span>
  )
}

function ConfBadge({ conf }: { conf: string }) {
  const color = CONF_COLORS[conf] || '#c9a84c'
  return (
    <span style={{
      fontSize: 8.5, fontFamily: 'Space Mono, monospace', fontWeight: 700,
      padding: '1px 6px', borderRadius: 3,
      color, background: color + '12', border: '1px solid ' + color + '25'
    }}>{conf}</span>
  )
}

// ─── Deep Dive Modal ─────────────────────────────────────────
function DeepDiveModal({ patch, onClose }: { patch: PatchInsight; onClose: () => void }) {
  const signal = SIGNAL_CONFIG[patch.action_signal] || SIGNAL_CONFIG.HOLD

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(8px)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#0f0f0e', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, maxWidth: 540, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 40px 80px rgba(0,0,0,0.8)' }}
      >
        {/* Header */}
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', top: 0, background: '#0f0f0e', zIndex: 1, borderRadius: '16px 16px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div>
              <div style={{ fontSize: 8.5, color: patch.patch_type === 'alpha' ? '#eda100' : '#1baf7a', fontFamily: 'Space Mono, monospace', letterSpacing: '0.12em', marginBottom: 6 }}>
                {patch.patch_type === 'alpha' ? '⚡ ALPHA PREVIEW' : '✅ LIVE PATCH'}
                {patch.patch_date && <span style={{ color: '#3a3a38', marginLeft: 8 }}>{patch.patch_date}</span>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f0d68a', lineHeight: 1.3 }}>{patch.patch_title}</div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b6960', cursor: 'pointer', borderRadius: 8, padding: '5px 9px', fontSize: 12, flexShrink: 0 }}>✕</button>
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <SignalBadge signal={patch.action_signal} />
            <ConfBadge conf={patch.confidence} />
            {patch.accuracy_score !== undefined && (
              <span style={{ fontSize: 9, fontFamily: 'Space Mono, monospace', color: '#9b9b8f', padding: '2px 7px', background: 'rgba(255,255,255,0.04)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.07)' }}>
                Accuracy: {patch.accuracy_score}%
              </span>
            )}
          </div>
        </div>

        <div style={{ padding: '4px 22px 22px' }}>

          {/* Direct impact */}
          {patch.direct_impact && (
            <div style={{ padding: '13px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ fontSize: 9, color: '#c9a84c', fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em', marginBottom: 7 }}>🎯 DIRECT IMPACT</div>
              <div style={{ fontSize: 12.5, color: '#cac8c0', lineHeight: 1.65 }}>{patch.direct_impact}</div>
            </div>
          )}

          {/* Items affected */}
          {patch.items_affected?.length > 0 && (
            <div style={{ padding: '13px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ fontSize: 9, color: '#c9a84c', fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em', marginBottom: 10 }}>📦 ITEMS AFFECTED</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {patch.items_affected.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 10px', background: '#111110', borderRadius: 7, border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{item.direction === 'up' ? '📈' : item.direction === 'down' ? '📉' : '➡️'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: '#e8e6df', fontFamily: 'Space Mono, monospace' }}>{item.item_id}</span>
                        <span style={{ fontSize: 8, color: MAGNITUDE_COLORS[item.magnitude], background: MAGNITUDE_COLORS[item.magnitude] + '15', padding: '1px 5px', borderRadius: 3, fontFamily: 'Space Mono, monospace' }}>{item.magnitude}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: '#6b6960', lineHeight: 1.5 }}>{item.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Methods affected */}
          {patch.methods_affected?.length > 0 && (
            <div style={{ padding: '13px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ fontSize: 9, color: '#c9a84c', fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em', marginBottom: 10 }}>⚔️ METHODS AFFECTED</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {patch.methods_affected.map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: '#111110', borderRadius: 6 }}>
                    <span style={{ fontSize: 9, fontFamily: 'Space Mono, monospace', fontWeight: 700, color: IMPACT_COLORS[m.impact], background: IMPACT_COLORS[m.impact] + '15', padding: '2px 6px', borderRadius: 3, flexShrink: 0, marginTop: 1 }}>
                      {m.impact.toUpperCase()}
                    </span>
                    <div>
                      <div style={{ fontSize: 10.5, color: '#e8e6df', fontWeight: 500, marginBottom: 2 }}>{m.method}</div>
                      <div style={{ fontSize: 10, color: '#6b6960' }}>{m.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Predicted items */}
          {patch.predicted_items?.length > 0 && (
            <div style={{ padding: '13px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ fontSize: 9, color: '#c9a84c', fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em', marginBottom: 10 }}>🔮 PRICE PREDICTIONS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {patch.predicted_items.map((p, i) => {
                  const positive = p.predicted_change_pct >= 0
                  const color    = positive ? '#1baf7a' : '#e34948'
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#111110', borderRadius: 7 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10.5, fontFamily: 'Space Mono, monospace', color: '#e8e6df', fontWeight: 600 }}>{p.item_id}</div>
                        <div style={{ fontSize: 9.5, color: '#4a4a45', marginTop: 2 }}>{p.reasoning}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'Space Mono, monospace' }}>
                          {positive ? '+' : ''}{p.predicted_change_pct}%
                        </div>
                        <div style={{ fontSize: 8.5, color: '#4a4a45', fontFamily: 'Space Mono, monospace' }}>in {p.timeframe_days}d</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Price prediction text */}
          {patch.price_prediction && (
            <div style={{ padding: '13px 0' }}>
              <div style={{ fontSize: 9, color: '#c9a84c', fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em', marginBottom: 7 }}>📊 VAULT ANALYSIS</div>
              <div style={{ fontSize: 12, color: '#cac8c0', lineHeight: 1.7 }}>{patch.price_prediction}</div>
            </div>
          )}

          <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, fontSize: 9.5, color: '#3a3a38', fontFamily: 'Space Mono, monospace' }}>
            Vault validates predictions automatically against live prices every 24h.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Patch Card ───────────────────────────────────────────────
function PatchCard({ patch, isAlpha }: { patch: PatchInsight; isAlpha: boolean }) {
  const [showDeepDive, setShowDeepDive] = useState(false)
  const accentColor = isAlpha ? '#eda100' : '#1baf7a'
  const signal      = SIGNAL_CONFIG[patch.action_signal] || SIGNAL_CONFIG.HOLD
  const topItems    = (patch.items_affected || []).slice(0, 3)

  return (
    <>
      <div style={{
        background: '#111110',
        border: `1px solid ${accentColor}18`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 8, padding: '13px 15px', marginBottom: 8
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#e8e6df', lineHeight: 1.3, marginBottom: 4 }}>
              {patch.patch_title}
            </div>
            {patch.patch_date && (
              <div style={{ fontSize: 9, color: '#3a3a38', fontFamily: 'Space Mono, monospace' }}>{patch.patch_date}</div>
            )}
          </div>
          <SignalBadge signal={patch.action_signal} />
        </div>

        {/* Impact */}
        {patch.direct_impact && (
          <div style={{ fontSize: 11, color: '#8b8980', lineHeight: 1.55, marginBottom: 10 }}>
            {patch.direct_impact.slice(0, 140)}{patch.direct_impact.length > 140 ? '...' : ''}
          </div>
        )}

        {/* Items affectés (preview) */}
        {topItems.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {topItems.map((item, i) => (
              <span key={i} style={{
                fontSize: 9, fontFamily: 'Space Mono, monospace', padding: '2px 7px', borderRadius: 4,
                color: item.direction === 'up' ? '#1baf7a' : item.direction === 'down' ? '#e34948' : '#6b6960',
                background: item.direction === 'up' ? '#1baf7a12' : item.direction === 'down' ? '#e3494812' : '#6b696012',
                border: `1px solid ${item.direction === 'up' ? '#1baf7a' : item.direction === 'down' ? '#e34948' : '#6b6960'}22`
              }}>
                {item.direction === 'up' ? '↑' : item.direction === 'down' ? '↓' : '→'} {item.item_id}
              </span>
            ))}
            {patch.items_affected?.length > 3 && (
              <span style={{ fontSize: 9, color: '#3a3a38', fontFamily: 'Space Mono, monospace', padding: '2px 7px' }}>
                +{patch.items_affected.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <ConfBadge conf={patch.confidence} />
          <button
            onClick={() => setShowDeepDive(true)}
            style={{
              background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.18)',
              color: '#c9a84c', fontSize: 9.5, fontFamily: 'Space Mono, monospace',
              padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontWeight: 700
            }}
          >DEEP DIVE →</button>
        </div>
      </div>

      {showDeepDive && <DeepDiveModal patch={patch} onClose={() => setShowDeepDive(false)} />}
    </>
  )
}

// ─── Main Section ─────────────────────────────────────────────
export default function PatchSection({ marketData, dataLoading }: {
  marketData: Record<string, string>; dataLoading: boolean
}) {
  const [insights, setInsights] = useState<PatchInsight[]>([])
  const [loadingInsights, setLoadingInsights] = useState(true)

  // Charge les insights depuis Supabase
  useEffect(() => {
    async function loadInsights() {
      try {
        const res  = await fetch('/api/patch-insights')
        const data = await res.json()
        setInsights(Array.isArray(data) ? data : [])
      } catch {}
      setLoadingInsights(false)
    }
    loadInsights()
  }, [])

  // Fallback: parse depuis claude_analysis si pas d'insights en DB
  let livePatches:  PatchInsight[] = []
  let alphaPatches: PatchInsight[] = []

  if (insights.length > 0) {
    livePatches  = insights.filter(i => i.patch_type === 'live')
    alphaPatches = insights.filter(i => i.patch_type === 'alpha')
  } else {
    try {
      const raw = marketData['patch_analysis'] || ''
      if (raw) {
        const parsed = JSON.parse(raw)
        livePatches  = parsed.live_patches  || []
        alphaPatches = parsed.alpha_patches || []
      }
    } catch {}
  }

  const loading = dataLoading || loadingInsights

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

      {/* LIVE PATCHES */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1baf7a', display: 'inline-block', boxShadow: '0 0 6px #1baf7a' }} />
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: '#1baf7a', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Live Patches</span>
        </div>

        {loading ? (
          <div style={{ color: '#2a2a28', fontSize: 10.5, textAlign: 'center', padding: '3rem', fontFamily: 'Space Mono, monospace' }}>
            LOADING...
          </div>
        ) : livePatches.length > 0 ? (
          livePatches.map((p, i) => <PatchCard key={i} patch={p} isAlpha={false} />)
        ) : (
          <div style={{ padding: '20px', background: '#111110', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#3a3a38', fontFamily: 'Space Mono, monospace' }}>No live patches analyzed yet</div>
          </div>
        )}
      </div>

      {/* ALPHA PATCHES */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#eda100', display: 'inline-block', boxShadow: '0 0 6px #eda100' }} />
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: '#eda100', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Alpha Preview</span>
        </div>

        {loading ? (
          <div style={{ color: '#2a2a28', fontSize: 10.5, textAlign: 'center', padding: '3rem', fontFamily: 'Space Mono, monospace' }}>
            LOADING...
          </div>
        ) : alphaPatches.length > 0 ? (
          alphaPatches.map((p, i) => <PatchCard key={i} patch={p} isAlpha={true} />)
        ) : (
          <div style={{ padding: '20px', background: '#111110', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#3a3a38', fontFamily: 'Space Mono, monospace' }}>No alpha patches detected</div>
          </div>
        )}
      </div>

    </div>
  )
}