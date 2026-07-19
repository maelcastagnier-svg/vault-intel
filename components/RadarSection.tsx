// components/RadarSection.tsx
// Section Radar — Item Explorer (graphique) + Intelligence Vault (Claude)
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────
type SearchResult = { item_id: string; item_name: string; source: 'bazaar'|'ah'; variant_count?: number }
type PricePoint   = { date: string; buy_price?: number; sell_price?: number; avg_price?: number; volume?: number }
type VariantMeta  = { key: string; label: string; data_points: number; has_exact: boolean; has_scan: boolean }
type HistoryData  = { item_id: string; source: string; period: string; data: PricePoint[]; available_variants?: VariantMeta[] }
type RadarItem    = { item_id: string; item_name: string; signal: string; reason: string; drivers: string[]; timeframe: string; price_target: string; confidence: string }
type RadarData    = { positive: RadarItem[]; negative: RadarItem[]; summary: string }

// ─── Config ──────────────────────────────────────────────────
const PERIODS = ['1D','1W','1M','1Y','3Y']

const SIGNAL_COLORS: Record<string, string> = {
  BUY:'#1baf7a', INVEST:'#9b59b6', SELL:'#e34948', AVOID:'#e34948', WATCH:'#c9a84c'
}
const CONF_COLORS: Record<string, string>  = { HIGH:'#1baf7a', MED:'#c9a84c', LOW:'#e34948' }
const DRIVER_LABELS: Record<string, string> = {
  patch_buff:'🔧 Patch Buff', patch_nerf:'🔧 Patch Nerf',
  supply_shock:'📦 Supply Shock', supply_increase:'📦 Supply↑',
  event_demand:'🎉 Event Demand', demand_drop:'📉 Demand↓', trend:'📈 Trend',
}

const fmt = (n: number) => {
  if (!n||isNaN(n)) return '—'
  if (n >= 1_000_000_000) return (n/1_000_000_000).toFixed(2)+'B'
  if (n >= 1_000_000)     return (n/1_000_000).toFixed(1)+'M'
  if (n >= 1_000)         return (n/1_000).toFixed(1)+'K'
  return n.toFixed(0)
}

const fmtDate = (d: string) => {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short' })
}

// ─── Tooltip ─────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active||!payload?.length) return null
  const p = payload[0]?.payload
  return (
    <div style={{ background:'#0f0f0e', border:'1px solid rgba(201,168,76,0.2)', borderRadius:8, padding:'10px 14px', fontSize:11, fontFamily:'Space Mono, monospace' }}>
      <div style={{ color:'#c9a84c', marginBottom:5 }}>{fmtDate(label) || label?.slice(0,13)}</div>
      {p?.sell_price>0 && <div style={{ color:'#1baf7a' }}>Sell: {fmt(p.sell_price)}</div>}
      {p?.buy_price>0  && <div style={{ color:'#2a78d6' }}>Buy:  {fmt(p.buy_price)}</div>}
      {p?.avg_price>0  && <div style={{ color:'#c9a84c' }}>Avg:  {fmt(p.avg_price)}</div>}
      {p?.volume>0     && <div style={{ color:'#4a4a45', marginTop:4 }}>Vol: {Number(p.volume).toLocaleString()}</div>}
    </div>
  )
}

