// components/RadarSection.tsx
// Section Radar — Item Explorer (graphique) + Intelligence Vault (Claude)
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'

const LineChart        = dynamic(() => import('recharts').then(m => m.LineChart),        { ssr: false })
const Line             = dynamic(() => import('recharts').then(m => m.Line),             { ssr: false })
const XAxis            = dynamic(() => import('recharts').then(m => m.XAxis),            { ssr: false })
const YAxis            = dynamic(() => import('recharts').then(m => m.YAxis),            { ssr: false })
const Tooltip          = dynamic(() => import('recharts').then(m => m.Tooltip),          { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })
const CartesianGrid    = dynamic(() => import('recharts').then(m => m.CartesianGrid),    { ssr: false })

// ─── Types ───────────────────────────────────────────────────
type SearchResult = { item_id: string; item_name: string; source: 'bazaar'|'ah'; variant_count?: number }
type PricePoint   = { date: string; buy_price?: number; sell_price?: number; avg_price?: number; volume?: number }
type HistoryData  = { item_id: string; source: string; period: string; data: PricePoint[]; available_variants?: string[] }

type RadarItem = {
  item_id:      string
  item_name:    string
  signal:       string
  reason:       string
  drivers:      string[]
  timeframe:    string
  price_target: string
  confidence:   string
}

type RadarData = {
  positive: RadarItem[]
  negative: RadarItem[]
  summary:  string
}

// ─── Config ──────────────────────────────────────────────────
const PERIODS = ['1D','1W','1M','1Y','3Y']
const SIGNAL_COLORS: Record<string, string> = {
  BUY:'#1baf7a', INVEST:'#9b59b6', SELL:'#e34948', AVOID:'#e34948', WATCH:'#c9a84c'
}
const CONF_COLORS: Record<string, string> = { HIGH:'#1baf7a', MED:'#c9a84c', LOW:'#e34948' }
const DRIVER_LABELS: Record<string, string> = {
  patch_buff:'🔧 Patch Buff', patch_nerf:'🔧 Patch Nerf',
  supply_shock:'📦 Supply Shock', supply_increase:'📦 Supply↑',
  event_demand:'🎉 Event Demand', demand_drop:'📉 Demand↓',
  trend:'📈 Trend',
}

const formatPrice = (n: number) => {
  if (n >= 1_000_000_000) return (n/1_000_000_000).toFixed(1)+'B'
  if (n >= 1_000_000)     return (n/1_000_000).toFixed(1)+'M'
  if (n >= 1_000)         return (n/1_000).toFixed(1)+'K'
  return n.toFixed(0)
}

const formatDate = (d: string) => {
  const dt = new Date(d)
  return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short' })
}

// ─── Custom Tooltip ───────────────────────────────────────────
function PriceTooltip({ active, payload, label }: any) {
  if (!active||!payload?.length) return null
  const p = payload[0]?.payload
  return (
    <div style={{ background:'#0f0f0e', border:'1px solid rgba(201,168,76,0.2)', borderRadius:8, padding:'10px 14px', fontSize:11, fontFamily:'Space Mono, monospace' }}>
      <div style={{ color:'#c9a84c', marginBottom:6 }}>{formatDate(label)}</div>
      {p?.sell_price && <div style={{ color:'#1baf7a' }}>Sell: {formatPrice(p.sell_price)}</div>}
      {p?.buy_price  && <div style={{ color:'#2a78d6' }}>Buy: {formatPrice(p.buy_price)}</div>}
      {p?.avg_price  && <div style={{ color:'#c9a84c' }}>Avg: {formatPrice(p.avg_price)}</div>}
      {p?.volume     && <div style={{ color:'#4a4a45', marginTop:4 }}>Vol: {Number(p.volume).toLocaleString()}</div>}
    </div>
  )
}

