// components/RadarSection.tsx
// Supabase direct client-side — zéro API route pour la recherche et l'historique
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Types ───────────────────────────────────────────────────
type SearchResult = { item_id: string; item_name: string; source: 'bazaar'|'ah'; variant_count: number }
type PricePoint   = { date: string; sell_price?: number; buy_price?: number; avg_price?: number; volume?: number }
type VariantMeta  = { key: string; label: string; data_points: number }
type RadarItem    = { item_id: string; item_name: string; signal: string; reason: string; drivers: string[]; timeframe: string; price_target: string; confidence: string }
type RadarData    = { positive: RadarItem[]; negative: RadarItem[]; summary: string }

// ─── Config ──────────────────────────────────────────────────
const PERIODS = ['1D','1W','1M','1Y','3Y']
const PERIOD_DAYS: Record<string,number> = { '1D':1,'1W':7,'1M':30,'1Y':365,'3Y':1095 }
const SIGNAL_COLORS: Record<string,string> = { BUY:'#1baf7a',INVEST:'#9b59b6',SELL:'#e34948',AVOID:'#e34948',WATCH:'#c9a84c' }
const CONF_COLORS:   Record<string,string> = { HIGH:'#1baf7a',MED:'#c9a84c',LOW:'#e34948' }
const DRIVER_LABELS: Record<string,string> = {
  patch_buff:'🔧 Patch Buff', patch_nerf:'🔧 Patch Nerf',
  supply_shock:'📦 Supply Shock', supply_increase:'📦 Supply↑',
  event_demand:'🎉 Event Demand', demand_drop:'📉 Demand↓', trend:'📈 Trend',
}

const fmt = (n: number) => {
  if (!n||isNaN(n)) return '—'
  if (n>=1e9) return (n/1e9).toFixed(2)+'B'
  if (n>=1e6) return (n/1e6).toFixed(1)+'M'
  if (n>=1e3) return (n/1e3).toFixed(1)+'K'
  return n.toFixed(0)
}
const fmtDate = (d: string) => {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) } catch { return d.slice(0,10) }
}
const toLabel = (id: string) => id.replace(/_/g,' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())

function buildVariantLabel(vk: string): string {
  if (!vk||vk==='nostar_norecomb_noreforge') return '✦ Base item'
  const parts: string[] = []
  const stars = vk.match(/^(\d+)star/)
  if (stars) parts.push(`⭐ ${stars[1]} stars`)
  if (vk.includes('_recomb')&&!vk.includes('norecomb')) parts.push('✦ Recomb')
  const ult = vk.match(/(ofa|soul_eater|last_stand|fatal_tempo|wise|inferno|bank|combo|jerry|swarm)/)
  if (ult) parts.push(`⚡ ${ult[1].toUpperCase().replace(/_/g,' ')}`)
  return parts.length>0 ? parts.join(' · ') : vk.slice(0,30)
}

// ─── Tooltip ─────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active||!payload?.length) return null
  const p = payload[0]?.payload
  return (
    <div style={{ background:'#0f0f0e', border:'1px solid rgba(201,168,76,0.2)', borderRadius:8, padding:'10px 14px', fontSize:11, fontFamily:'Space Mono, monospace' }}>
      <div style={{ color:'#c9a84c', marginBottom:5 }}>{fmtDate(label)||label?.slice(0,13)}</div>
      {p?.sell_price>0 && <div style={{ color:'#1baf7a' }}>Sell: {fmt(p.sell_price)}</div>}
      {p?.buy_price>0  && <div style={{ color:'#2a78d6' }}>Buy:  {fmt(p.buy_price)}</div>}
      {p?.avg_price>0  && <div style={{ color:'#c9a84c' }}>Avg:  {fmt(p.avg_price)}</div>}
      {p?.volume>0     && <div style={{ color:'#4a4a45', marginTop:4 }}>Vol: {Number(p.volume).toLocaleString()}</div>}
    </div>
  )
}

