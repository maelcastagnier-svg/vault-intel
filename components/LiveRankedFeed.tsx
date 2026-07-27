'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '../lib/supabase'
import { useGlobalRefresh, useRefreshCountdown } from '../lib/useGlobalRefresh'

const supabase = createClient()

interface AHItem {
  id:                string
  base_item_id:      string
  item_name:         string
  best_price:        number
  avg_price:         number
  historical_avg:    number
  discount_pct:      number
  spread_pct:        number
  best_auction_uuid: string | null
  category:          string | null
  volume:            number
}

interface BazaarItem {
  id:         string
  item_id:    string
  item_name:  string
  buy_price:  number
  sell_price: number
  spread_pct: number
}

interface LiveRankedFeedProps {
  type:         'AH' | 'BAZAAR'
  maxItems?:    number
  instanceKey?: string
  category?:    string
}

const FADE_MS  = 300
const ITEM_H   = 64
const ITEM_GAP = 6

export default function LiveRankedFeed({
  type,
  maxItems = 25,
  instanceKey,
  category,
}: LiveRankedFeedProps) {
  const [ahItems,     setAhItems]     = useState<AHItem[]>([])
  const [bazaarItems, setBazaarItems] = useState<BazaarItem[]>([])
  const [fadingOut,   setFadingOut]   = useState<Set<string>>(new Set())
  const [fadingIn,    setFadingIn]    = useState<Set<string>>(new Set())
  const [copiedId,    setCopiedId]    = useState<string | null>(null)
  const prevIdsRef                    = useRef<Set<string>>(new Set())
  const loadingRef                    = useRef(false)

  // Timer global partagé — même tick pour tous les feeds
  const globalTick      = useGlobalRefresh()
  const countdown       = useRefreshCountdown()

  const color = type === 'AH' ? '#2a78d6' : '#1baf7a'

  const loadAH = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true

    try {
      let query = supabase
        .from('ah_live')
        .select('id, base_item_id, item_name, best_price, avg_price, historical_avg, discount_pct, spread_pct, best_auction_uuid, category, volume')
        .order('discount_pct', { ascending: false })
        .limit(maxItems)

      if (category) query = query.eq('category', category)

      const { data } = await query
      if (!data) return

      const newIds  = new Set(data.map(d => String(d.id)))
      const prevIds = prevIdsRef.current
      const removed = [...prevIds].filter(id => !newIds.has(id))
      const added   = [...newIds].filter(id => !prevIds.has(id))

      if (removed.length > 0) {
        setFadingOut(new Set(removed))
        await new Promise(r => setTimeout(r, FADE_MS))
        setFadingOut(new Set())
      }

      const items: AHItem[] = data.map(d => ({
        id:                String(d.id),
        base_item_id:      d.base_item_id,
        item_name:         d.item_name,
        best_price:        d.best_price,
        avg_price:         d.avg_price,
        historical_avg:    d.historical_avg ?? 0,
        discount_pct:      d.discount_pct   ?? 0,
        spread_pct:        d.spread_pct     ?? 0,
        best_auction_uuid: d.best_auction_uuid,
        category:          d.category,
        volume:            d.volume
      }))

      setAhItems(items)
      prevIdsRef.current = newIds

      if (added.length > 0) {
        setFadingIn(new Set(added))
        setTimeout(() => setFadingIn(new Set()), FADE_MS)
      }
    } finally {
      loadingRef.current = false
    }
  }, [category, maxItems])

  const loadBazaar = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true

    try {
      const { data } = await supabase
        .from('bazaar_1h')
        .select('item_id, buy_price, sell_price, spread_pct')
        .order('spread_pct', { ascending: false })
        .limit(maxItems)

      if (!data) return

      const newItems: BazaarItem[] = data.map(d => ({
        id:         d.item_id,
        item_id:    d.item_id,
        item_name:  d.item_id.replace(/_/g, ' '),
        buy_price:  d.buy_price,
        sell_price: d.sell_price,
        spread_pct: d.spread_pct
      }))

      const newIds  = new Set(newItems.map(i => i.id))
      const prevIds = prevIdsRef.current
      const removed = [...prevIds].filter(id => !newIds.has(id))
      const added   = [...newIds].filter(id => !prevIds.has(id))

      if (removed.length > 0) {
        setFadingOut(new Set(removed))
        await new Promise(r => setTimeout(r, FADE_MS))
        setFadingOut(new Set())
      }

      setBazaarItems(newItems)
      prevIdsRef.current = newIds

      if (added.length > 0) {
        setFadingIn(new Set(added))
        setTimeout(() => setFadingIn(new Set()), FADE_MS)
      }
    } finally {
      loadingRef.current = false
    }
  }, [maxItems])

  // Chargement initial + reset au changement de catégorie
  useEffect(() => {
    setAhItems([])
    setBazaarItems([])
    prevIdsRef.current = new Set()
    loadingRef.current = false

    if (type === 'AH') loadAH()
    else loadBazaar()
  }, [type, category, maxItems, instanceKey])

  // Refresh global synchronisé — même tick pour tous les feeds
  useEffect(() => {
    if (globalTick === 0) return // Skip le tick initial
    loadingRef.current = false
    if (type === 'AH') loadAH()
    else loadBazaar()
  }, [globalTick])

  const handleCopy = (item: AHItem) => {
    if (!item.best_auction_uuid) return
    navigator.clipboard.writeText(`/viewauction ${item.best_auction_uuid}`)
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const renderAHCard = (item: AHItem, idx: number) => {
    const isFadingOut = fadingOut.has(item.id)
    const isFadingIn  = fadingIn.has(item.id)
    const isCopied    = copiedId === item.id

    return (
      <div
        key={item.id}
        className="vault-surface gem-tab-sm"
        style={{
          height:         ITEM_H,
          marginBottom:   ITEM_GAP,
          border:         `1px solid ${color}45`,
          filter:         `drop-shadow(0 0 8px ${color}15)`,
          padding:        '8px 14px 8px 26px',
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
          cursor:         'pointer',
          opacity:        isFadingOut ? 0 : 1,
          transition:     `opacity ${FADE_MS}ms ease`,
          animation:      isFadingIn ? `fadeIn ${FADE_MS}ms ease forwards` : undefined
        }}
        onClick={() => handleCopy(item)}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize:     13,
            fontWeight:   700,
            color:        '#e8e6df',
            fontFamily:   'Space Grotesk, sans-serif',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap'
          }}>
            {idx === 0 && '🥇 '}
            {idx === 1 && '🥈 '}
            {idx === 2 && '🥉 '}
            {item.item_name.slice(0, 28)}
          </div>
          <div style={{
            fontSize:   9,
            color:      '#6b6960',
            fontFamily: 'Space Mono, monospace',
            marginTop:  2
          }}>
            {item.historical_avg > 0
              ? `${item.best_price.toLocaleString()} → hist. ${item.historical_avg.toLocaleString()}`
              : `best: ${item.best_price.toLocaleString()} · avg: ${item.avg_price.toLocaleString()}`
            }
          </div>
        </div>
        <div style={{
          fontSize:   15,
          fontWeight: 700,
          color,
          fontFamily: 'Space Mono, monospace',
          flexShrink: 0,
          marginLeft: 8,
          textShadow: `0 0 8px ${color}50`,
        }}>
          {isCopied
            ? '✓'
            : item.discount_pct > 0
              ? `-${item.discount_pct}%`
              : `+${item.spread_pct}%`
          }
        </div>
      </div>
    )
  }

  const renderBazaarCard = (item: BazaarItem, idx: number) => (
    <div
      key={item.id}
      className="vault-surface gem-tab-sm"
      style={{
        height:         ITEM_H,
        marginBottom:   ITEM_GAP,
        border:         `1px solid ${color}45`,
        filter:         `drop-shadow(0 0 8px ${color}15)`,
        padding:        '8px 14px 8px 26px',
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        opacity:        fadingOut.has(item.id) ? 0 : 1,
        transition:     `opacity ${FADE_MS}ms ease`,
        animation:      fadingIn.has(item.id) ? `fadeIn ${FADE_MS}ms ease forwards` : undefined
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize:     13,
          fontWeight:   700,
          color:        '#e8e6df',
          fontFamily:   'Space Grotesk, sans-serif',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap'
        }}>
          {idx === 0 && '🥇 '}
          {idx === 1 && '🥈 '}
          {idx === 2 && '🥉 '}
          {item.item_name.slice(0, 28)}
        </div>
        <div style={{
          fontSize:   9,
          color:      '#6b6960',
          fontFamily: 'Space Mono, monospace',
          marginTop:  2
        }}>
          {item.sell_price.toFixed(1)} → {item.buy_price.toFixed(1)}
        </div>
      </div>
      <div style={{
        fontSize:   15,
        fontWeight: 700,
        color,
        fontFamily: 'Space Mono, monospace',
        flexShrink: 0,
        marginLeft: 8,
        textShadow: `0 0 8px ${color}50`,
      }}>
        +{item.spread_pct}%
      </div>
    </div>
  )

  const containerH = maxItems * (ITEM_H + ITEM_GAP)

  return (
    <div>
      {/* Status bar avec countdown global */}
      <div style={{
        fontSize:     9,
        color:        '#6b6960',
        fontFamily:   'Space Mono, monospace',
        marginBottom: 8,
        display:      'flex',
        alignItems:   'center',
        gap:          6
      }}>
        <span style={{
          width:        6,
          height:       6,
          borderRadius: '50%',
          background:   '#1baf7a',
          display:      'inline-block',
          animation:    countdown <= 3 ? 'pulse 0.5s ease infinite' : undefined
        }} />
        <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: '#1baf7a' }}>LIVE</span>
        <span style={{ color: '#3a3a38' }}>·</span>
        <span>next refresh in {countdown}s</span>
      </div>

      <div style={{ minHeight: containerH }}>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0);   }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.3; }
          }
        `}</style>
        {type === 'AH'
          ? ahItems.length === 0
            ? <div style={{ padding: 20, color: '#6b6960', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>Scanning...</div>
            : ahItems.map((item, i) => renderAHCard(item, i))
          : bazaarItems.length === 0
            ? <div style={{ padding: 20, color: '#6b6960', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>Scanning...</div>
            : bazaarItems.map((item, i) => renderBazaarCard(item, i))
        }
      </div>
    </div>
  )
}