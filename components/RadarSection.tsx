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
type VariantMeta  = { key: string; label: string; data_points: number; color: string }
type RadarItem    = { item_id: string; item_name: string; signal: string; reason: string; drivers: string[]; timeframe: string; price_target: string; confidence: string }
type LongTermMover = { item_id: string; avg_recent_year: number; avg_prior_year: number; change_yoy_pct: number; years_of_data: number }
type LongTermMovers = { gainers: LongTermMover[]; decliners: LongTermMover[]; pool_size: number }
type RadarData    = { positive: RadarItem[]; negative: RadarItem[]; summary: string; long_term_movers?: LongTermMovers }

// Fixed-order categorical palette (dark-mode steps from the validated reference
// palette — run through scripts/validate_palette.js before touching these).
// Slot 0 is reserved for the always-on "General" line; variants get slots 1+ in
// the order they appear in the (stable-sorted) variant list, never by toggle
// order, so a variant's color never shifts when a different variant is toggled.
const CHART_PALETTE = ['#3987e5','#d95926','#199e70','#c98500','#d55181','#008300','#9085e9','#e66767']

// ─── Config ──────────────────────────────────────────────────
// 'ALL' covers the real depth already in price_history/price_history_ah --
// confirmed live (30/31 juillet, Bloc 5) : plus ancienne ligne réelle
// 2019-06-19, donc ~7.1 ans, pas seulement les "3 years" annoncés jusque-là
// dans le header. 99999 jours en borne basse pour 'ALL' plutôt qu'un calcul
// dynamique de la vraie date de départ -- gte() sur une date antérieure à
// toute donnée réelle revient simplement à ne pas filtrer, sans requête
// supplémentaire pour connaître la date exacte de la ligne la plus ancienne.
const PERIODS = ['1D','1W','1M','1Y','3Y','ALL']
const PERIOD_DAYS: Record<string,number> = { '1D':1,'1W':7,'1M':30,'1Y':365,'3Y':1095,'ALL':99999 }
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
  if (!vk||vk==='__all_variants_blended__') return '✦ Blended average'
  const parts: string[] = []
  const stars = vk.match(/^(\d+)star/)
  if (stars) parts.push(`⭐ ${stars[1]} stars`)
  if (vk.includes('_recomb')&&!vk.includes('norecomb')) parts.push('✦ Recomb')
  const ult = vk.match(/(ofa|soul_eater|last_stand|fatal_tempo|wise|inferno|bank|combo|jerry|swarm)/)
  if (ult) parts.push(`⚡ ${ult[1].toUpperCase().replace(/_/g,' ')}`)
  return parts.length>0 ? parts.join(' · ') : vk.slice(0,30)
}

