// components/LiveFlipTicker.tsx
// Carrousel live des meilleurs flips AH — lit directement ah_4h, ZERO Claude, vraiment live
'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface FlipItem {
  item_id: string
  item_name: string
  min_price: number
  avg_price: number
  best_auction_uuid: string
  spread_pct: number
}

export default function LiveFlipTicker() {
  const [flips, setFlips] = useState<FlipItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function loadFlips() {
      const { data } = await supabase
        .from('ah_4h')
        .select('item_id, item_name, min_price, avg_price, best_auction_uuid')
        .not('best_auction_uuid', 'is', null)
        .order('avg_price', { ascending: false })

      if (data) {
        const withSpread = data
          .map(d => ({
            ...d,
            spread_pct: d.avg_price > 0 ? Math.round(((d.avg_price - d.min_price) / d.avg_price) * 100) : 0
          }))
          .filter(d => d.spread_pct >= 30 && d.min_price > 5000) // seuil pur mathematique, zero Claude
          .sort((a, b) => b.spread_pct - a.spread_pct)

        setFlips(withSpread)
      }
    }

    loadFlips()

    // Realtime — recharge des que ah_4h change (toutes les 5 min via le Cron)
    const channel = supabase
      .channel('ah_4h_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ah_4h' }, () => loadFlips())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (flips.length === 0) return
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % flips.length)
        setVisible(true)
      }, 400) // duree du fade-out avant de changer d'item
    }, 30000) // 30 secondes par item

    return () => clearInterval(interval)
  }, [flips])

  const current = flips[currentIndex]

  const handleCopy = () => {
    if (!current) return
    navigator.clipboard.writeText(`/viewauction ${current.best_auction_uuid}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!current) {
    return <div style={{ padding: 20, color: '#6b6960', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>Scanning live AH for flips...</div>
  }

  return (
    <div style={{
      background: '#111110',
      border: '1px solid #2a78d640',
      borderLeft: '4px solid #2a78d6',
      borderRadius: 10,
      padding: '16px 20px',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.4s ease',
      minHeight: 90
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#2a78d6', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Space Mono, monospace' }}>
          🔴 LIVE — AH Sniper Feed
        </div>
        <div style={{ fontSize: 9, color: '#6b6960', fontFamily: 'Space Mono, monospace' }}>
          {currentIndex + 1}/{flips.length}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e6df', fontFamily: 'Space Mono, monospace' }}>
            {current.item_name || current.item_id}
          </div>
          <div style={{ fontSize: 11, color: '#c8c6bf', fontFamily: 'Space Mono, monospace', marginTop: 4 }}>
            Min: {current.min_price.toLocaleString()} → Avg: {current.avg_price.toLocaleString()}
            <span style={{ color: '#1baf7a', marginLeft: 8, fontWeight: 700 }}>+{current.spread_pct}%</span>
          </div>
        </div>
        <button
          onClick={handleCopy}
          style={{
            background: copied ? '#2a78d630' : 'transparent',
            border: '1px solid #2a78d660',
            color: '#2a78d6',
            fontSize: 11,
            fontFamily: 'Space Mono, monospace',
            padding: '8px 14px',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 700
          }}
        >
          {copied ? '✓ Copied' : '🎯 /viewauction'}
        </button>
      </div>
    </div>
  )
}