// ─── Item Explorer ────────────────────────────────────────────
function ItemExplorer() {
  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState<SearchResult[]>([])
  const [selected,   setSelected]   = useState<SearchResult|null>(null)
  const [period,     setPeriod]     = useState('1M')
  const [history,    setHistory]    = useState<HistoryData|null>(null)
  const [loading,    setLoading]    = useState(false)
  const [showDrop,   setShowDrop]   = useState(false)
  const [variant,    setVariant]    = useState('all')

  const debounceRef  = useRef<any>(null)
  const currentQ     = useRef('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Ferme dropdown si clic en dehors
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Recherche debounced + race condition safe
  const search = useCallback((q: string) => {
    setQuery(q)
    currentQ.current = q
    clearTimeout(debounceRef.current)

    if (q.length < 1) { setResults([]); setShowDrop(false); return }

    debounceRef.current = setTimeout(async () => {
      if (currentQ.current !== q) return
      try {
        const res  = await fetch(`/api/item-search?q=${encodeURIComponent(q)}&limit=25`)
        const data = await res.json()
        if (currentQ.current !== q) return
        setResults(Array.isArray(data) ? data : [])
        setShowDrop(true)
      } catch {}
    }, 150)
  }, [])

  // Charge historique
  const loadHistory = useCallback(async (item: SearchResult, p: string, v: string) => {
    setLoading(true)
    setHistory(null)
    try {
      const vParam = v !== 'all' ? `&variant=${encodeURIComponent(v)}` : ''
      const res  = await fetch(`/api/item-history?item_id=${encodeURIComponent(item.item_id)}&source=${item.source}&period=${p}${vParam}`)
      const data = await res.json()
      setHistory(data)
    } catch {}
    setLoading(false)
  }, [])

  function select(item: SearchResult) {
    setSelected(item)
    setQuery(item.item_name)
    setShowDrop(false)
    setResults([])
    currentQ.current = ''
    setVariant('all')
    loadHistory(item, period, 'all')
  }

  function changePeriod(p: string) {
    setPeriod(p)
    if (selected) loadHistory(selected, p, variant)
  }

  function changeVariant(v: string) {
    setVariant(v)
    if (selected) loadHistory(selected, period, v)
  }

  const data     = history?.data || []
  const isBazaar = selected?.source === 'bazaar'
  const variants = (history?.available_variants as VariantMeta[]) || []

  // Stats
  const prices     = data.map(d => d.sell_price||d.avg_price||0).filter(p=>p>0)
  const lastPrice  = prices[prices.length-1] || 0
  const firstPrice = prices[0] || 0
  const minPrice   = prices.length ? Math.min(...prices) : 0
  const maxPrice   = prices.length ? Math.max(...prices) : 0
  const changePct  = firstPrice > 0 ? Math.round(((lastPrice-firstPrice)/firstPrice)*100) : 0

  return (
    <div style={{ background:'#0f0f0e', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:'20px' }}>
      <div style={{ fontSize:9, color:'#c9a84c', fontFamily:'Space Mono, monospace', letterSpacing:'0.14em', marginBottom:14, textTransform:'uppercase', fontWeight:700 }}>
        📊 Item Explorer — {4781} items tracked
      </div>

      {/* Search */}
      <div ref={containerRef} style={{ position:'relative', marginBottom:16 }}>
        <input
          value={query}
          onChange={e => search(e.target.value)}
          onFocus={() => query.length >= 1 && results.length > 0 && setShowDrop(true)}
          placeholder="Search any item... (e.g. Hyperion, necron, jungle log)"
          style={{
            width:'100%', background:'#111110', border:'1px solid rgba(255,255,255,0.08)',
            borderRadius:9, padding:'11px 14px', color:'#e8e6df',
            fontFamily:'Space Grotesk, sans-serif', fontSize:13, outline:'none',
            boxSizing:'border-box', transition:'border-color 0.15s',
          }}
        />

        {/* Dropdown */}
        {showDrop && results.length > 0 && (
          <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#111110', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, maxHeight:280, overflowY:'auto', zIndex:200, boxShadow:'0 20px 50px rgba(0,0,0,0.9)' }}>
            {results.map((r, i) => (
              <div
                key={i}
                onClick={() => select(r)}
                style={{ padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid rgba(255,255,255,0.03)', transition:'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background='transparent')}
              >
                {/* Source badge */}
                <span style={{
                  fontSize:8, padding:'2px 6px', borderRadius:4, fontFamily:'Space Mono, monospace', fontWeight:700,
                  color:       r.source==='bazaar'?'#1baf7a':'#c9a84c',
                  background:  r.source==='bazaar'?'#1baf7a12':'#c9a84c12',
                  border:      `1px solid ${r.source==='bazaar'?'#1baf7a':'#c9a84c'}20`,
                  flexShrink:  0, whiteSpace:'nowrap'
                }}>{r.source.toUpperCase()}</span>

                {/* Name */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, color:'#e8e6df', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {r.item_name}
                  </div>
                  <div style={{ fontSize:9.5, color:'#3a3a38', fontFamily:'Space Mono, monospace', marginTop:1 }}>
                    {r.item_id}
                  </div>
                </div>

                {/* Variant count */}
                {r.source === 'ah' && (r.variant_count ?? 0) > 1 && (
                  <span style={{ fontSize:8.5, color:'#9b59b6', fontFamily:'Space Mono, monospace', background:'rgba(155,89,182,0.1)', padding:'2px 7px', borderRadius:4, border:'1px solid rgba(155,89,182,0.15)', flexShrink:0 }}>
                    {r.variant_count} variants
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <>
          {/* Period selector */}
          <div style={{ display:'flex', gap:3, background:'#111110', padding:3, borderRadius:7, width:'fit-content', marginBottom:14 }}>
            {PERIODS.map(p => (
              <button key={p} onClick={() => changePeriod(p)} style={{
                padding:'4px 12px', borderRadius:5, border:'none', cursor:'pointer',
                background: period===p?'#1e1e1c':'transparent',
                color:      period===p?'#e8e6df':'#4a4a45',
                fontSize:10.5, fontFamily:'Space Mono, monospace', fontWeight:700, transition:'all 0.15s'
              }}>{p}</button>
            ))}
          </div>

          {/* Stats */}
          {data.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
              {[
                { label:'Current', value:fmt(lastPrice),  color:'#e8e6df' },
                { label:'Change',  value:(changePct>=0?'+':'')+changePct+'%', color:changePct>=0?'#1baf7a':'#e34948' },
                { label:'High',    value:fmt(maxPrice),   color:'#1baf7a' },
                { label:'Low',     value:fmt(minPrice),   color:'#e34948' },
              ].map((s,i) => (
                <div key={i} style={{ background:'#111110', borderRadius:7, padding:'8px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:8.5, color:'#4a4a45', fontFamily:'Space Mono, monospace', marginBottom:3, textTransform:'uppercase' }}>{s.label}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:s.color, fontFamily:'Space Mono, monospace' }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Chart */}
          <div style={{ height:200 }}>
            {loading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:10 }}>
                <div style={{ display:'flex', gap:5 }}>
                  {[0,1,2].map(i=><div key={i} style={{ width:5,height:5,borderRadius:'50%',background:'#c9a84c',opacity:0.7,animation:`rp ${1.2}s ${i*0.2}s infinite` }}/>)}
                </div>
                <div style={{ fontSize:9.5, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>LOADING...</div>
              </div>
            ) : data.length === 0 ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
                <div style={{ fontSize:10, color:'#2a2a28', fontFamily:'Space Mono, monospace' }}>NO DATA FOR THIS PERIOD</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top:5, right:5, bottom:5, left:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tickFormatter={d => fmtDate(d)||d?.slice(11,13)+'h'} tick={{ fill:'#3a3a38', fontSize:9, fontFamily:'Space Mono, monospace' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={fmt} tick={{ fill:'#3a3a38', fontSize:9, fontFamily:'Space Mono, monospace' }} tickLine={false} axisLine={false} width={55} />
                  <Tooltip content={<ChartTooltip />} />
                  {isBazaar ? (
                    <>
                      <Line dataKey="sell_price" stroke="#1baf7a" strokeWidth={2} dot={false} name="Sell" />
                      <Line dataKey="buy_price"  stroke="#2a78d6" strokeWidth={1.5} dot={false} name="Buy" strokeDasharray="4 2" />
                    </>
                  ) : (
                    <Line dataKey="avg_price" stroke="#c9a84c" strokeWidth={2} dot={false} name="Avg" connectNulls />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Meta */}
          <div style={{ marginTop:8, fontSize:9.5, color:'#3a3a38', fontFamily:'Space Mono, monospace', display:'flex', gap:12 }}>
            <span>{data.length} data points</span>
            <span>·</span>
            <span>{selected.item_id}</span>
            {variant !== 'all' && <><span>·</span><span style={{ color:'#9b59b6' }}>{variant}</span></>}
          </div>

          {/* ── Variant List (AH only) ── */}
          {!isBazaar && variants.length > 0 && (
            <div style={{ marginTop:16, borderTop:'1px solid rgba(255,255,255,0.05)', paddingTop:14 }}>
              <div style={{ fontSize:9, color:'#4a4a45', fontFamily:'Space Mono, monospace', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
                <span>Tracked variants</span>
                <span style={{ color:'#9b59b6', background:'rgba(155,89,182,0.1)', padding:'1px 7px', borderRadius:4, border:'1px solid rgba(155,89,182,0.15)', fontWeight:700 }}>
                  {variants.length}
                </span>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:280, overflowY:'auto', paddingRight:2 }}>
                {/* All variants */}
                <div
                  onClick={() => changeVariant('all')}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, cursor:'pointer', transition:'all 0.12s', background:variant==='all'?'rgba(201,168,76,0.08)':'transparent', border:`1px solid ${variant==='all'?'rgba(201,168,76,0.2)':'rgba(255,255,255,0.04)'}` }}
                >
                  <div style={{ width:32, height:32, borderRadius:7, background:'rgba(201,168,76,0.1)', border:'1px solid rgba(201,168,76,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>📊</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11.5, fontWeight:600, color:variant==='all'?'#e8e6df':'#9b9b8f' }}>All variants — trend overview</div>
                    <div style={{ fontSize:9.5, color:'#3a3a38', fontFamily:'Space Mono, monospace', marginTop:2 }}>Average across all {variants.length} variants</div>
                  </div>
                  {variant==='all' && <span style={{ color:'#c9a84c', fontSize:10 }}>●</span>}
                </div>

                {/* Each variant */}
                {variants.map(v => {
                  const isActive  = variant === v.key
                  const isBase    = v.key === 'nostar_norecomb_noreforge'
                  const hasStars  = v.key.match(/^(\d+)star/)
                  const hasRecomb = v.key.includes('_recomb') && !v.key.includes('norecomb')
                  const accentColor = isBase ? '#c9a84c' : hasRecomb ? '#9b59b6' : hasStars ? '#2a78d6' : '#4a4a45'
                  const icon = isBase ? '✦' : hasStars ? `${hasStars[1]}⭐` : '🔹'

                  return (
                    <div
                      key={v.key}
                      onClick={() => changeVariant(v.key)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, cursor:'pointer', transition:'all 0.12s', background:isActive?accentColor+'0d':'transparent', border:`1px solid ${isActive?accentColor+'30':'rgba(255,255,255,0.04)'}` }}
                    >
                      {/* Icon */}
                      <div style={{ width:32, height:32, borderRadius:7, background:accentColor+'10', border:'1px solid '+accentColor+'20', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, flexShrink:0, fontFamily:'Space Mono, monospace', color:accentColor, fontWeight:700 }}>
                        {icon}
                      </div>

                      {/* Label */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:600, color:isActive?'#e8e6df':'#9b9b8f', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {v.label}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
                          <span style={{ fontSize:9, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>{v.data_points} pts</span>
                          {v.has_exact && (
                            <span style={{ fontSize:8, color:'#1baf7a', fontFamily:'Space Mono, monospace', background:'rgba(27,175,122,0.08)', padding:'1px 5px', borderRadius:3, border:'1px solid rgba(27,175,122,0.15)' }}>
                              NBT ✓
                            </span>
                          )}
                          {v.has_scan && !v.has_exact && (
                            <span style={{ fontSize:8, color:'#2a78d6', fontFamily:'Space Mono, monospace', background:'rgba(42,120,214,0.08)', padding:'1px 5px', borderRadius:3, border:'1px solid rgba(42,120,214,0.15)' }}>
                              LIVE
                            </span>
                          )}
                        </div>
                      </div>

                      {isActive && <span style={{ color:accentColor, fontSize:10, flexShrink:0 }}>●</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ padding:'36px 20px', textAlign:'center' }}>
          <div style={{ fontSize:28, marginBottom:12, opacity:0.15 }}>🔍</div>
          <div style={{ fontSize:11, color:'#3a3a38', fontFamily:'Space Mono, monospace', marginBottom:4 }}>Search any item to view price history</div>
          <div style={{ fontSize:9.5, color:'#2a2a28', fontFamily:'Space Mono, monospace' }}>2119 Bazaar · 2662 AH · 1429 variants tracked</div>
        </div>
      )}

      <style>{`@keyframes rp{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.6);opacity:1}}`}</style>
    </div>
  )
}

// ─── Radar Card ───────────────────────────────────────────────
function RadarCard({ item, type }: { item: RadarItem; type: 'positive'|'negative' }) {
  const isPos     = type === 'positive'
  const sigColor  = SIGNAL_COLORS[item.signal] || (isPos?'#1baf7a':'#e34948')
  const confColor = CONF_COLORS[item.confidence] || '#c9a84c'
  const [hov, setHov] = useState(false)

  return (
    <div
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{ background:hov?'#141413':'#0f0f0e', border:`1px solid ${hov?sigColor+'30':'rgba(255,255,255,0.06)'}`, borderLeft:`3px solid ${sigColor}`, borderRadius:9, padding:'13px 14px', marginBottom:8, transition:'all 0.15s' }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#e8e6df', marginBottom:2 }}>{item.item_name||item.item_id}</div>
          <div style={{ fontSize:9, color:'#4a4a45', fontFamily:'Space Mono, monospace' }}>{item.item_id}</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, flexShrink:0 }}>
          <span style={{ fontSize:9.5, fontFamily:'Space Mono, monospace', fontWeight:700, padding:'2px 8px', borderRadius:5, color:sigColor, background:sigColor+'12', border:'1px solid '+sigColor+'25' }}>{item.signal}</span>
          <span style={{ fontSize:8, color:confColor, fontFamily:'Space Mono, monospace', fontWeight:700 }}>{item.confidence}</span>
        </div>
      </div>
      <div style={{ fontSize:11, color:'#8b8980', lineHeight:1.6, marginBottom:8 }}>{item.reason}</div>
      {item.drivers?.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
          {item.drivers.map((d,i) => (
            <span key={i} style={{ fontSize:9, padding:'2px 7px', borderRadius:4, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', color:'#6b6960', fontFamily:'Space Mono, monospace' }}>
              {DRIVER_LABELS[d]||d}
            </span>
          ))}
        </div>
      )}
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:9.5, fontFamily:'Space Mono, monospace' }}>
        <span style={{ color:'#3a3a38' }}>⏱ {item.timeframe}</span>
        <span style={{ color:sigColor, fontWeight:700 }}>{item.price_target}</span>
      </div>
    </div>
  )
}

// ─── Intelligence Vault ───────────────────────────────────────
function IntelligenceVault({ marketData, dataLoading }: { marketData: Record<string,string>; dataLoading: boolean }) {
  let radar: RadarData = { positive:[], negative:[], summary:'' }
  try { const raw = marketData['radar']||''; if (raw) radar = JSON.parse(raw) } catch {}

  const positive = Array.isArray(radar.positive) ? radar.positive.slice(0,10) : []
  const negative = Array.isArray(radar.negative) ? radar.negative.slice(0,10) : []

  return (
    <div style={{ background:'#0f0f0e', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:'20px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ fontSize:9, color:'#9b59b6', fontFamily:'Space Mono, monospace', letterSpacing:'0.14em', textTransform:'uppercase', fontWeight:700 }}>⚡ Vault Intelligence</div>
        <div style={{ fontSize:8.5, color:'#3a3a38', fontFamily:'Space Mono, monospace', marginLeft:'auto' }}>Daily · patches × trends × events</div>
      </div>

      {radar.summary && (
        <div style={{ padding:'10px 14px', background:'rgba(155,89,182,0.05)', border:'1px solid rgba(155,89,182,0.1)', borderRadius:8, marginBottom:14, fontSize:11.5, color:'#9b9b8f', lineHeight:1.65 }}>
          {radar.summary}
        </div>
      )}

      {dataLoading ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'#2a2a28', fontSize:10, fontFamily:'Space Mono, monospace' }}>LOADING INTELLIGENCE...</div>
      ) : positive.length===0&&negative.length===0 ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'#2a2a28', fontSize:10, fontFamily:'Space Mono, monospace' }}>Run radar-agent to generate intelligence</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12, padding:'7px 12px', background:'rgba(27,175,122,0.05)', border:'1px solid rgba(27,175,122,0.1)', borderRadius:7 }}>
              <span style={{ fontSize:13 }}>📈</span>
              <span style={{ fontSize:9.5, fontWeight:700, color:'#1baf7a', fontFamily:'Space Mono, monospace', letterSpacing:'0.1em', textTransform:'uppercase' }}>Top Opportunities</span>
            </div>
            {positive.map((item,i) => <RadarCard key={i} item={item} type="positive" />)}
          </div>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12, padding:'7px 12px', background:'rgba(227,73,72,0.05)', border:'1px solid rgba(227,73,72,0.1)', borderRadius:7 }}>
              <span style={{ fontSize:13 }}>📉</span>
              <span style={{ fontSize:9.5, fontWeight:700, color:'#e34948', fontFamily:'Space Mono, monospace', letterSpacing:'0.1em', textTransform:'uppercase' }}>Risk Items</span>
            </div>
            {negative.map((item,i) => <RadarCard key={i} item={item} type="negative" />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function RadarSection({ marketData, dataLoading }: { marketData: Record<string,string>; dataLoading: boolean }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ padding:'12px 16px', background:'linear-gradient(135deg,rgba(155,89,182,0.06),rgba(155,89,182,0.02))', border:'1px solid rgba(155,89,182,0.12)', borderRadius:10, display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:20 }}>📡</span>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#9b59b6', fontFamily:'Space Mono, monospace', letterSpacing:'0.1em' }}>MARKET RADAR</div>
          <div style={{ fontSize:10, color:'#3a3a38', marginTop:2 }}>Price explorer · 4781 items · Bazaar + AH · up to 3 years</div>
        </div>
        <div style={{ marginLeft:'auto', fontSize:8.5, color:'#3a3a38', fontFamily:'Space Mono, monospace', textAlign:'right' }}>Daily intelligence<br/>+ live charts</div>
      </div>
      <ItemExplorer />
      <IntelligenceVault marketData={marketData} dataLoading={dataLoading} />
    </div>
  )
}