// ─── Tooltip ─────────────────────────────────────────────────
// Generic over however many <Line> series are currently on the chart (the
// bazaar Sell/Buy pair, or General + N toggled AH variants) — reads name/color
// straight off each Line's own props via Recharts' payload, no hardcoded fields.
function ChartTooltip({ active, payload, label }: any) {
  if (!active||!payload?.length) return null
  return (
    <div style={{ background:'#0f0f0e', border:'1px solid rgba(201,168,76,0.2)', borderRadius:8, padding:'10px 14px', fontSize:11, fontFamily:'Space Mono, monospace' }}>
      <div style={{ color:'#c9a84c', marginBottom:5 }}>{fmtDate(label)||label?.slice(0,13)}</div>
      {payload.filter((p:any)=>p.value!=null).map((p:any,i:number)=>(
        <div key={i} style={{ color:p.color }}>{p.name}: {fmt(p.value)}</div>
      ))}
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
  const [variants, setVariants] = useState<VariantMeta[]>([])
  // seriesMap['general'] is the item's blended curve (always loaded); every other
  // key is a variant_key currently overlaid on top of it. Kept separate from
  // `activeVariants` so toggling a variant off doesn't drop its fetched series —
  // toggling back on is instant instead of re-querying Supabase.
  const [seriesMap,      setSeriesMap]      = useState<Record<string,PricePoint[]>>({})
  const [activeVariants, setActiveVariants] = useState<string[]>([])
  const [loading,  setLoading]  = useState(false)
  const [showDrop, setShowDrop] = useState(false)
  const [catLoaded,setCatLoaded]= useState(false)
  const [catStats, setCatStats] = useState({ total: 0, bazaar: 0, ah: 0, variantRows: 0 })

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
      const [{ data }, { count: variantRows }] = await Promise.all([
        supabase.from('items_catalog').select('item_id, item_name, source').order('item_id'),
        supabase.from('price_history_ah_variants').select('*', { count: 'exact', head: true }),
      ])
      if (data) {
        setCatalog(data.map(r => ({ item_id: r.item_id, item_name: r.item_name || toLabel(r.item_id), source: r.source as 'bazaar'|'ah', variant_count: 1 })))
        setCatStats({
          total: data.length,
          bazaar: data.filter(r => r.source === 'bazaar').length,
          ah: data.filter(r => r.source === 'ah').length,
          variantRows: variantRows ?? 0,
        })
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

  // ── Une série de prix, filtrée par variant_key ou non (undefined = agrégat
  //    "General" toutes variantes confondues, la même requête qu'avant) ──────
  const loadSeries = useCallback(async (item: SearchResult, p: string, variantKey?: string): Promise<PricePoint[]> => {
    const days      = PERIOD_DAYS[p] || 30
    const startDate = new Date(Date.now() - days*86_400_000).toISOString().split('T')[0]
    const useScans  = p==='1D'||p==='1W'

    if (item.source==='bazaar') {
      // Limite explicite -- sans elle, PostgREST retombe sur son défaut serveur
      // (1000 lignes), qui aurait silencieusement tronqué 'ALL'/'3Y' sur un item
      // à profondeur réelle max (~2000 lignes, confirmé en base) puisque le tri
      // est ascendant : les lignes les PLUS RÉCENTES auraient été coupées, pas
      // les plus anciennes. 3000 couvre confortablement la profondeur réelle.
      const { data } = await supabase
        .from('price_history')
        .select('bucket_date,buy_price,sell_price,volume')
        .eq('item_id', item.item_id)
        .gte('bucket_date', startDate)
        .gt('sell_price', 0)
        .order('bucket_date', { ascending:true })
        .limit(3000)

      return (data||[]).map(d=>({ date:d.bucket_date, buy_price:Number(d.buy_price), sell_price:Number(d.sell_price), volume:Number(d.volume) }))
    }

    // Une variante précise n'existe jamais dans price_history_ah -- cette table
    // ne reçoit plus que le placeholder blended (__all_variants_blended__)
    // depuis la refonte ah-aggregate (même bug que celui corrigé sur ah-collect
    // le 28 juillet : un consommateur de l'ancien schéma manqué par la passe de
    // renommage). Les vraies séries par variante vivent dans
    // price_history_ah_variants (1 ligne par variant_key par jour, pas de
    // granularité SCAN/intraday là-dedans -- le repli 1D/1W en intraday réel
    // reste donc réservé au général, qui continue de lire price_history_ah).
    let hist: { bucket_date: string; created_at?: string; avg_price: number; volume: number; variant_key: string }[] | null

    if (variantKey) {
      const { data } = await supabase
        .from('price_history_ah_variants')
        .select('bucket_date,avg_price,volume,variant_key')
        .eq('base_item_id', item.item_id)
        .eq('variant_key', variantKey)
        .gt('avg_price', 0)
        .gte('bucket_date', startDate)
        .order('bucket_date', { ascending:true })
        .limit(1500)
      hist = data
    } else {
      // Limite relevée 1500->3000 (Bloc 5, 30/31 juillet) -- la profondeur
      // réelle max d'un item bien suivi dépasse 2300 lignes DAILY (~7.1 ans
      // depuis 2019-06-19, confirmé en base), donc 1500 tronquait déjà
      // silencieusement 'ALL'/'3Y' pour tout item ancien, en coupant les
      // lignes les plus RÉCENTES (tri ascendant + limite).
      let q = supabase
        .from('price_history_ah')
        .select('bucket_date,created_at,avg_price,volume,variant_key')
        .eq('base_item_id', item.item_id)
        .in('granularity', useScans ? ['SCAN'] : ['DAILY','DAILY_EXACT','MONTHLY'])
        .gt('avg_price', 0)
        .order(useScans ? 'created_at' : 'bucket_date', { ascending:true })
        .limit(useScans ? 2000 : 3000)

      if (useScans) q = q.gte('created_at', new Date(Date.now()-days*86_400_000).toISOString())
      else          q = q.gte('bucket_date', startDate)

      const { data } = await q
      hist = data
    }

    const byDate = new Map<string,{prices:number[];vols:number[]}>()
    for (const d of hist||[]) {
      // price_history_ah_variants n'a pas de granularité intraday (created_at) --
      // une variante précise reste donc groupée par jour même en période 1D/1W,
      // contrairement au général qui a un vrai historique SCAN par heure.
      const key = (useScans && d.created_at) ? d.created_at.slice(0,13)+':00' : d.bucket_date
      if (!byDate.has(key)) byDate.set(key,{prices:[],vols:[]})
      byDate.get(key)!.prices.push(Number(d.avg_price))
      byDate.get(key)!.vols.push(Number(d.volume||0))
    }
    return Array.from(byDate.entries())
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([date,{prices,vols}])=>({
        date,
        avg_price: Math.round(prices.reduce((s,p)=>s+p,0)/prices.length),
        sell_price:Math.round(Math.min(...prices)),
        volume:    vols.reduce((s,v)=>s+v,0),
      }))
  }, [])

  // ── Sélection d'un item : charge le général + la liste des variantes ─────
  async function select(item: SearchResult) {
    setSelected(item)
    setQuery(item.item_name)
    setShowDrop(false)
    setResults([])
    setActiveVariants([])
    setVariants([])
    setLoading(true)

    const general = await loadSeries(item, period)
    setSeriesMap({ general })

    if (item.source==='ah') {
      // price_history_ah_variants, jamais price_history_ah -- même bug que
      // ah-collect corrigé le 28 juillet : price_history_ah ne reçoit plus que
      // le placeholder blended depuis la refonte ah-aggregate, donc cette
      // requête ne remontait jamais de vraies variantes. Bornée aux 90 derniers
      // jours pour éviter de tirer tout l'historique d'un item populaire juste
      // pour énumérer ses clés de variante.
      const ninetyDaysAgo = new Date(Date.now() - 90*86_400_000).toISOString().split('T')[0]
      const { data: varRows } = await supabase
        .from('price_history_ah_variants')
        .select('variant_key')
        .eq('base_item_id', item.item_id)
        .gt('avg_price', 0)
        .gte('bucket_date', ninetyDaysAgo)

      const varCount = new Map<string,number>()
      for (const r of varRows||[]) varCount.set(r.variant_key, (varCount.get(r.variant_key)||0)+1)
      const ordered = Array.from(varCount.entries()).sort(([ak,av],[bk,bv])=>{
        if (ak==='__all_variants_blended__') return -1
        if (bk==='__all_variants_blended__') return 1
        return bv-av
      })
      // Slot 0 of CHART_PALETTE is reserved for General — variants get slot
      // (index+1), by their position in this stable-sorted list, so a given
      // variant always renders in the same color regardless of toggle order.
      setVariants(ordered.map(([key,count],i)=>({
        key, label:buildVariantLabel(key), data_points:count,
        color: CHART_PALETTE[(i+1) % CHART_PALETTE.length],
      })))
    }
    setLoading(false)
  }

  async function changePeriod(p: string) {
    setPeriod(p)
    if (!selected) return
    setLoading(true)
    const keys = ['general', ...activeVariants]
    const loaded = await Promise.all(keys.map(k => loadSeries(selected, p, k==='general'?undefined:k)))
    const next: Record<string,PricePoint[]> = {}
    keys.forEach((k,i) => { next[k] = loaded[i] })
    setSeriesMap(next)
    setLoading(false)
  }

  async function toggleVariant(key: string) {
    if (!selected) return
    if (activeVariants.includes(key)) {
      setActiveVariants(av => av.filter(k => k!==key))
      return
    }
    setActiveVariants(av => [...av, key])
    if (!seriesMap[key]) {
      const pts = await loadSeries(selected, period, key)
      setSeriesMap(prev => ({ ...prev, [key]: pts }))
    }
  }

  const isBazaar = selected?.source==='bazaar'

  // ── Fusionne toutes les séries actives (general + variantes cochées) en
  //    lignes larges { date, general, [variantKey]: price... } pour Recharts ──
  const activeSeriesKeys = isBazaar ? [] : ['general', ...activeVariants]
  const chartData = (() => {
    if (isBazaar) return seriesMap.general || []
    const dateSet = new Set<string>()
    activeSeriesKeys.forEach(k => (seriesMap[k]||[]).forEach(p => dateSet.add(p.date)))
    return Array.from(dateSet).sort().map(date => {
      const row: any = { date }
      activeSeriesKeys.forEach(k => {
        const pt = (seriesMap[k]||[]).find(p => p.date===date)
        if (pt) row[k] = pt.sell_price || pt.avg_price || null
      })
      return row
    })
  })()

  const general   = seriesMap.general || []
  const prices    = general.map(d=>d.sell_price||d.avg_price||0).filter(p=>p>0)
  const lastPrice = prices[prices.length-1]||0
  const firstPrice= prices[0]||0
  const minPrice  = prices.length?Math.min(...prices):0
  const maxPrice  = prices.length?Math.max(...prices):0
  const changePct = firstPrice>0 ? Math.round(((lastPrice-firstPrice)/firstPrice)*100) : 0

  return (
    <div style={{ background:'#0f0f0e', border:'1px solid rgba(201,168,76,0.2)', boxShadow:'0 0 20px rgba(201,168,76,0.06)', borderRadius:12, padding:'20px' }}>
      <div style={{ fontSize:9, color:'#c9a84c', fontFamily:"'Press Start 2P', monospace", letterSpacing:'0.03em', marginBottom:14, textShadow:'0 0 10px rgba(201,168,76,0.4)' }}>
        📊 ITEM EXPLORER — {catStats.total || '…'} ITEMS
      </div>

      {/* Search */}
      <div ref={containerRef} style={{ position:'relative', marginBottom:16 }}>
        <input
          value={query}
          onChange={e=>search(e.target.value)}
          onFocus={()=>query.length>=1&&results.length>0&&setShowDrop(true)}
          placeholder={catLoaded ? "Search any item... (chimera, jungle, necron, hyperion...)" : "Loading catalog..."}
          style={{ width:'100%', background:'#111110', border:'1px solid rgba(201,168,76,0.08)', borderRadius:9, padding:'11px 14px', color:'#e8e6df', fontFamily:'Space Grotesk, sans-serif', fontSize:13, outline:'none', boxSizing:'border-box' }}
        />
        {showDrop && results.length>0 && (
          <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#111110', border:'1px solid rgba(201,168,76,0.08)', borderRadius:10, maxHeight:280, overflowY:'auto', zIndex:200, boxShadow:'0 20px 50px rgba(0,0,0,0.9)' }}>
            {results.map((r,i)=>(
              <div key={i} onClick={()=>select(r)}
                style={{ padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid rgba(201,168,76,0.03)' }}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.04)')}
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

          {/* Stats — always the General curve, even when variants are overlaid */}
          {general.length>0&&(
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

          {/* Legend — always present once 2+ series are on screen (General
              plus any toggled variants); identity is never color-only since
              each swatch is paired with its label. */}
          {!isBazaar && activeVariants.length>0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:9.5, fontFamily:'Space Mono, monospace', color:'#9b9b8f' }}>
                <span style={{ width:9, height:2, background:CHART_PALETTE[0], display:'inline-block' }} /> General
              </div>
              {activeVariants.map(vk=>{
                const v = variants.find(x=>x.key===vk)
                if (!v) return null
                return (
                  <div key={vk} style={{ display:'flex', alignItems:'center', gap:5, fontSize:9.5, fontFamily:'Space Mono, monospace', color:'#9b9b8f' }}>
                    <span style={{ width:9, height:2, background:v.color, display:'inline-block' }} /> {v.label}
                  </div>
                )
              })}
            </div>
          )}

          {/* Chart */}
          <div style={{ height:200 }}>
            {loading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:10 }}>
                <div style={{ display:'flex', gap:5 }}>{[0,1,2].map(i=><div key={i} style={{ width:5,height:5,borderRadius:'50%',background:'#c9a84c',opacity:0.7,animation:`rp 1.2s ${i*0.2}s infinite` }}/>)}</div>
                <div style={{ fontSize:9.5, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>LOADING...</div>
              </div>
            ) : chartData.length===0 ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
                <div style={{ fontSize:10, color:'#2a2a28', fontFamily:'Space Mono, monospace' }}>NO DATA FOR THIS PERIOD</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top:5,right:5,bottom:5,left:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,168,76,0.04)" />
                  <XAxis dataKey="date" tickFormatter={d=>fmtDate(d)||d?.slice(11,13)+'h'} tick={{ fill:'#3a3a38',fontSize:9,fontFamily:'Space Mono, monospace' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={fmt} tick={{ fill:'#3a3a38',fontSize:9,fontFamily:'Space Mono, monospace' }} tickLine={false} axisLine={false} width={55} />
                  <Tooltip content={<ChartTooltip/>} />
                  {isBazaar ? (
                    <>
                      <Line dataKey="sell_price" stroke="#1baf7a" strokeWidth={2} dot={false} name="Sell" />
                      <Line dataKey="buy_price"  stroke="#2a78d6" strokeWidth={1.5} dot={false} name="Buy" strokeDasharray="4 2" />
                    </>
                  ) : (
                    <>
                      <Line dataKey="general" stroke={CHART_PALETTE[0]} strokeWidth={2} dot={false} name="General" connectNulls />
                      {activeVariants.map(vk=>{
                        const v = variants.find(x=>x.key===vk)
                        if (!v) return null
                        return <Line key={vk} dataKey={vk} stroke={v.color} strokeWidth={1.5} dot={false} name={v.label} connectNulls strokeDasharray="4 2" />
                      })}
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Meta */}
          <div style={{ marginTop:8, fontSize:9.5, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>
            {general.length} pts · {selected.item_id}
          </div>

          {/* Variants — multi-toggle, each overlays its own curve on top of
              General instead of replacing it. Color is fixed per variant
              (assigned once from its position in this list), so toggling one
              off never repaints the others still active. */}
          {!isBazaar && variants.length>0 && (
            <div style={{ marginTop:16, borderTop:'1px solid rgba(201,168,76,0.05)', paddingTop:14 }}>
              <div style={{ fontSize:9, color:'#4a4a45', fontFamily:'Space Mono, monospace', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>
                {variants.length} variants tracked · click to overlay on the general curve
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:260, overflowY:'auto' }}>
                {variants.map(v=>{
                  const isActive = activeVariants.includes(v.key)
                  const isBase   = v.key==='__all_variants_blended__'
                  const hasStars = v.key.match(/^(\d+)star/)
                  const icon     = isBase?'✦':hasStars?`${hasStars[1]}⭐`:'🔹'
                  return (
                    <div key={v.key} onClick={()=>toggleVariant(v.key)} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, cursor:'pointer', transition:'all 0.12s', background:isActive?v.color+'12':'transparent', border:`1px solid ${isActive?v.color+'40':'rgba(201,168,76,0.04)'}` }}>
                      <div style={{
                        width:18, height:18, borderRadius:4, flexShrink:0,
                        border:`1.5px solid ${isActive?v.color:'rgba(201,168,76,0.25)'}`,
                        background:isActive?v.color:'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#0a0a09', fontWeight:900,
                      }}>{isActive?'✓':''}</div>
                      <span style={{ width:26,height:26,borderRadius:6,background:v.color+'10',border:'1px solid '+v.color+'25',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,flexShrink:0,fontFamily:'Space Mono, monospace',color:v.color,fontWeight:700 }}>{icon}</span>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:11,fontWeight:600,color:isActive?'#e8e6df':'#9b9b8f',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{v.label}</div>
                        <div style={{ fontSize:9.5,color:'#3a3a38',fontFamily:'Space Mono, monospace',marginTop:1 }}>{v.data_points} pts</div>
                      </div>
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
          <div style={{ fontSize:9.5,color:'#2a2a28',fontFamily:'Space Mono, monospace' }}>{catStats.bazaar} Bazaar · {catStats.ah} AH · {fmt(catStats.variantRows)} variant price points tracked</div>
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
      style={{ background:hov?'#141413':'#0f0f0e', border:`1px solid ${hov?sigColor+'50':'rgba(201,168,76,0.1)'}`, borderLeft:`3px solid ${sigColor}`, borderRadius:9, padding:'13px 14px', marginBottom:8, transition:'all 0.15s', boxShadow:hov?`0 0 16px ${sigColor}20`:'none' }}>
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
            <span key={i} style={{ fontSize:9,padding:'2px 7px',borderRadius:4,background:'rgba(201,168,76,0.04)',border:'1px solid rgba(201,168,76,0.07)',color:'#6b6960',fontFamily:'Space Mono, monospace' }}>
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

// ─── Long-Term Movers (Bloc 5.3/5.4, 31 juillet) ──────────────
// Rendu purement à partir de données calculées en SQL/JS côté cron (voir
// computeLongTermMovers dans radar-agent/route.ts) -- aucun texte généré
// par Claude ici, juste les vrais chiffres année N vs N-1.
function MoverRow({ m, positive }: { m: LongTermMover; positive: boolean }) {
  const color = positive ? '#1baf7a' : '#e34948'
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', borderRadius:7, background:'#111110', marginBottom:6 }}>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:11, color:'#e8e6df', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{toLabel(m.item_id)}</div>
        <div style={{ fontSize:9, color:'#4a4a45', fontFamily:'Space Mono, monospace' }}>{m.years_of_data}y tracked · {fmt(m.avg_prior_year)} → {fmt(m.avg_recent_year)}</div>
      </div>
      <div style={{ fontSize:12, fontWeight:700, color, fontFamily:'Space Mono, monospace', flexShrink:0, marginLeft:10 }}>
        {m.change_yoy_pct>=0?'+':''}{m.change_yoy_pct}%
      </div>
    </div>
  )
}

function LongTermMoversSection({ movers }: { movers?: LongTermMovers }) {
  if (!movers || movers.pool_size===0) return null
  return (
    <div style={{ marginTop:16, borderTop:'1px solid rgba(155,89,182,0.1)', paddingTop:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <span style={{ fontSize:9, fontWeight:700, color:'#9b59b6', fontFamily:"'Press Start 2P', monospace", letterSpacing:'0.03em' }}>📆 LONG-TERM MOVERS</span>
        <span style={{ fontSize:8.5, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>year-over-year · {movers.pool_size} long-tracked items analyzed</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div>
          <div style={{ fontSize:9, color:'#4a4a45', fontFamily:'Space Mono, monospace', textTransform:'uppercase', marginBottom:8 }}>Gainers</div>
          {movers.gainers.length===0
            ? <div style={{ fontSize:10, color:'#2a2a28', fontFamily:'Space Mono, monospace' }}>None found</div>
            : movers.gainers.map((m,i)=><MoverRow key={i} m={m} positive/>)}
        </div>
        <div>
          <div style={{ fontSize:9, color:'#4a4a45', fontFamily:'Space Mono, monospace', textTransform:'uppercase', marginBottom:8 }}>Decliners</div>
          {movers.decliners.length===0
            ? <div style={{ fontSize:10, color:'#2a2a28', fontFamily:'Space Mono, monospace' }}>None found</div>
            : movers.decliners.map((m,i)=><MoverRow key={i} m={m} positive={false}/>)}
        </div>
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
    <div style={{ background:'#0f0f0e', border:'1px solid rgba(155,89,182,0.25)', boxShadow:'0 0 20px rgba(155,89,182,0.08)', borderRadius:12, padding:'20px' }}>
      <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:14 }}>
        <div style={{ fontSize:8,color:'#9b59b6',fontFamily:"'Press Start 2P', monospace",letterSpacing:'0.04em',textTransform:'uppercase',fontWeight:700,textShadow:'0 0 10px rgba(155,89,182,0.4)' }}>⚡ Vault Intelligence</div>
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
            <div style={{ display:'flex',alignItems:'center',gap:7,marginBottom:12,padding:'7px 12px',background:'linear-gradient(135deg,rgba(27,175,122,0.1),rgba(27,175,122,0.02))',border:'1px solid rgba(27,175,122,0.3)',boxShadow:'0 0 14px rgba(27,175,122,0.12)',borderRadius:7 }}>
              <span style={{ fontSize:13 }}>📈</span>
              <span style={{ fontSize:9,fontWeight:700,color:'#1baf7a',fontFamily:"'Press Start 2P', monospace",letterSpacing:'0.03em',textShadow:'0 0 10px rgba(27,175,122,0.4)' }}>TOP OPPORTUNITIES</span>
            </div>
            {positive.map((item,i)=><RadarCard key={i} item={item} type="positive"/>)}
          </div>
          <div>
            <div style={{ display:'flex',alignItems:'center',gap:7,marginBottom:12,padding:'7px 12px',background:'linear-gradient(135deg,rgba(227,73,72,0.1),rgba(227,73,72,0.02))',border:'1px solid rgba(227,73,72,0.3)',boxShadow:'0 0 14px rgba(227,73,72,0.12)',borderRadius:7 }}>
              <span style={{ fontSize:13 }}>📉</span>
              <span style={{ fontSize:9,fontWeight:700,color:'#e34948',fontFamily:"'Press Start 2P', monospace",letterSpacing:'0.03em',textShadow:'0 0 10px rgba(227,73,72,0.4)' }}>RISK ITEMS</span>
            </div>
            {negative.map((item,i)=><RadarCard key={i} item={item} type="negative"/>)}
          </div>
        </div>
      )}
      <LongTermMoversSection movers={radar.long_term_movers}/>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function RadarSection({ marketData, dataLoading }: { marketData:Record<string,string>; dataLoading:boolean }) {
  const [itemCount, setItemCount] = useState<number|null>(null)
  useEffect(() => {
    supabase.from('items_catalog').select('*', { count: 'exact', head: true })
      .then(({ count }) => setItemCount(count ?? null))
  }, [])
  return (
    <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
      <div style={{ padding:'12px 16px',background:'linear-gradient(135deg,rgba(155,89,182,0.1),rgba(155,89,182,0.03))',border:'1px solid rgba(155,89,182,0.45)',boxShadow:'0 0 20px rgba(155,89,182,0.1)',borderRadius:10,display:'flex',alignItems:'center',gap:12 }}>
        <span style={{ fontSize:20 }}>📡</span>
        <div>
          <div style={{ fontSize:9,fontWeight:700,color:'#9b59b6',fontFamily:"'Press Start 2P', monospace",letterSpacing:'0.04em' }}>MARKET RADAR</div>
          <div style={{ fontSize:10,color:'#3a3a38',marginTop:2 }}>Price explorer · {itemCount ?? '…'} items · Bazaar + AH · up to 7+ years</div>
        </div>
        <div style={{ marginLeft:'auto',fontSize:8.5,color:'#3a3a38',fontFamily:'Space Mono, monospace',textAlign:'right' }}>Daily intelligence<br/>+ live charts</div>
      </div>
      <ItemExplorer/>
      <IntelligenceVault marketData={marketData} dataLoading={dataLoading}/>
    </div>
  )
}