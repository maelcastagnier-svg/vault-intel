'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '../lib/supabase'
import LiveRankedFeed from './LiveRankedFeed'

const supabase = createClient()
const TRANSITION_MS = 250

export default function FlashAlertsPage() {
  const [categories,       setCategories]       = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showBazaar,       setShowBazaar]       = useState(true)
  const [panelVisible,     setPanelVisible]     = useState(true)
  const pendingRef = useRef<{ category: string | null; bazaar: boolean } | null>(null)

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase
        .from('ah_live')
        .select('category')
        .not('category', 'is', null)

      if (data) {
        const unique = Array.from(
          new Set(data.map((d: any) => d.category).filter(Boolean))
        ).sort() as string[]
        setCategories(unique)
        if (unique.length > 0 && !selectedCategory) setSelectedCategory(unique[0])
      }
    }

    loadCategories()

    const channel = supabase
      .channel('ah_live_cats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ah_live' }, loadCategories)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const switchTo = (category: string | null, bazaar: boolean) => {
    if (bazaar === showBazaar && category === selectedCategory) return
    pendingRef.current = { category, bazaar }
    setPanelVisible(false)
    setTimeout(() => {
      if (pendingRef.current) {
        setSelectedCategory(pendingRef.current.category)
        setShowBazaar(pendingRef.current.bazaar)
        pendingRef.current = null
      }
      setPanelVisible(true)
    }, TRANSITION_MS)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 }}>

      {/* SIDEBAR */}
      <div>
        <div
          onClick={() => switchTo(null, true)}
          style={{
            padding:      '10px 14px',
            marginBottom: 6,
            borderRadius: 8,
            cursor:       'pointer',
            fontFamily:   'Space Mono, monospace',
            fontSize:     12,
            fontWeight:   showBazaar ? 700 : 400,
            background:   showBazaar ? '#1baf7a20' : 'transparent',
            border:       `1px solid ${showBazaar ? '#1baf7a' : '#2a2a28'}`,
            color:        showBazaar ? '#1baf7a' : '#c8c6bf',
            transition:   'all 0.2s ease'
          }}
        >
          💰 Bazaar Top 25
        </div>

        <div style={{
          fontSize:      9,
          color:         '#6b6960',
          margin:        '14px 0 6px',
          fontFamily:    'Space Mono, monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.08em'
        }}>
          AH Categories
        </div>

        {categories.length === 0 && (
          <div style={{ fontSize: 10, color: '#6b6960', fontFamily: 'Space Mono, monospace' }}>
            Loading...
          </div>
        )}

        {categories.map(cat => {
          const isActive = !showBazaar && selectedCategory === cat
          return (
            <div
              key={cat}
              onClick={() => switchTo(cat, false)}
              style={{
                padding:       '10px 14px',
                marginBottom:  6,
                borderRadius:  8,
                cursor:        'pointer',
                fontFamily:    'Space Mono, monospace',
                fontSize:      12,
                fontWeight:    isActive ? 700 : 400,
                background:    isActive ? '#2a78d620' : 'transparent',
                border:        `1px solid ${isActive ? '#2a78d6' : '#2a2a28'}`,
                color:         isActive ? '#2a78d6' : '#c8c6bf',
                transition:    'all 0.2s ease',
                textTransform: 'capitalize'
              }}
            >
              {cat}
            </div>
          )
        })}
      </div>

      {/* MAIN PANEL */}
      <div style={{
        opacity:    panelVisible ? 1 : 0,
        transition: `opacity ${TRANSITION_MS}ms ease`,
        minHeight:  400
      }}>
        {showBazaar ? (
          <div>
            <div className="section-label" style={{ color: '#1baf7a' }}>
              💰 Top 25 Bazaar Flips
            </div>
            <div style={{ fontSize: 10, color: '#6b6960', marginBottom: 8, fontFamily: 'Space Mono, monospace' }}>
              LIVE · REFRESH 5MIN
            </div>
            <LiveRankedFeed
              type="BAZAAR"
              maxItems={25}
              instanceKey="bazaar_main_25"
            />
          </div>
        ) : selectedCategory ? (
          <div>
            <div className="section-label" style={{ color: '#2a78d6', textTransform: 'capitalize' }}>
              🎯 {selectedCategory} — Top 25
            </div>
            <div style={{ fontSize: 10, color: '#6b6960', marginBottom: 8, fontFamily: 'Space Mono, monospace' }}>
              LIVE · REFRESH 1MIN · SOLD ITEMS REPLACED AUTO
            </div>
            <LiveRankedFeed
              type="AH"
              maxItems={25}
              instanceKey={`ah_cat_${selectedCategory}`}
              category={selectedCategory}
            />
          </div>
        ) : (
          <div style={{ color: '#6b6960', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>
            Select a category
          </div>
        )}
      </div>

    </div>
  )
}