// components/LiveRankedFeed.tsx
// Vrai classement anime — les items glissent visuellement vers leur nouvelle position
// quand leur rang change, entrent par le bas, sortent par le haut si elimines
'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '../lib/supabase'

const supabase = createClient()

interface RankedItem {
  key: string
  item_id: string
  item_name: string
  min_price?: number
  avg_price?: number
  buy_price?: number
  sell_price?: number
  spread_pct: number
  best_auction_uuid?: string
}

const ITEM_HEIGHT = 62
const GAP = 6

export default function LiveRankedFeed({
  type,
  maxItems = 10,
  minSpread = 20,
  instanceKey,
  category,
  minPrice,
  maxPrice
}: {
  type: 'AH' | 'BAZAAR'
  maxItems?: number
  minSpread?: number
  instanceKey?: string
  category?: string
  minPrice?: number
  maxPrice?: number
}) {
  const [items, setItems] = useState<RankedItem[]>([])
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(new Set())
  const [exitingItems, setExitingItems] = useState<RankedItem[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const prevKeysRef = useRef<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [, forceTick] = useState(0)

  useEffect(() => {
    const tick = setInterval(() => forceTick(n => n + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  const secondsAgo = lastUpdate ? Math.floor((Date.now() - lastUpdate.getTime()) / 1000) : null

  useEffect(() => {
    async function loadFeed() {
      let newItems: RankedItem[] = []

      if (type === 'AH') {
        let query = supabase
          .from('ah_4h')
          .select('item_id, item_name, min_price, avg_price, best_auction_uuid, category')
          .not('best_auction_uuid', 'is', null)

        if (category) query = query.eq('category', category)
        if (minPrice !== undefined) query = query.gte('min_price', minPrice)
        if (maxPrice !== undefined) query = query.lte('min_price', maxPrice)

        const { data } = await query

        if (data) {
          newItems = data
            .map(d => ({
              key: d.item_id,
              item_id: d.item_id,
              item_name: d.item_name || d.item_id,
              min_price: d.min_price,
              avg_price: d.avg_price,
              best_auction_uuid: d.best_auction_uuid,
              spread_pct: d.avg_price > 0 ? Math.round(((d.avg_price - d.min_price) / d.avg_price) * 100) : 0
            }))
            .filter(d => d.spread_pct >= minSpread && d.min_price! > 5000)
            .sort((a, b) => b.spread_pct - a.spread_pct)
            .slice(0, maxItems)
        }
      } else {
        const { data } = await supabase
          .from('bazaar_1h')
          .select('item_id, buy_price, sell_price, spread_pct')

        if (data) {
          newItems = data
            .map(d => ({
              key: d.item_id,
              item_id: d.item_id,
              item_name: d.item_id.replace(/_/g, ' '),
              buy_price: d.buy_price,
              sell_price: d.sell_price,
              spread_pct: d.spread_pct
            }))
            .sort((a, b) => b.spread_pct - a.spread_pct)
            .slice(0, maxItems)
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

      const newlyEntering = new Set(newItems.filter(i => !oldKeys.has(i.key)).map(i => i.key))
      setEnteringKeys(newlyEntering)
      setTimeout(() => setEnteringKeys(new Set()), 600)

      setItems(newItems)
      prevKeysRef.current = newKeys
      setLastUpdate(new Date())
    }

    loadFeed()

    const table = type === 'AH' ? 'ah_4h' : 'bazaar_1h'
    const uniqueId = instanceKey || `${type}_${maxItems}_${minSpread}`
    const channel = supabase
      .channel(`${table}_ranked_${uniqueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => loadFeed())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [type, maxItems, minSpread, instanceKey])

  const color = type === 'AH' ? '#2a78d6' : '#1baf7a'

  const handleCopy = (item: RankedItem) => {
    const text = item.best_auction_uuid ? `/viewauction ${item.best_auction_uuid}` : item.item_name
    navigator.clipboard.writeText(text)
    setCopiedKey(item.key)
    setTimeout(() => setCopiedKey(null), 1200)
  }

  const containerHeight = maxItems * (ITEM_HEIGHT + GAP)

  const renderCard = (item: RankedItem, rank: number, isExiting: boolean) => (
    <div
      key={item.key}
      style={{
        position: 'absolute',
        top: rank * (ITEM_HEIGHT + GAP),
        left: 0,
        right: 0,
        height: ITEM_HEIGHT,
        background: '#111110',
        border: `0.5px solid ${color}30`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: '8px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        transition: isExiting ? 'transform 0.6s ease, opacity 0.6s ease' : 'top 0.8s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s ease',
        transform: isExiting ? 'translateX(40px)' : enteringKeys.has(item.key) ? undefined : undefined,
        opacity: isExiting ? 0 : 1,
        animation: enteringKeys.has(item.key) ? 'slideUpFadeIn 0.5s ease-out' : undefined,
        cursor: type === 'AH' ? 'pointer' : 'default'
      }}
      onClick={() => type === 'AH' && handleCopy(item)}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#e8e6df', fontFamily: 'Space Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rank === 0 && '🥇 '}{rank === 1 && '🥈 '}{rank === 2 && '🥉 '}{item.item_name.slice(0, 26)}
        </div>
        <div style={{ fontSize: 9, color: '#6b6960', fontFamily: 'Space Mono, monospace', marginTop: 2 }}>
          {type === 'AH'
            ? `${item.min_price?.toLocaleString()} → ${item.avg_price?.toLocaleString()}`
            : `${item.buy_price?.toFixed(1)} → ${item.sell_price?.toFixed(1)}`}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'Space Mono, monospace', flexShrink: 0, marginLeft: 8 }}>
        {copiedKey === item.key ? '✓' : `+${item.spread_pct}%`}
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize: 9, color: secondsAgo !== null && secondsAgo < 15 ? '#1baf7a' : '#6b6960', fontFamily: 'Space Mono, monospace', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: secondsAgo !== null && secondsAgo < 15 ? '#1baf7a' : '#6b6960', display: 'inline-block' }} />
        {secondsAgo === null ? 'Waiting for data...' : secondsAgo < 60 ? `Updated ${secondsAgo}s ago` : `Updated ${Math.floor(secondsAgo / 60)}m ago`}
      </div>
      <div style={{ position: 'relative', height: containerHeight, overflow: 'hidden' }}>
        <style>{`
          @keyframes slideUpFadeIn {
            from { transform: translateY(30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
        {items.map((item, i) => renderCard(item, i, false))}
        {exitingItems.map((item) => renderCard(item, items.findIndex(x => x.key === item.key) === -1 ? maxItems : 0, true))}
        {items.length === 0 && (
          <div style={{ padding: 20, color: '#6b6960', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>
            Scanning...
          </div>
        )}
      </div>
    </div>
  )
}