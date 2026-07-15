'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '../lib/supabase'

const supabase = createClient()

interface RankedItem {
  key:               string
  item_id:           string
  item_name:         string
  best_price:        number
  avg_price:         number
  historical_avg:    number
  discount_pct:      number
  spread_pct:        number
  buy_price?:        number
  sell_price?:       number
  best_auction_uuid?: string
  category?:         string
}

const ITEM_HEIGHT = 62
const GAP         = 6

export default function LiveRankedFeed({
  type,
  maxItems = 10,
  instanceKey,
  category,
  minPrice,
  maxPrice
}: {
  type:         'AH' | 'BAZAAR'
  maxItems?:    number
  instanceKey?: string
  category?:    string
  minPrice?:    number
  maxPrice?:    number
}) {
  const [items, setItems]             = useState<RankedItem[]>([])
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(new Set())
  const [exitingItems, setExitingItems] = useState<RankedItem[]>([])
  const [lastUpdate, setLastUpdate]   = useState<Date | null>(null)
  const [copiedKey, setCopiedKey]     = useState<string | null>(null)
  const [, forceTick]                 = useState(0)
  const prevKeysRef                   = useRef<Set<string>>(new Set())

  useEffect(() => {
    const tick = setInterval(() => forceTick(n => n + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  const secondsAgo = lastUpdate
    ? Math.floor((Date.now() - lastUpdate.getTime()) / 1000)
    : null

  useEffect(() => {
    async function loadFeed() {
      let newItems: RankedItem[] = []

      if (type === 'AH') {
        let query = supabase
          .from('ah_live')
          .select('item_id, base_item_id, item_name, best_price, avg_price, historical_avg, discount_pct, spread_pct, best_auction_uuid, category, buy_price, sell_price')
          .not('best_auction_uuid', 'is', null)
          .gt('best_price', 10000)
          .order('discount_pct', { ascending: false })
          .limit(maxItems)

        if (category)              query = query.eq('category', category)
        if (minPrice !== undefined) query = query.gte('best_price', minPrice)
        if (maxPrice !== undefined) query = query.lte('best_price', maxPrice)

        const { data } = await query

        if (data) {
          newItems = data.map(d => ({
            key:            d.base_item_id || d.item_id,
            item_id:        d.item_id,
            item_name:      d.item_name || d.item_id,
            best_price:     d.best_price,
            avg_price:      d.avg_price,
            historical_avg: d.historical_avg ?? 0,
            discount_pct:   d.discount_pct ?? 0,
            spread_pct:     d.spread_pct ?? 0,
            best_auction_uuid: d.best_auction_uuid,
            category:       d.category,
            buy_price:      d.buy_price,
            sell_price:     d.sell_price
          }))
        }

      } else {
        const { data } = await supabase
          .from('bazaar_1h')
          .select('item_id, buy_price, sell_price, spread_pct')
          .order('spread_pct', { ascending: false })
          .limit(maxItems)

        if (data) {
          newItems = data.map(d => ({
            key:            d.item_id,
            item_id:        d.item_id,
            item_name:      d.item_id.replace(/_/g, ' '),
            best_price:     d.sell_price,
            avg_price:      d.buy_price,
            historical_avg: 0,
            discount_pct:   0,
            spread_pct:     d.spread_pct,
            buy_price:      d.buy_price,
            sell_price:     d.sell_price
          }))
        }
      }

      const newKeys = new Set(newItems.map(i => i.key))
      const oldKeys = prevKeysRef.current

      const disappearedKeys = [...oldKeys].filter(k => !newKeys.has(k))
      if (disappearedKeys.length > 0) {
        const stillInState = items.filter(i => disappearedKeys.includes(i.key))
        setExitingItems(stillInState)
        setTimeout(() => setExitingItems([]), 600)
      }

      const newlyEntering = new Set(
        newItems.filter(i => !oldKeys.has(i.key)).map(i => i.key)
      )
      setEnteringKeys(newlyEntering)
      setTimeout(() => setEnteringKeys(new Set()), 600)

      setItems(newItems)
      prevKeysRef.current = newKeys
      setLastUpdate(new Date())
    }

    loadFeed()

    const table    = type === 'AH' ? 'ah_live' : 'bazaar_1h'
    const uniqueId = instanceKey || `${type}_${maxItems}`
    const channel  = supabase
      .channel(`${table}_ranked_${uniqueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => loadFeed())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [type, maxItems, instanceKey, category, minPrice, maxPrice])

  const color = type === 'AH' ? '#2a78d6' : '#1baf7a'

  const handleCopy = (item: RankedItem) => {
    const text = item.best_auction_uuid
      ? `/viewauction ${item.best_auction_uuid}`
      : item.item_name
    navigator.clipboard.writeText(text)
    setCopiedKey(item.key)
    setTimeout(() => setCopiedKey(null), 1200)
  }

  const containerHeight = maxItems * (ITEM_HEIGHT + GAP)

  const renderCard = (item: RankedItem, rank: number, isExiting: boolean) => (
    <div
      key={item.key}
      style={{
        position:   'absolute',
        top:        rank * (ITEM_HEIGHT + GAP),
        left:       0,
        right:      0,
        height:     ITEM_HEIGHT,
        background: '#111110',
        border:     `0.5px solid ${color}30`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding:    '8px 12px',
        display:    'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        transition: isExiting
          ? 'transform 0.6s ease, opacity 0.6s ease'
          : 'top 0.8s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s ease',
        transform:  isExiting ? 'translateX(40px)' : undefined,
        opacity:    isExiting ? 0 : 1,
        animation:  enteringKeys.has(item.key) ? 'slideUpFadeIn 0.5s ease-out' : undefined,
        cursor:     type === 'AH' ? 'pointer' : 'default'
      }}
      onClick={() => type === 'AH' && handleCopy(item)}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize:     11,
          fontWeight:   600,
          color:        '#e8e6df',
          fontFamily:   'Space Mono, monospace',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap'
        }}>
          {rank === 0 && '🥇 '}
          {rank === 1 && '🥈 '}
          {rank === 2 && '🥉 '}
          {item.item_name.slice(0, 26)}
        </div>
        <div style={{
          fontSize:   9,
          color:      '#6b6960',
          fontFamily: 'Space Mono, monospace',
          marginTop:  2
        }}>
          {type === 'AH'
            ? item.historical_avg > 0
              ? `${item.best_price?.toLocaleString()} → avg hist. ${item.historical_avg?.toLocaleString()}`
              : `${item.best_price?.toLocaleString()} → avg ${item.avg_price?.toLocaleString()}`
            : `${item.sell_price?.toFixed(1)} → ${item.buy_price?.toFixed(1)}`
          }
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'Space Mono, monospace' }}>
          {copiedKey === item.key
            ? '✓'
            : type === 'AH' && item.discount_pct > 0
              ? `-${item.discount_pct}%`
              : `+${item.spread_pct}%`
          }
        </div>
        {type === 'AH' && item.discount_pct > 0 && (
          <div style={{ fontSize: 8, color: '#6b6960', fontFamily: 'Space Mono, monospace' }}>
            vs hist.
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div>
      <div style={{
        fontSize:    9,
        color:       secondsAgo !== null && secondsAgo < 90
          ? '#1baf7a'
          : '#6b6960',
        fontFamily:  'Space Mono, monospace',
        marginBottom: 6,
        display:     'flex',
        alignItems:  'center',
        gap:         4
      }}>
        <span style={{
          width:        6,
          height:       6,
          borderRadius: '50%',
          background:   secondsAgo !== null && secondsAgo < 90 ? '#1baf7a' : '#6b6960',
          display:      'inline-block'
        }} />
        {secondsAgo === null
          ? 'Waiting for data...'
          : secondsAgo < 60
            ? `Updated ${secondsAgo}s ago`
            : `Updated ${Math.floor(secondsAgo / 60)}m ago`
        }
      </div>
      <div style={{ position: 'relative', height: containerHeight, overflow: 'hidden' }}>
        <style>{`
          @keyframes slideUpFadeIn {
            from { transform: translateY(30px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>
        {items.map((item, i) => renderCard(item, i, false))}
        {exitingItems.map(item => renderCard(
          item,
          items.findIndex(x => x.key === item.key) === -1 ? maxItems : 0,
          true
        ))}
        {items.length === 0 && (
          <div style={{ padding: 20, color: '#6b6960', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>
            Scanning...
          </div>
        )}
      </div>
    </div>
  )
}