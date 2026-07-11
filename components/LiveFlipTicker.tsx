// components/LiveScrollFeed.tsx
// Flux vivant defilant vers le haut — items entrent par le bas, sortent par le haut quand vendus/depasses
// ZERO Claude — pur calcul mathematique sur les donnees deja collectees
'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface FeedItem {
  key: string
  item_id: string
  item_name: string
  min_price?: number
  avg_price?: number
  buy_price?: number
  sell_price?: number
  spread_pct: number
  best_auction_uuid?: string
  isNew?: boolean
}

export default function LiveScrollFeed({ type, maxItems = 10 }: { type: 'AH' | 'BAZAAR', maxItems?: number }) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [exiting, setExiting] = useState<Set<string>>(new Set())
  const prevKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    async function loadFeed() {
      let newItems: FeedItem[] = []

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
            .filter(d => d.spread_pct >= 25 && d.min_price! > 5000)
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
      const disappeared = [...oldKeys].filter(k => !newKeys.has(k))

      if (disappeared.length > 0) {
        setExiting(new Set(disappeared))
        setTimeout(() => setExiting(new Set()), 500)
      }

      const withNewFlags = newItems.map(item => ({
        ...item,
        isNew: !oldKeys.has(item.key)
      }))

      setItems(withNewFlags)
      prevKeysRef.current = newKeys
    }

    loadFeed()

    const table = type === 'AH' ? 'ah_4h' : 'bazaar_1h'
    const channel = supabase
      .channel(`${table}_live_feed`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => loadFeed())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [type, maxItems])

  const color = type === 'AH' ? '#2a78d6' : '#1baf7a'

  return (
    <div style={{ position: 'relative', overflow: 'hidden', maxHeight: 600 }}>
      <style>{`
        @keyframes slideInFromBottom {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideOutToTop {
          from { transform: translateY(0); opacity: 1; max-height: 70px; }
          to { transform: translateY(-20px); opacity: 0; max-height: 0; }
        }
        .feed-item-enter { animation: slideInFromBottom 0.5s ease-out; }
        .feed-item-exit { animation: slideOutToTop 0.5s ease-in forwards; }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item) => (
          <div
            key={item.key}
            className={item.isNew ? 'feed-item-enter' : ''}
            style={{
              background: '#111110',
              border: `0.5px solid ${color}30`,
              borderLeft: `3px solid ${color}`,
              borderRadius: 8,
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'all 0.3s ease'
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e8e6df', fontFamily: 'Space Mono, monospace' }}>
                {item.item_name.slice(0, 30)}
              </div>
              <div style={{ fontSize: 10, color: '#6b6960', fontFamily: 'Space Mono, monospace', marginTop: 2 }}>
                {type === 'AH'
                  ? `Min: ${item.min_price?.toLocaleString()} → Avg: ${item.avg_price?.toLocaleString()}`
                  : `Buy: ${item.buy_price?.toFixed(1)} → Sell: ${item.sell_price?.toFixed(1)}`}
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'Space Mono, monospace' }}>
              +{item.spread_pct}%
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div style={{ padding: 20, color: '#6b6960', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>
            Scanning for {type === 'AH' ? 'AH flips' : 'Bazaar flips'}...
          </div>
        )}
      </div>
    </div>
  )
}