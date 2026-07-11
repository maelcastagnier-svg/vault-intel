// components/LiveRankedFeed.tsx
// Vrai classement anime — les items glissent visuellement vers leur nouvelle position
// quand leur rang change, entrent par le bas, sortent par le haut si elimines
'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
  minSpread = 20
}: {
  type: 'AH' | 'BAZAAR'
  maxItems?: number
  minSpread?: number
}) {
  const [items, setItems] = useState<RankedItem[]>([])
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(new Set())
  const [exitingItems, setExitingItems] = useState<RankedItem[]>([])
  const prevKeysRef = useRef<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    async function loadFeed() {
      let newItems: RankedItem[] = []

      if (type === 'AH') {
        const { data } = await supabase
          .from('ah_4h')
          .select('item_id, item_name, min_price, avg_price, best_auction_uuid')
          .not('best_auction_uuid', 'is', null)

        if (data) {
          newItems = data
            .map(d => ({
              key: d.best_auction_uuid,
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
    }

    loadFeed()

    const table = type === 'AH' ? 'ah_4h' : 'bazaar_1h'
    const channel = supabase
      .channel(`${table}_ranked_${type}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => loadFeed())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [type, maxItems, minSpread])

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
        transition: isExiting ? 'transform 0.5s ease, opacity 0.5s ease' : 'top 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease',
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
  )
}