// ─── Item Explorer ────────────────────────────────────────────
function ItemExplorer() {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<SearchResult[]>([])
  const [selected,  setSelected]  = useState<SearchResult|null>(null)
  const [period,    setPeriod]    = useState('1M')
  const [history,   setHistory]   = useState<HistoryData|null>(null)
  const [loading,   setLoading]   = useState(false)
  const [showDrop,  setShowDrop]  = useState(false)
  const [variant,   setVariant]   = useState<string>('all')
  const debounceRef = useRef<any>(null)

  // Recherche avec debounce
  const search = useCallback((q: string) => {
    setQuery(q)
    clearTimeout(debounceRef.current)
    if (q.length < 2) { setResults([]); setShowDrop(false); return }
    debounceRef.current = setTimeout(async () => {
      const res  = await fetch(`/api/item-search?q=${encodeURIComponent(q)}&limit=20`)
      const data = await res.json()
      setResults(Array.isArray(data) ? data : [])
      setShowDrop(true)
    }, 150)
  }, [])

  // Charge historique
  const loadHistory = useCallback(async (item: SearchResult, p: string, v: string) => {
    setLoading(true)
    try {
      const url = `/api/item-history?item_id=${encodeURIComponent(item.item_id)}&source=${item.source}&period=${p}${v !== 'all' ? '&variant='+encodeURIComponent(v) : ''}`
      const res  = await fetch(url)
      const data = await res.json()
      setHistory(data)
    } catch {}
    setLoading(false)
  }, [])

  function select(item: SearchResult) {
    setSelected(item)
    setQuery(item.item_name)
    setShowDrop(false)
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

  const data      = history?.data || []
  const isBazaar  = selected?.source === 'bazaar'
  const variants  = (history?.available_variants as any[]) || []

  // Stats rapides
  const prices    = data.map(d => d.sell_price || d.avg_price || 0).filter(p => p > 0)
  const minPrice  = prices.length > 0 ? Math.min(...prices) : 0
  const maxPrice  = prices.length > 0 ? Math.max(...prices) : 0
  const lastPrice = prices[prices.length-1] || 0
  const firstPrice= prices[0] || 0
  const changePct = firstPrice > 0 ? Math.round(((lastPrice-firstPrice)/firstPrice)*100) : 0

  return (
    <div style={{ background:'#0f0f0e', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:'20px' }}>
      <div style={{ fontSize:9, color:'#c9a84c', fontFamily:'Space Mono, monospace', letterSpacing:'0.14em', marginBottom:14, textTransform:'uppercase', fontWeight:700 }}>
        📊 Item Explorer
      </div>

      {/* Search */}
      <div style={{ position:'relative', marginBottom:16 }}>
        <input
          value={query}
          onChange={e => search(e.target.value)}
          onFocus={() => results.length > 0 && setShowDrop(true)}
          placeholder="Search item... (e.g. HYPERION, NECRON, CHIMERA)"
          style={{
            width:'100%', background:'#111110', border:'1px solid rgba(255,255,255,0.08)',
            borderRadius:9, padding:'10px 14px', color:'#e8e6df',
            fontFamily:'Space Grotesk, sans-serif', fontSize:13, outline:'none',
            boxSizing:'border-box', transition:'border-color 0.15s',
          }}
        />
        {showDrop && results.length > 0 && (
          <div
            style={{ position:'absolute', top:'100%', left:0, right:0, background:'#111110', border:'1px solid rgba(255,255,255,0.08)', borderRadius:9, marginTop:4, maxHeight:240, overflowY:'auto', zIndex:100, boxShadow:'0 20px 40px rgba(0,0,0,0.8)' }}
            onMouseDown={e => e.preventDefault()}
          >
            {results.map((r, i) => (
              <div
                key={i}
                onClick={() => select(r)}
                style={{ padding:'9px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background='transparent')}
              >
                <span style={{ fontSize:8.5, padding:'2px 6px', borderRadius:4, fontFamily:'Space Mono, monospace', fontWeight:700, color:r.source==='bazaar'?'#1baf7a':'#c9a84c', background:r.source==='bazaar'?'#1baf7a12':'#c9a84c12', border:`1px solid ${r.source==='bazaar'?'#1baf7a':'#c9a84c'}20`, flexShrink:0 }}>
                  {r.source.toUpperCase()}
                </span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:'#e8e6df', fontWeight:500 }}>{r.item_name}</div>
                  <div style={{ fontSize:9.5, color:'#4a4a45', fontFamily:'Space Mono, monospace' }}>{r.item_id}</div>
                </div>
                {r.source === 'ah' && (r.variant_count ?? 0) > 1 && (
                  <span style={{ fontSize:8.5, color:'#9b59b6', fontFamily:'Space Mono, monospace', background:'rgba(155,89,182,0.1)', padding:'2px 6px', borderRadius:4, flexShrink:0 }}>
                    {r.variant_count} variants
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <>
          {/* Controls */}
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            {/* Period selector */}
            <div style={{ display:'flex', gap:3, background:'#111110', padding:3, borderRadius:7 }}>
              {PERIODS.map(p => (
                <button key={p} onClick={() => changePeriod(p)} style={{
                  padding:'4px 10px', borderRadius:5, border:'none', cursor:'pointer',
                  background: period===p?'#1e1e1c':'transparent',
                  color: period===p?'#e8e6df':'#4a4a45',
                  fontSize:10.5, fontFamily:'Space Mono, monospace', fontWeight:700, transition:'all 0.15s'
                }}>{p}</button>
              ))}
            </div>

            {/* Source badge */}
            <div style={{ padding:'4px 10px', borderRadius:6, fontSize:9.5, fontFamily:'Space Mono, monospace', fontWeight:700, color:selected.source==='bazaar'?'#1baf7a':'#c9a84c', background:selected.source==='bazaar'?'#1baf7a12':'#c9a84c12', border:`1px solid ${selected.source==='bazaar'?'#1baf7a':'#c9a84c'}20`, display:'flex', alignItems:'center' }}>
              {selected.source==='bazaar'?'BAZAAR':'AH'}
            </div>

            {/* Variant selector (AH only) — remplacé par la liste en dessous du graphique */}
          </div>

          {/* Quick stats */}
          {data.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
              {[
                { label:'Current',  value: formatPrice(lastPrice),  color:'#e8e6df' },
                { label:'Change',   value: (changePct>=0?'+':'')+changePct+'%', color:changePct>=0?'#1baf7a':'#e34948' },
                { label:'High',     value: formatPrice(maxPrice),   color:'#1baf7a' },
                { label:'Low',      value: formatPrice(minPrice),   color:'#e34948' },
              ].map((stat, i) => (
                <div key={i} style={{ background:'#111110', borderRadius:7, padding:'8px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:8.5, color:'#4a4a45', fontFamily:'Space Mono, monospace', marginBottom:3, textTransform:'uppercase' }}>{stat.label}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:stat.color, fontFamily:'Space Mono, monospace' }}>{stat.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Chart */}
          <div style={{ height:220 }}>
            {loading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#3a3a38', fontSize:10, fontFamily:'Space Mono, monospace' }}>
                LOADING CHART...
              </div>
            ) : data.length === 0 ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#2a2a28', fontSize:10, fontFamily:'Space Mono, monospace' }}>
                NO DATA FOR THIS PERIOD
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top:5, right:5, bottom:5, left:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fill:'#3a3a38', fontSize:9, fontFamily:'Space Mono, monospace' }}
                    tickLine={false} axisLine={false} interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={formatPrice}
                    tick={{ fill:'#3a3a38', fontSize:9, fontFamily:'Space Mono, monospace' }}
                    tickLine={false} axisLine={false} width={50}
                  />
                  <Tooltip content={<PriceTooltip />} />
                  {isBazaar ? (
                    <>
                      <Line dataKey="sell_price" stroke="#1baf7a" strokeWidth={2} dot={false} name="Sell" />
                      <Line dataKey="buy_price"  stroke="#2a78d6" strokeWidth={1.5} dot={false} name="Buy" strokeDasharray="4 2" />
                    </>
                  ) : (
                    <Line dataKey="avg_price" stroke="#c9a84c" strokeWidth={2} dot={false} name="Avg" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Item info */}
          <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1, fontSize:9.5, color:'#4a4a45', fontFamily:'Space Mono, monospace' }}>
              {data.length} data points · {selected.item_id}
            </div>
            {!isBazaar && variant !== 'all' && (
              <div style={{ fontSize:9, color:'#9b59b6', fontFamily:'Space Mono, monospace', padding:'2px 7px', background:'rgba(155,89,182,0.08)', borderRadius:4, border:'1px solid rgba(155,89,182,0.15)' }}>
                {variant}
              </div>
            )}
          </div>

          {/* ── Variant List (AH only) ── */}
          {!isBazaar && variants.length > 0 && (
            <div style={{ marginTop:16, borderTop:'1px solid rgba(255,255,255,0.05)', paddingTop:14 }}>
              <div style={{ fontSize:9, color:'#4a4a45', fontFamily:'Space Mono, monospace', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:10 }}>
                {variants.length} variant{variants.length > 1 ? 's' : ''} tracked
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:220, overflowY:'auto' }}>
                {/* Option "toutes variantes" */}
                <div
                  onClick={() => changeVariant('all')}
                  style={{
                    display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
                    borderRadius:7, cursor:'pointer', transition:'all 0.12s',
                    background: variant==='all' ? 'rgba(201,168,76,0.08)' : 'transparent',
                    border: `1px solid ${variant==='all' ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.04)'}`,
                  }}
                >
                  <div style={{ width:28, height:28, borderRadius:6, background:'rgba(201,168,76,0.1)', border:'1px solid rgba(201,168,76,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>📊</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'#e8e6df' }}>All variants (avg)</div>
                    <div style={{ fontSize:9.5, color:'#4a4a45', fontFamily:'Space Mono, monospace', marginTop:1 }}>
                      Average across all {variants.length} variants
                    </div>
                  </div>
                  {variant==='all' && <span style={{ fontSize:10, color:'#c9a84c' }}>●</span>}
                </div>

                {/* Chaque variante */}
                {variants.map((v: any) => {
                  const vKey     = typeof v === 'string' ? v : v.key
                  const vLabel   = typeof v === 'string' ? v : (v.label || vKey)
                  const vPts     = typeof v === 'object' ? v.data_points : 0
                  const vExact   = typeof v === 'object' ? v.has_daily_exact : false
                  const isActive = variant === vKey

                  // Parse le label pour l'icône
                  const hasStars  = vKey.match(/^(\d+)star/)
                  const hasRecomb = vKey.includes('recomb') && !vKey.includes('norecomb')
                  const isBase    = vKey === 'nostar_norecomb_noreforge'

                  const icon = isBase ? '✦' : hasStars ? `⭐${hasStars[1]}` : '🔹'
                  const accentColor = isBase ? '#c9a84c' : hasRecomb ? '#9b59b6' : '#2a78d6'

                  return (
                    <div
                      key={vKey}
                      onClick={() => changeVariant(vKey)}
                      style={{
                        display:'flex', alignItems:'center', gap:10, padding:'7px 10px',
                        borderRadius:7, cursor:'pointer', transition:'all 0.12s',
                        background: isActive ? accentColor+'0d' : 'transparent',
                        border: `1px solid ${isActive ? accentColor+'30' : 'rgba(255,255,255,0.04)'}`,
                      }}
                    >
                      {/* Icon */}
                      <div style={{ width:28, height:28, borderRadius:6, background:accentColor+'10', border:'1px solid '+accentColor+'20', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, flexShrink:0, fontFamily:'Space Mono, monospace', color:accentColor, fontWeight:700 }}>
                        {icon}
                      </div>

                      {/* Label */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:10.5, fontWeight:600, color: isActive ? '#e8e6df' : '#9b9b8f', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {vLabel}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                          <span style={{ fontSize:9, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>{vPts} pts</span>
                          {vExact && <span style={{ fontSize:8, color:'#1baf7a', fontFamily:'Space Mono, monospace', background:'rgba(27,175,122,0.08)', padding:'1px 5px', borderRadius:3 }}>NBT ✓</span>}
                        </div>
                      </div>

                      {/* Active indicator */}
                      {isActive && <span style={{ fontSize:10, color:accentColor, flexShrink:0 }}>●</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {!selected && (
        <div style={{ padding:'32px 20px', textAlign:'center' }}>
          <div style={{ fontSize:24, marginBottom:10, opacity:0.2 }}>🔍</div>
          <div style={{ fontSize:10.5, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>Search any item to see its price history</div>
          <div style={{ fontSize:9.5, color:'#2a2a28', fontFamily:'Space Mono, monospace', marginTop:4 }}>4781 items tracked · Bazaar + AH</div>
        </div>
      )}
    </div>
  )
}

// ─── Radar Item Card ──────────────────────────────────────────
function RadarCard({ item, type }: { item: RadarItem; type: 'positive'|'negative' }) {
  const isPos    = type === 'positive'
  const sigColor = SIGNAL_COLORS[item.signal] || (isPos?'#1baf7a':'#e34948')
  const confColor= CONF_COLORS[item.confidence] || '#c9a84c'
  const [hov, setHov] = useState(false)

  return (
    <div
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{
        background:   hov?'#141413':'#0f0f0e',
        border:       `1px solid ${hov?sigColor+'30':'rgba(255,255,255,0.06)'}`,
        borderLeft:   `3px solid ${sigColor}`,
        borderRadius: 9, padding:'13px 14px', marginBottom:8,
        transition:   'all 0.15s',
      }}
    >
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#e8e6df', marginBottom:2 }}>
            {item.item_name || item.item_id}
          </div>
          <div style={{ fontSize:9, color:'#4a4a45', fontFamily:'Space Mono, monospace' }}>{item.item_id}</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
          <span style={{ fontSize:9.5, fontFamily:'Space Mono, monospace', fontWeight:700, padding:'2px 8px', borderRadius:5, color:sigColor, background:sigColor+'12', border:'1px solid '+sigColor+'25' }}>
            {item.signal}
          </span>
          <span style={{ fontSize:8, color:confColor, fontFamily:'Space Mono, monospace', fontWeight:700 }}>
            {item.confidence}
          </span>
        </div>
      </div>

      {/* Reason */}
      <div style={{ fontSize:11, color:'#8b8980', lineHeight:1.6, marginBottom:8 }}>{item.reason}</div>

      {/* Drivers */}
      {item.drivers?.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
          {item.drivers.map((d, i) => (
            <span key={i} style={{ fontSize:9, padding:'2px 7px', borderRadius:4, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', color:'#6b6960', fontFamily:'Space Mono, monospace' }}>
              {DRIVER_LABELS[d] || d}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:9.5, fontFamily:'Space Mono, monospace' }}>
        <span style={{ color:'#3a3a38' }}>⏱ {item.timeframe}</span>
        <span style={{ color:sigColor, fontWeight:700 }}>{item.price_target}</span>
      </div>
    </div>
  )
}

// ─── Intelligence Vault ───────────────────────────────────────
function IntelligenceVault({ marketData, dataLoading }: {
  marketData: Record<string,string>; dataLoading: boolean
}) {
  let radar: RadarData = { positive: [], negative: [], summary: '' }
  try {
    const raw = marketData['radar'] || ''
    if (raw) radar = JSON.parse(raw)
  } catch {}

  const positive = Array.isArray(radar.positive) ? radar.positive.slice(0,10) : []
  const negative = Array.isArray(radar.negative) ? radar.negative.slice(0,10) : []

  return (
    <div style={{ background:'#0f0f0e', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:'20px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ fontSize:9, color:'#9b59b6', fontFamily:'Space Mono, monospace', letterSpacing:'0.14em', textTransform:'uppercase', fontWeight:700 }}>
          ⚡ Vault Intelligence
        </div>
        <div style={{ fontSize:8.5, color:'#3a3a38', fontFamily:'Space Mono, monospace', marginLeft:'auto' }}>Daily AI · patches × trends × events</div>
      </div>

      {/* Summary */}
      {radar.summary && (
        <div style={{ padding:'10px 14px', background:'rgba(155,89,182,0.05)', border:'1px solid rgba(155,89,182,0.1)', borderRadius:8, marginBottom:14, fontSize:11.5, color:'#9b9b8f', lineHeight:1.65 }}>
          {radar.summary}
        </div>
      )}

      {dataLoading ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'#2a2a28', fontSize:10, fontFamily:'Space Mono, monospace' }}>LOADING INTELLIGENCE...</div>
      ) : positive.length === 0 && negative.length === 0 ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'#2a2a28', fontSize:10, fontFamily:'Space Mono, monospace' }}>Run radar-agent to generate intelligence</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12, padding:'7px 12px', background:'rgba(27,175,122,0.05)', border:'1px solid rgba(27,175,122,0.1)', borderRadius:7 }}>
              <span style={{ fontSize:13 }}>📈</span>
              <span style={{ fontSize:9.5, fontWeight:700, color:'#1baf7a', fontFamily:'Space Mono, monospace', letterSpacing:'0.1em', textTransform:'uppercase' }}>
                Top Opportunities
              </span>
            </div>
            {positive.map((item, i) => <RadarCard key={i} item={item} type="positive" />)}
          </div>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12, padding:'7px 12px', background:'rgba(227,73,72,0.05)', border:'1px solid rgba(227,73,72,0.1)', borderRadius:7 }}>
              <span style={{ fontSize:13 }}>📉</span>
              <span style={{ fontSize:9.5, fontWeight:700, color:'#e34948', fontFamily:'Space Mono, monospace', letterSpacing:'0.1em', textTransform:'uppercase' }}>
                Risk Items
              </span>
            </div>
            {negative.map((item, i) => <RadarCard key={i} item={item} type="negative" />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Section ─────────────────────────────────────────────
export default function RadarSection({ marketData, dataLoading }: {
  marketData: Record<string,string>; dataLoading: boolean
}) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Header */}
      <div style={{ padding:'12px 16px', background:'linear-gradient(135deg,rgba(155,89,182,0.06),rgba(155,89,182,0.02))', border:'1px solid rgba(155,89,182,0.12)', borderRadius:10, display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:20 }}>📡</span>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#9b59b6', fontFamily:'Space Mono, monospace', letterSpacing:'0.1em' }}>MARKET RADAR</div>
          <div style={{ fontSize:10, color:'#3a3a38', marginTop:2 }}>Price explorer · 4781 items · Bazaar + AH · 3 years of history</div>
        </div>
        <div style={{ marginLeft:'auto', fontSize:8.5, color:'#3a3a38', fontFamily:'Space Mono, monospace', textAlign:'right' }}>
          Daily intelligence<br/>+ live charts
        </div>
      </div>

      {/* Item Explorer */}
      <ItemExplorer />

      {/* Intelligence Vault */}
      <IntelligenceVault marketData={marketData} dataLoading={dataLoading} />

    </div>
  )
}