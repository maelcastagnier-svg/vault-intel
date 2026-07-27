// components/PatchSection.tsx
// Visuel 100% React — données fournies par Claude via DB
'use client'
import { useState, useEffect } from 'react'

type ItemAffected = {
  item_id: string; direction: 'up'|'down'|'neutral'
  reason: string; magnitude: 'LOW'|'MED'|'HIGH'
}
type MethodAffected = { method: string; impact: 'buffed'|'nerfed'|'unchanged'; reason: string }
type PredictedItem  = { item_id: string; predicted_change_pct: number; timeframe_days: number; reasoning: string }

type PatchInsight = {
  id?: number; patch_title: string; patch_date?: string
  patch_type: 'live'|'alpha'; is_alpha?: boolean; direct_impact: string
  items_affected: ItemAffected[]; methods_affected: MethodAffected[]
  price_prediction: string; predicted_items: PredictedItem[]
  action_signal: string; confidence: string
  accuracy_score?: number; status?: string
}

const SIGNAL: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
  BUY:    { color:'#1baf7a', bg:'#1baf7a0f', border:'#1baf7a25', icon:'📈', label:'BUY'    },
  SELL:   { color:'#e34948', bg:'#e349480f', border:'#e3494825', icon:'📉', label:'SELL'   },
  HOLD:   { color:'#c9a84c', bg:'#c9a84c0f', border:'#c9a84c25', icon:'⏸', label:'HOLD'   },
  WATCH:  { color:'#2a78d6', bg:'#2a78d60f', border:'#2a78d625', icon:'👁', label:'WATCH'  },
  INVEST: { color:'#9b59b6', bg:'#9b59b60f', border:'#9b59b625', icon:'💎', label:'INVEST' },
}

const MAG_COLOR: Record<string, string> = { HIGH:'#e34948', MED:'#c9a84c', LOW:'#1baf7a' }
const CONF_COLOR: Record<string, string> = { HIGH:'#1baf7a', MED:'#c9a84c', LOW:'#e34948' }
const IMP_COLOR: Record<string, string>  = { buffed:'#1baf7a', nerfed:'#e34948', unchanged:'#4a4a45' }

const s = (v: any) => (typeof v === 'string' ? v : '')
const a = (v: any) => (Array.isArray(v) ? v : [])

// ─── Signal Badge ─────────────────────────────────────────────
function SignalBadge({ signal, large = false }: { signal: string; large?: boolean }) {
  const cfg = SIGNAL[signal] || SIGNAL.HOLD
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: large ? 6 : 4,
      padding: large ? '6px 14px' : '3px 9px',
      borderRadius: large ? 8 : 5,
      background: cfg.bg, border: '1px solid ' + cfg.border, color: cfg.color,
      fontSize: large ? 12 : 9.5,
      fontFamily: 'Space Mono, monospace', fontWeight: 700,
      whiteSpace: 'nowrap'
    }}>
      <span style={{ fontSize: large ? 14 : 11 }}>{cfg.icon}</span>
      {cfg.label}
    </div>
  )
}

// ─── Conf Badge ───────────────────────────────────────────────
function ConfBadge({ conf }: { conf: string }) {
  const color = CONF_COLOR[conf] || '#c9a84c'
  return (
    <span style={{ fontSize:8.5, fontFamily:'Space Mono, monospace', fontWeight:700, padding:'2px 7px', borderRadius:4, color, background:color+'12', border:'1px solid '+color+'25' }}>
      {conf}
    </span>
  )
}