// ─── Item Explorer ────────────────────────────────────────────
function ItemExplorer() {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<SearchResult[]>([])
  const [catalog,  setCatalog]  = useState<SearchResult[]>([])
  const [selected, setSelected] = useState<SearchResult|null>(null)
  const [period,   setPeriod]   = useState('1M')
  const [history,  setHistory]  = useState<PricePoint[]>([])
  const [variants, setVariants] = useState<VariantMeta[]>([])
  const [variant,  setVariant]  = useState('all')
  const [loading,  setLoading]  = useState(false)
  const [showDrop, setShowDrop] = useState(false)
  const [catLoaded,setCatLoaded]= useState(false)

  const debounceRef  = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Ferme dropdown clic extérieur
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setShowDrop(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Charge le catalogue une seule fois au montage
  useEffect(() => {
    async function loadCatalog() {
      const { data } = await supabase
        .from('items_catalog')
        .select('item_id, item_name, source')
        .order('item_id')
      if (data) {
        setCatalog(data.map(r => ({ item_id: r.item_id, item_name: r.item_name || toLabel(r.item_id), source: r.source as 'bazaar'|'ah', variant_count: 1 })))
        setCatLoaded(true)
      }
    }
    loadCatalog()
  }, [])

  // Recherche locale — instantanée
  const search = useCallback((q: string) => {
    setQuery(q)
    clearTimeout(debounceRef.current)

    if (q.length < 1) { setResults([]); setShowDrop(false); return }

    debounceRef.current = setTimeout(() => {
      const term = q.trim().toUpperCase().replace(/\s+/g,'_').replace(/[^A-Z0-9_]/g,'')
      if (!term || catalog.length === 0) return

      // Filtre + tri : starts-with en premier, contains ensuite
      const startsWith = catalog.filter(r => r.item_id.startsWith(term))
      const contains   = catalog.filter(r => r.item_id.includes(term) && !r.item_id.startsWith(term))

      setResults([...startsWith, ...contains].slice(0, 25))
      setShowDrop(true)
    }, 50) // 50ms seulement car c'est local
  }, [catalog])

  // ── Historique direct Supabase ────────────────────────────
  const loadHistory = useCallback(async (item: SearchResult, p: string, v: string) => {
    setLoading(true)
    setHistory([])
    const days      = PERIOD_DAYS[p] || 30
    const startDate = new Date(Date.now() - days*86_400_000).toISOString().split('T')[0]
    const useScans  = p==='1D'||p==='1W'

    if (item.source==='bazaar') {
      const { data } = await supabase
        .from('price_history')
        .select('bucket_date,buy_price,sell_price,volume')
        .eq('item_id', item.item_id)
        .gte('bucket_date', startDate)
        .gt('sell_price', 0)
        .order('bucket_date', { ascending:true })

      setHistory((data||[]).map(d=>({ date:d.bucket_date, buy_price:Number(d.buy_price), sell_price:Number(d.sell_price), volume:Number(d.volume) })))
      setVariants([])
    } else {
      // Variantes disponibles
      const { data: varRows } = await supabase
        .from('price_history_ah')
        .select('variant_key')
        .eq('base_item_id', item.item_id)
        .in('granularity', ['DAILY','DAILY_EXACT','SCAN'])
        .gt('avg_price', 0)

      const varMap = new Map<string,number>()
      for (const r of varRows||[]) varMap.set(r.variant_key, (varMap.get(r.variant_key)||0)+1)
      const varList: VariantMeta[] = [
        ...Array.from(varMap.entries())
          .sort(([ak,av],[bk,bv])=>{
            if (ak==='nostar_norecomb_noreforge') return -1
            if (bk==='nostar_norecomb_noreforge') return 1
            return bv-av
          })
          .map(([key,count])=>({ key, label:buildVariantLabel(key), data_points:count }))
      ]
      setVariants(varList)

      // Données historiques
      let q2 = supabase
        .from('price_history_ah')
        .select('bucket_date,created_at,avg_price,volume,variant_key')
        .eq('base_item_id', item.item_id)
        .in('granularity', useScans ? ['SCAN'] : ['DAILY','DAILY_EXACT','MONTHLY'])
        .gt('avg_price', 0)
        .order(useScans ? 'created_at' : 'bucket_date', { ascending:true })
        .limit(useScans ? 2000 : 1500)

      if (useScans) q2 = q2.gte('created_at', new Date(Date.now()-days*86_400_000).toISOString())
      else          q2 = q2.gte('bucket_date', startDate)
      if (v&&v!=='all') q2 = q2.eq('variant_key', v)

      const { data: hist } = await q2

      // Agrège par date
      const byDate = new Map<string,{prices:number[];vols:number[]}>()
      for (const d of hist||[]) {
        const key = useScans ? (d.created_at||'').slice(0,13)+':00' : d.bucket_date
        if (!byDate.has(key)) byDate.set(key,{prices:[],vols:[]})
        byDate.get(key)!.prices.push(Number(d.avg_price))
        byDate.get(key)!.vols.push(Number(d.volume||0))
      }
      const pts: PricePoint[] = Array.from(byDate.entries())
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([date,{prices,vols}])=>({
          date,
          avg_price:  Math.round(prices.reduce((s,p)=>s+p,0)/prices.length),
          sell_price: Math.round(Math.min(...prices)),
          volume:     vols.reduce((s,v)=>s+v,0),
        }))
      setHistory(pts)
    }
    setLoading(false)
  }, [])

  function select(item: SearchResult) {
    setSelected(item)
    setQuery(item.item_name)
    setShowDrop(false)
    setResults([])
    setVariant('all')
    loadHistory(item, period, 'all')
  }

  function changePeriod(p: string) { setPeriod(p); if (selected) loadHistory(selected,p,variant) }
  function changeVariant(v: string) { setVariant(v); if (selected) loadHistory(selected,period,v) }

  const isBazaar  = selected?.source==='bazaar'
  const prices    = history.map(d=>d.sell_price||d.avg_price||0).filter(p=>p>0)
  const lastPrice = prices[prices.length-1]||0
  const firstPrice= prices[0]||0
  const minPrice  = prices.length?Math.min(...prices):0
  const maxPrice  = prices.length?Math.max(...prices):0
  const changePct = firstPrice>0 ? Math.round(((lastPrice-firstPrice)/firstPrice)*100) : 0

  return (
    <div style={{ background:'#0f0f0e', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:'20px' }}>
      <div style={{ fontSize:9, color:'#c9a84c', fontFamily:'Space Mono, monospace', letterSpacing:'0.14em', marginBottom:14, textTransform:'uppercase', fontWeight:700 }}>
        📊 Item Explorer — 4781 items tracked
      </div>

      {/* Search */}
      <div ref={containerRef} style={{ position:'relative', marginBottom:16 }}>
        <input
          value={query}
          onChange={e=>search(e.target.value)}
          onFocus={()=>query.length>=1&&results.length>0&&setShowDrop(true)}
          placeholder={catLoaded ? "Search any item... (chimera, jungle, necron, hyperion...)" : "Loading catalog..."}
          style={{ width:'100%', background:'#111110', border:'1px solid rgba(255,255,255,0.08)', borderRadius:9, padding:'11px 14px', color:'#e8e6df', fontFamily:'Space Grotesk, sans-serif', fontSize:13, outline:'none', boxSizing:'border-box' }}
        />
        {showDrop && results.length>0 && (
          <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#111110', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, maxHeight:280, overflowY:'auto', zIndex:200, boxShadow:'0 20px 50px rgba(0,0,0,0.9)' }}>
            {results.map((r,i)=>(
              <div key={i} onClick={()=>select(r)}
                style={{ padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid rgba(255,255,255,0.03)' }}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.04)')}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
              >
                <span style={{ fontSize:8, padding:'2px 6px', borderRadius:4, fontFamily:'Space Mono, monospace', fontWeight:700, color:r.source==='bazaar'?'#1baf7a':'#c9a84c', background:r.source==='bazaar'?'#1baf7a12':'#c9a84c12', border:`1px solid ${r.source==='bazaar'?'#1baf7a':'#c9a84c'}20`, flexShrink:0 }}>
                  {r.source.toUpperCase()}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, color:'#e8e6df', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.item_name}</div>
                  <div style={{ fontSize:9.5, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>{r.item_id}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <>
          {/* Period */}
          <div style={{ display:'flex', gap:3, background:'#111110', padding:3, borderRadius:7, width:'fit-content', marginBottom:14 }}>
            {PERIODS.map(p=>(
              <button key={p} onClick={()=>changePeriod(p)} style={{ padding:'4px 12px', borderRadius:5, border:'none', cursor:'pointer', background:period===p?'#1e1e1c':'transparent', color:period===p?'#e8e6df':'#4a4a45', fontSize:10.5, fontFamily:'Space Mono, monospace', fontWeight:700, transition:'all 0.15s' }}>{p}</button>
            ))}
          </div>

          {/* Stats */}
          {history.length>0&&(
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
              {[
                { label:'Current', value:fmt(lastPrice),  color:'#e8e6df' },
                { label:'Change',  value:(changePct>=0?'+':'')+changePct+'%', color:changePct>=0?'#1baf7a':'#e34948' },
                { label:'High',    value:fmt(maxPrice),   color:'#1baf7a' },
                { label:'Low',     value:fmt(minPrice),   color:'#e34948' },
              ].map((s,i)=>(
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
                <div style={{ display:'flex', gap:5 }}>{[0,1,2].map(i=><div key={i} style={{ width:5,height:5,borderRadius:'50%',background:'#c9a84c',opacity:0.7,animation:`rp 1.2s ${i*0.2}s infinite` }}/>)}</div>
                <div style={{ fontSize:9.5, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>LOADING...</div>
              </div>
            ) : history.length===0 ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
                <div style={{ fontSize:10, color:'#2a2a28', fontFamily:'Space Mono, monospace' }}>NO DATA FOR THIS PERIOD</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top:5,right:5,bottom:5,left:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tickFormatter={d=>fmtDate(d)||d?.slice(11,13)+'h'} tick={{ fill:'#3a3a38',fontSize:9,fontFamily:'Space Mono, monospace' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={fmt} tick={{ fill:'#3a3a38',fontSize:9,fontFamily:'Space Mono, monospace' }} tickLine={false} axisLine={false} width={55} />
                  <Tooltip content={<ChartTooltip/>} />
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
          <div style={{ marginTop:8, fontSize:9.5, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>
            {history.length} pts · {selected.item_id}
          </div>

          {/* Variants */}
          {!isBazaar && variants.length>0 && (
            <div style={{ marginTop:16, borderTop:'1px solid rgba(255,255,255,0.05)', paddingTop:14 }}>
              <div style={{ fontSize:9, color:'#4a4a45', fontFamily:'Space Mono, monospace', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>
                {variants.length} variants tracked
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:260, overflowY:'auto' }}>
                {/* All */}
                <div onClick={()=>changeVariant('all')} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, cursor:'pointer', background:variant==='all'?'rgba(201,168,76,0.08)':'transparent', border:`1px solid ${variant==='all'?'rgba(201,168,76,0.2)':'rgba(255,255,255,0.04)'}` }}>
                  <div style={{ width:30,height:30,borderRadius:7,background:'rgba(201,168,76,0.1)',border:'1px solid rgba(201,168,76,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0 }}>📊</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11.5,fontWeight:600,color:variant==='all'?'#e8e6df':'#9b9b8f' }}>All variants — trend overview</div>
                    <div style={{ fontSize:9.5,color:'#3a3a38',fontFamily:'Space Mono, monospace',marginTop:1 }}>Average across {variants.length} variants</div>
                  </div>
                  {variant==='all'&&<span style={{ color:'#c9a84c',fontSize:10 }}>●</span>}
                </div>
                {/* Each variant */}
                {variants.map(v=>{
                  const isActive  = variant===v.key
                  const isBase    = v.key==='nostar_norecomb_noreforge'
                  const hasStars  = v.key.match(/^(\d+)star/)
                  const hasRecomb = v.key.includes('_recomb')&&!v.key.includes('norecomb')
                  const accent    = isBase?'#c9a84c':hasRecomb?'#9b59b6':hasStars?'#2a78d6':'#4a4a45'
                  const icon      = isBase?'✦':hasStars?`${hasStars[1]}⭐`:'🔹'
                  return (
                    <div key={v.key} onClick={()=>changeVariant(v.key)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, cursor:'pointer', transition:'all 0.12s', background:isActive?accent+'0d':'transparent', border:`1px solid ${isActive?accent+'30':'rgba(255,255,255,0.04)'}` }}>
                      <div style={{ width:30,height:30,borderRadius:7,background:accent+'10',border:'1px solid '+accent+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,flexShrink:0,fontFamily:'Space Mono, monospace',color:accent,fontWeight:700 }}>{icon}</div>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:11,fontWeight:600,color:isActive?'#e8e6df':'#9b9b8f',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{v.label}</div>
                        <div style={{ fontSize:9.5,color:'#3a3a38',fontFamily:'Space Mono, monospace',marginTop:1 }}>{v.data_points} pts</div>
                      </div>
                      {isActive&&<span style={{ color:accent,fontSize:10,flexShrink:0 }}>●</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ padding:'36px 20px', textAlign:'center' }}>
          <div style={{ fontSize:28,marginBottom:12,opacity:0.15 }}>🔍</div>
          <div style={{ fontSize:11,color:'#3a3a38',fontFamily:'Space Mono, monospace',marginBottom:4 }}>Search any item to view price history</div>
          <div style={{ fontSize:9.5,color:'#2a2a28',fontFamily:'Space Mono, monospace' }}>2119 Bazaar · 2662 AH · 1429 variants tracked</div>
        </div>
      )}
      <style>{`@keyframes rp{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.6);opacity:1}}`}</style>
    </div>
  )
}

// ─── Radar Card ───────────────────────────────────────────────
function RadarCard({ item, type }: { item: RadarItem; type:'positive'|'negative' }) {
  const sigColor  = SIGNAL_COLORS[item.signal]||(type==='positive'?'#1baf7a':'#e34948')
  const confColor = CONF_COLORS[item.confidence]||'#c9a84c'
  const [hov,setHov] = useState(false)
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:hov?'#141413':'#0f0f0e', border:`1px solid ${hov?sigColor+'30':'rgba(255,255,255,0.06)'}`, borderLeft:`3px solid ${sigColor}`, borderRadius:9, padding:'13px 14px', marginBottom:8, transition:'all 0.15s' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:8 }}>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:12,fontWeight:700,color:'#e8e6df',marginBottom:2 }}>{item.item_name||item.item_id}</div>
          <div style={{ fontSize:9,color:'#4a4a45',fontFamily:'Space Mono, monospace' }}>{item.item_id}</div>
        </div>
        <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3,flexShrink:0 }}>
          <span style={{ fontSize:9.5,fontFamily:'Space Mono, monospace',fontWeight:700,padding:'2px 8px',borderRadius:5,color:sigColor,background:sigColor+'12',border:'1px solid '+sigColor+'25' }}>{item.signal}</span>
          <span style={{ fontSize:8,color:confColor,fontFamily:'Space Mono, monospace',fontWeight:700 }}>{item.confidence}</span>
        </div>
      </div>
      <div style={{ fontSize:11,color:'#8b8980',lineHeight:1.6,marginBottom:8 }}>{item.reason}</div>
      {item.drivers?.length>0&&(
        <div style={{ display:'flex',flexWrap:'wrap',gap:4,marginBottom:8 }}>
          {item.drivers.map((d,i)=>(
            <span key={i} style={{ fontSize:9,padding:'2px 7px',borderRadius:4,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',color:'#6b6960',fontFamily:'Space Mono, monospace' }}>
              {DRIVER_LABELS[d]||d}
            </span>
          ))}
        </div>
      )}
      <div style={{ display:'flex',justifyContent:'space-between',fontSize:9.5,fontFamily:'Space Mono, monospace' }}>
        <span style={{ color:'#3a3a38' }}>⏱ {item.timeframe}</span>
        <span style={{ color:sigColor,fontWeight:700 }}>{item.price_target}</span>
      </div>
    </div>
  )
}

// ─── Intelligence Vault ───────────────────────────────────────
function IntelligenceVault({ marketData, dataLoading }: { marketData:Record<string,string>; dataLoading:boolean }) {
  let radar: RadarData = { positive:[],negative:[],summary:'' }
  try { const raw=marketData['radar']||''; if(raw) radar=JSON.parse(raw) } catch {}
  const positive = Array.isArray(radar.positive)?radar.positive.slice(0,10):[]
  const negative = Array.isArray(radar.negative)?radar.negative.slice(0,10):[]
  return (
    <div style={{ background:'#0f0f0e', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:'20px' }}>
      <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:14 }}>
        <div style={{ fontSize:9,color:'#9b59b6',fontFamily:'Space Mono, monospace',letterSpacing:'0.14em',textTransform:'uppercase',fontWeight:700 }}>⚡ Vault Intelligence</div>
        <div style={{ fontSize:8.5,color:'#3a3a38',fontFamily:'Space Mono, monospace',marginLeft:'auto' }}>Daily · patches × trends × events</div>
      </div>
      {radar.summary&&(
        <div style={{ padding:'10px 14px',background:'rgba(155,89,182,0.05)',border:'1px solid rgba(155,89,182,0.1)',borderRadius:8,marginBottom:14,fontSize:11.5,color:'#9b9b8f',lineHeight:1.65 }}>{radar.summary}</div>
      )}
      {dataLoading?(
        <div style={{ textAlign:'center',padding:'3rem',color:'#2a2a28',fontSize:10,fontFamily:'Space Mono, monospace' }}>LOADING...</div>
      ):positive.length===0&&negative.length===0?(
        <div style={{ textAlign:'center',padding:'3rem',color:'#2a2a28',fontSize:10,fontFamily:'Space Mono, monospace' }}>Run radar-agent to generate intelligence</div>
      ):(
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16 }}>
          <div>
            <div style={{ display:'flex',alignItems:'center',gap:7,marginBottom:12,padding:'7px 12px',background:'rgba(27,175,122,0.05)',border:'1px solid rgba(27,175,122,0.1)',borderRadius:7 }}>
              <span style={{ fontSize:13 }}>📈</span>
              <span style={{ fontSize:9.5,fontWeight:700,color:'#1baf7a',fontFamily:'Space Mono, monospace',letterSpacing:'0.1em',textTransform:'uppercase' }}>Top Opportunities</span>
            </div>
            {positive.map((item,i)=><RadarCard key={i} item={item} type="positive"/>)}
          </div>
          <div>
            <div style={{ display:'flex',alignItems:'center',gap:7,marginBottom:12,padding:'7px 12px',background:'rgba(227,73,72,0.05)',border:'1px solid rgba(227,73,72,0.1)',borderRadius:7 }}>
              <span style={{ fontSize:13 }}>📉</span>
              <span style={{ fontSize:9.5,fontWeight:700,color:'#e34948',fontFamily:'Space Mono, monospace',letterSpacing:'0.1em',textTransform:'uppercase' }}>Risk Items</span>
            </div>
            {negative.map((item,i)=><RadarCard key={i} item={item} type="negative"/>)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function RadarSection({ marketData, dataLoading }: { marketData:Record<string,string>; dataLoading:boolean }) {
  return (
    <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
      <div style={{ padding:'12px 16px',background:'linear-gradient(135deg,rgba(155,89,182,0.06),rgba(155,89,182,0.02))',border:'1px solid rgba(155,89,182,0.12)',borderRadius:10,display:'flex',alignItems:'center',gap:12 }}>
        <span style={{ fontSize:20 }}>📡</span>
        <div>
          <div style={{ fontSize:11,fontWeight:700,color:'#9b59b6',fontFamily:'Space Mono, monospace',letterSpacing:'0.1em' }}>MARKET RADAR</div>
          <div style={{ fontSize:10,color:'#3a3a38',marginTop:2 }}>Price explorer · 4781 items · Bazaar + AH · up to 3 years</div>
        </div>
        <div style={{ marginLeft:'auto',fontSize:8.5,color:'#3a3a38',fontFamily:'Space Mono, monospace',textAlign:'right' }}>Daily intelligence<br/>+ live charts</div>
      </div>
      <ItemExplorer/>
      <IntelligenceVault marketData={marketData} dataLoading={dataLoading}/>
    </div>
  )
}