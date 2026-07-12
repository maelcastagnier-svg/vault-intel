// components/FlashAlertsPage.tsx
// Page Flash Alerts avec sidebar de categories a gauche + Bazaar Top 25 fixe
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import LiveRankedFeed from './LiveRankedFeed'

const supabase = createClient()

export default function FlashAlertsPage() {
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showBazaar, setShowBazaar] = useState(true)

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase
        .from('ah_4h')
        .select('category')
        .not('category', 'is', null)

      if (data) {
        const unique = Array.from(new Set(data.map(d => d.category).filter(Boolean)))
        setCategories(unique.sort())
        if (unique.length > 0 && !selectedCategory) setSelectedCategory(unique[0])
      }
    }
    loadCategories()

    const channel = supabase
      .channel('ah_categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ah_4h' }, () => loadCategories())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 }}>
      {/* SIDEBAR CATEGORIES */}
      <div>
        <div
          onClick={() => setShowBazaar(true)}
          style={{
            padding: '10px 14px',
            marginBottom: 6,
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: 'Space Mono, monospace',
            fontSize: 12,
            fontWeight: showBazaar ? 700 : 400,
            background: showBazaar ? '#1baf7a20' : 'transparent',
            border: `1px solid ${showBazaar ? '#1baf7a' : '#2a2a28'}`,
            color: showBazaar ? '#1baf7a' : '#c8c6bf'
          }}
        >
          💰 Bazaar Top 25
        </div>

        <div style={{ fontSize: 9, color: '#6b6960', margin: '14px 0 6px', fontFamily: 'Space Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          AH Categories
        </div>

        {categories.length === 0 && (
          <div style={{ fontSize: 10, color: '#6b6960', fontFamily: 'Space Mono, monospace' }}>Loading...</div>
        )}

        {categories.map(cat => (
          <div
            key={cat}
            onClick={() => { setSelectedCategory(cat); setShowBazaar(false) }}
            style={{
              padding: '10px 14px',
              marginBottom: 6,
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'Space Mono, monospace',
              fontSize: 12,
              fontWeight: !showBazaar && selectedCategory === cat ? 700 : 400,
              background: !showBazaar && selectedCategory === cat ? '#2a78d620' : 'transparent',
              border: `1px solid ${!showBazaar && selectedCategory === cat ? '#2a78d6' : '#2a2a28'}`,
              color: !showBazaar && selectedCategory === cat ? '#2a78d6' : '#c8c6bf'
            }}
          >
            {cat}
          </div>
        ))}
      </div>

      {/* MAIN PANEL */}
      <div>
        {showBazaar ? (
          <div>
            <div className="section-label" style={{ color: '#1baf7a' }}>💰 Top 25 Bazaar Flips</div>
            <div style={{ fontSize: 10, color: '#6b6960', marginBottom: 8, fontFamily: 'Space Mono, monospace' }}>LIVE · REFRESH 5MIN</div>
            <LiveRankedFeed type="BAZAAR" maxItems={25} instanceKey="bazaar_main_25" />
          </div>
        ) : selectedCategory ? (
          <div>
            <div className="section-label" style={{ color: '#2a78d6' }}>🎯 {selectedCategory} — Top 20</div>
            <div style={{ fontSize: 10, color: '#6b6960', marginBottom: 8, fontFamily: 'Space Mono, monospace' }}>LIVE · REFRESH ~30S</div>
            <LiveRankedFeed type="AH" maxItems={20} minSpread={20} instanceKey={`ah_cat_${selectedCategory}`} category={selectedCategory} />
          </div>
        ) : (
          <div style={{ color: '#6b6960', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>Select a category</div>
        )}
      </div>
    </div>
  )
}