// ─── Deep Dive Modal ─────────────────────────────────────────
function DeepDiveModal({ patch, onClose }: { patch: PatchInsight; onClose: () => void }) {
  const isAlpha = patch.patch_type === 'alpha'
  const accentColor = isAlpha ? '#eda100' : '#1baf7a'
  const items   = a(patch.items_affected)
  const methods = a(patch.methods_affected)
  const predicted = a(patch.predicted_items)

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem', backdropFilter:'blur(10px)' }}>
      {/* Modals stay plain rectangular — the gem-tab point is a card-list identity
          marker, not something a transient action overlay (Deep Dive) should wear. */}
      <div onClick={e => e.stopPropagation()} className="vault-surface" style={{ border:'1px solid '+accentColor+'45', borderRadius:16, maxWidth:580, width:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 40px 100px rgba(0,0,0,0.9), 0 0 40px '+accentColor+'20' }}>

        {/* Header */}
        <div style={{ padding:'22px 24px 18px', borderBottom:'1px solid rgba(201,168,76,0.05)', position:'sticky', top:0, background:'#111110', zIndex:1, borderRadius:'16px 16px 0 0' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background:accentColor, display:'inline-block', boxShadow:'0 0 8px '+accentColor }} />
                <span style={{ fontSize:8.5, color:accentColor, fontFamily:'Space Mono, monospace', letterSpacing:'0.14em', textTransform:'uppercase', fontWeight:700 }}>
                  {isAlpha ? 'ALPHA PREVIEW' : 'LIVE PATCH'}
                  {s(patch.patch_date) && <span style={{ color:'#3a3a38', marginLeft:8, fontWeight:400 }}>{patch.patch_date}</span>}
                </span>
              </div>
              <div style={{ fontSize:16, fontWeight:700, color:'#f0d68a', lineHeight:1.3 }}>{s(patch.patch_title)}</div>
            </div>
            <button onClick={onClose} style={{ background:'rgba(201,168,76,0.04)', border:'1px solid rgba(201,168,76,0.08)', color:'#6b6960', cursor:'pointer', borderRadius:8, padding:'6px 10px', fontSize:13, flexShrink:0 }}>✕</button>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap', alignItems:'center' }}>
            <SignalBadge signal={patch.action_signal} large />
            <ConfBadge conf={patch.confidence} />
            {patch.accuracy_score !== undefined && (
              <span style={{ fontSize:9, fontFamily:'Space Mono, monospace', color:'#9b9b8f', padding:'2px 8px', background:'rgba(201,168,76,0.04)', borderRadius:5, border:'1px solid rgba(201,168,76,0.07)' }}>
                Accuracy: {patch.accuracy_score}%
              </span>
            )}
          </div>
        </div>

        <div style={{ padding:'6px 24px 24px' }}>

          {/* Direct Impact */}
          {s(patch.direct_impact) && (
            <div style={{ padding:'14px 0', borderBottom:'1px solid rgba(201,168,76,0.04)' }}>
              <div style={{ fontSize:9, color:accentColor, fontFamily:'Space Mono, monospace', letterSpacing:'0.12em', marginBottom:8, textTransform:'uppercase' }}>🎯 Economic Impact</div>
              <div style={{ fontSize:13, color:'#d8d6cf', lineHeight:1.7 }}>{s(patch.direct_impact)}</div>
            </div>
          )}

          {/* Items Affected */}
          {items.length > 0 && (
            <div style={{ padding:'14px 0', borderBottom:'1px solid rgba(201,168,76,0.04)' }}>
              <div style={{ fontSize:9, color:accentColor, fontFamily:'Space Mono, monospace', letterSpacing:'0.12em', marginBottom:10, textTransform:'uppercase' }}>📦 Items Affected</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {items.map((item: ItemAffected, i: number) => (
                  <div key={i} className="vault-surface" style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, border:`1px solid ${accentColor}25` }}>
                    <span style={{ fontSize:18, flexShrink:0 }}>{item.direction==='up'?'📈':item.direction==='down'?'📉':'➡️'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                        <span style={{ fontSize:11, fontWeight:700, color:'#e8e6df', fontFamily:'Space Mono, monospace' }}>{item.item_id}</span>
                        <span style={{ fontSize:8, padding:'1px 5px', borderRadius:3, color:MAG_COLOR[item.magnitude]||'#c9a84c', background:(MAG_COLOR[item.magnitude]||'#c9a84c')+'15', fontFamily:'Space Mono, monospace', fontWeight:700 }}>{item.magnitude}</span>
                      </div>
                      <div style={{ fontSize:11, color:'#6b6960', lineHeight:1.5 }}>{item.reason}</div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, color:item.direction==='up'?'#1baf7a':item.direction==='down'?'#e34948':'#4a4a45', flexShrink:0 }}>
                      {item.direction==='up'?'↑':item.direction==='down'?'↓':'→'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Methods Affected */}
          {methods.length > 0 && (
            <div style={{ padding:'14px 0', borderBottom:'1px solid rgba(201,168,76,0.04)' }}>
              <div style={{ fontSize:9, color:accentColor, fontFamily:'Space Mono, monospace', letterSpacing:'0.12em', marginBottom:10, textTransform:'uppercase' }}>⚔️ Methods Affected</div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {methods.map((m: MethodAffected, i: number) => (
                  <div key={i} className="vault-surface" style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 12px', borderRadius:7, border:`1px solid ${accentColor}25` }}>
                    <span style={{ fontSize:9, fontFamily:'Space Mono, monospace', fontWeight:700, color:IMP_COLOR[m.impact]||'#c9a84c', background:(IMP_COLOR[m.impact]||'#c9a84c')+'15', padding:'2px 7px', borderRadius:4, flexShrink:0, marginTop:1 }}>
                      {(m.impact||'').toUpperCase()}
                    </span>
                    <div>
                      <div style={{ fontSize:11, color:'#e8e6df', fontWeight:600, marginBottom:2 }}>{m.method}</div>
                      <div style={{ fontSize:10.5, color:'#6b6960' }}>{m.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Price Predictions */}
          {predicted.length > 0 && (
            <div style={{ padding:'14px 0', borderBottom:'1px solid rgba(201,168,76,0.04)' }}>
              <div style={{ fontSize:9, color:accentColor, fontFamily:'Space Mono, monospace', letterSpacing:'0.12em', marginBottom:10, textTransform:'uppercase' }}>🔮 Price Predictions</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {predicted.map((p: PredictedItem, i: number) => {
                  const pos = p.predicted_change_pct >= 0
                  const col = pos ? '#1baf7a' : '#e34948'
                  const pct = Math.abs(p.predicted_change_pct)
                  return (
                    <div key={i} className="vault-surface" style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:8, border:`1px solid ${accentColor}25` }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, fontFamily:'Space Mono, monospace', color:'#e8e6df', fontWeight:700 }}>{p.item_id}</div>
                        <div style={{ fontSize:10, color:'#4a4a45', marginTop:2 }}>{p.reasoning}</div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:18, fontWeight:700, color:col, fontFamily:'Space Mono, monospace', lineHeight:1 }}>
                          {pos?'+':'-'}{pct}%
                        </div>
                        <div style={{ fontSize:8.5, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>in {p.timeframe_days}d</div>
                      </div>
                      {/* Mini bar */}
                      <div style={{ width:40, height:40, borderRadius:'50%', background:col+'12', border:'2px solid '+col+'30', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <span style={{ fontSize:16 }}>{pos?'↑':'↓'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Vault Analysis */}
          {s(patch.price_prediction) && (
            <div style={{ padding:'14px 0' }}>
              <div style={{ fontSize:9, color:accentColor, fontFamily:'Space Mono, monospace', letterSpacing:'0.12em', marginBottom:8, textTransform:'uppercase' }}>📊 Vault Analysis</div>
              <div style={{ fontSize:12.5, color:'#cac8c0', lineHeight:1.75, padding:'12px 14px', background:'rgba(201,168,76,0.04)', border:'1px solid rgba(201,168,76,0.08)', borderRadius:8 }}>
                {s(patch.price_prediction)}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── Patch Card ───────────────────────────────────────────────
function PatchCard({ patch, isAlpha }: { patch: PatchInsight; isAlpha: boolean }) {
  const [modal, setModal] = useState(false)
  const accentColor = isAlpha ? '#eda100' : '#c9a84c'
  const dotColor    = isAlpha ? '#eda100' : '#1baf7a'
  const cfg         = SIGNAL[patch.action_signal] || SIGNAL.HOLD
  const items       = a(patch.items_affected).slice(0, 4)
  const upItems     = items.filter((i: ItemAffected) => i.direction === 'up')
  const downItems   = items.filter((i: ItemAffected) => i.direction === 'down')
  const [hov, setHov] = useState(false)

  return (
    <>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        className="vault-surface gem-tab-lg"
        style={{
          border:       `1px solid ${hov ? accentColor+'60' : accentColor+'30'}`,
          padding:      '16px 16px 14px 34px',
          marginBottom: 10, transition:'all 0.15s ease',
          filter:       hov ? `drop-shadow(0 8px 24px rgba(0,0,0,0.4)) drop-shadow(0 0 16px ${accentColor}30)` : `drop-shadow(0 0 6px ${accentColor}10)`,
        }}
      >
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13.5, fontWeight:700, color:'#e8e6df', lineHeight:1.35, marginBottom:4 }}>
              {s(patch.patch_title).slice(0, 60)}
            </div>
            {s(patch.patch_date) && (
              <div style={{ fontSize:9, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>{patch.patch_date}</div>
            )}
          </div>
          {/* Signal pill */}
          <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:20, background:cfg.bg, border:'1px solid '+cfg.border, flexShrink:0 }}>
            <span style={{ fontSize:12 }}>{cfg.icon}</span>
            <span style={{ fontSize:9.5, fontFamily:'Space Mono, monospace', fontWeight:700, color:cfg.color }}>{cfg.label}</span>
          </div>
        </div>

        {/* Impact text */}
        {s(patch.direct_impact) && (
          <div style={{ fontSize:11.5, color:'#8b8980', lineHeight:1.6, marginBottom:12 }}>
            {s(patch.direct_impact).slice(0, 160)}{patch.direct_impact?.length > 160 ? '...' : ''}
          </div>
        )}

        {/* Items preview */}
        {items.length > 0 && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:12 }}>
            {upItems.slice(0,3).map((item: ItemAffected, i: number) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:5, background:'#1baf7a0d', border:'1px solid #1baf7a20' }}>
                <span style={{ fontSize:9, color:'#1baf7a' }}>↑</span>
                <span style={{ fontSize:9, color:'#1baf7a', fontFamily:'Space Mono, monospace', fontWeight:700 }}>{item.item_id}</span>
              </div>
            ))}
            {downItems.slice(0,3).map((item: ItemAffected, i: number) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:5, background:'#e349480d', border:'1px solid #e3494820' }}>
                <span style={{ fontSize:9, color:'#e34948' }}>↓</span>
                <span style={{ fontSize:9, color:'#e34948', fontFamily:'Space Mono, monospace', fontWeight:700 }}>{item.item_id}</span>
              </div>
            ))}
            {a(patch.items_affected).length > 4 && (
              <div style={{ padding:'3px 8px', borderRadius:5, background:'rgba(201,168,76,0.03)', border:'1px solid rgba(201,168,76,0.06)', fontSize:9, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>
                +{a(patch.items_affected).length - 4}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <ConfBadge conf={patch.confidence} />
          <button
            onClick={() => setModal(true)}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:6, background:'rgba(201,168,76,0.08)', border:'1px solid rgba(201,168,76,0.35)', boxShadow:'0 0 10px rgba(201,168,76,0.1)', color:'#c9a84c', fontSize:9.5, fontFamily:'Space Mono, monospace', cursor:'pointer', fontWeight:700, transition:'all 0.15s' }}
          >
            DEEP DIVE <span style={{ fontSize:10 }}>→</span>
          </button>
        </div>
      </div>

      {modal && <DeepDiveModal patch={patch} onClose={() => setModal(false)} />}
    </>
  )
}

// ─── Column Header ────────────────────────────────────────────
function ColHeader({ label, dot, count }: { label: string; dot: string; count: number }) {
  return (
    <div className="gem-tab-sm" style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'10px 14px 10px 26px', background:`linear-gradient(135deg,${dot}0d,${dot}03)`, border:`1px solid ${dot}30`, filter:`drop-shadow(0 0 14px ${dot}12)` }}>
      <span style={{ width:8, height:8, borderRadius:'50%', background:dot, display:'inline-block', boxShadow:'0 0 8px '+dot, flexShrink:0 }} />
      <span style={{ fontSize:9, fontWeight:700, fontFamily:"'Press Start 2P', monospace", color:dot, letterSpacing:'0.03em', flex:1, textShadow:`0 0 10px ${dot}40` }}>{label.toUpperCase()}</span>
      {count > 0 && (
        <span style={{ fontSize:9, fontFamily:'Space Mono, monospace', color:'#3a3a38', padding:'2px 7px', background:'rgba(201,168,76,0.03)', borderRadius:4 }}>
          {count} patches
        </span>
      )}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────
function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding:'32px 20px', background:'#0f0f0e', borderRadius:10, border:'1px solid rgba(201,168,76,0.04)', textAlign:'center' }}>
      <div style={{ fontSize:24, marginBottom:8, opacity:0.3 }}>📋</div>
      <div style={{ fontSize:10, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>{label}</div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function PatchSection({ marketData, dataLoading }: {
  marketData: Record<string, string>; dataLoading: boolean
}) {
  const [insights, setInsights]     = useState<PatchInsight[]>([])
  const [insLoading, setInsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/patch-insights')
      .then(r => r.json())
      .then(d => { setInsights(Array.isArray(d) ? d : []); setInsLoading(false) })
      .catch(() => setInsLoading(false))
  }, [])

  let livePatches:  PatchInsight[] = []
  let alphaPatches: PatchInsight[] = []

  if (insights.length > 0) {
    livePatches  = insights.filter(i => i.patch_type === 'live'  || (!i.patch_type && !i.is_alpha))
    alphaPatches = insights.filter(i => i.patch_type === 'alpha' || i.is_alpha)
  } else {
    try {
      const raw = marketData['patch_analysis'] || ''
      if (raw) {
        const parsed = JSON.parse(raw)
        const norm = (p: any): PatchInsight => ({
          patch_title:      s(p.patch_title || p.title),
          patch_date:       s(p.patch_date  || p.date),
          patch_type:       p.patch_type || 'live',
          direct_impact:    s(p.direct_impact || p.impact),
          items_affected:   a(p.items_affected || p.items).map((i: any) => ({
            item_id: i.item_id||i.id||'', direction: i.direction||i.dir||'neutral',
            reason: i.reason||i.why||'', magnitude: i.magnitude||i.mag||'MED'
          })),
          methods_affected: a(p.methods_affected || p.methods).map((m: any) => ({
            method: m.method||m.name||'', impact: m.impact||'unchanged', reason: m.reason||m.why||''
          })),
          price_prediction: s(p.price_prediction || p.prediction),
          predicted_items:  a(p.predicted_items || p.predicted).map((x: any) => ({
            item_id: x.item_id||x.id||'', predicted_change_pct: x.predicted_change_pct??x.pct??0,
            timeframe_days: x.timeframe_days??x.days??0, reasoning: x.reasoning||x.why||''
          })),
          action_signal:    s(p.action_signal || p.signal),
          confidence:       s(p.confidence),
        })
        livePatches  = a(parsed.live_patches).map(norm)
        alphaPatches = a(parsed.alpha_patches).map(norm)
      }
    } catch {}
  }

  const loading = dataLoading || insLoading

  return (
    <div>
      {/* Section title */}
      <div className="gem-tab-lg" style={{ marginBottom:20, padding:'12px 16px 12px 44px', background:'linear-gradient(135deg, rgba(201,168,76,0.1) 0%, rgba(201,168,76,0.03) 100%)', border:'1px solid rgba(232,192,99,0.4)', filter:'drop-shadow(0 0 20px rgba(232,192,99,0.08))', display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:20 }}>🔧</span>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#c9a84c', fontFamily:"'Press Start 2P', monospace", letterSpacing:'0.04em' }}>PATCH INTELLIGENCE</div>
          <div style={{ fontSize:10, color:'#3a3a38', marginTop:2 }}>Live patches + Alpha previews with economic impact analysis</div>
        </div>
        <div style={{ marginLeft:'auto', fontSize:8.5, color:'#3a3a38', fontFamily:'Space Mono, monospace', textAlign:'right' }}>
          Updated daily<br/>by Vault AI
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

        {/* LIVE */}
        <div>
          <ColHeader label="Live Patches" dot="#1baf7a" count={livePatches.length} />
          {loading ? (
            <EmptyState label="Loading..." />
          ) : livePatches.length > 0 ? (
            livePatches.map((p, i) => <PatchCard key={i} patch={p} isAlpha={false} />)
          ) : (
            <EmptyState label="No live patches analyzed yet" />
          )}
        </div>

        {/* ALPHA */}
        <div>
          <ColHeader label="Alpha Preview" dot="#eda100" count={alphaPatches.length} />
          {loading ? (
            <EmptyState label="Loading..." />
          ) : alphaPatches.length > 0 ? (
            alphaPatches.map((p, i) => <PatchCard key={i} patch={p} isAlpha={true} />)
          ) : (
            <EmptyState label="No alpha patches detected" />
          )}
        </div>

      </div>
    </div>
  )
}