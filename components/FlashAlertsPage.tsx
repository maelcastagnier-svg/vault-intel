'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '../lib/supabase'
import LiveRankedFeed from './LiveRankedFeed'
import FreeFlashPreview from './FreeFlashPreview'

const supabase = createClient()
const TRANSITION_MS = 250

export default function FlashAlertsPage({ plan }: { plan?: string }) {
  // Free : ah_live/bazaar_1h sont RLS-scopés à alert+ (policies has_plan()),
  // donc les requêtes ci-dessous ne renverraient rien pour ce plan de toute
  // façon -- composant séparé plus simple plutôt que des branches
  // conditionnelles partout, voir le header de FreeFlashPreview.tsx.
  if (plan === 'free') return <FreeFlashPreview />

  const [categories,       setCategories]       = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showBazaar,       setShowBazaar]       = useState(true)
  const [panelVisible,     setPanelVisible]     = useState(true)

  // Refs pour éviter les stale closures dans les callbacks Realtime
  const selectedCategoryRef = useRef<string | null>(null)
  const initializedRef      = useRef(false)
  const pendingRef          = useRef<{ category: string | null; bazaar: boolean } | null>(null)

  // Sync ref avec state
  useEffect(() => {
    selectedCategoryRef.current = selectedCategory
  }, [selectedCategory])

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from('ah_live')
      .select('category')
      .not('category', 'is', null)

    if (!data) return

    const unique = Array.from(
      new Set(data.map((d: any) => d.category).filter(Boolean))
    ).sort() as string[]

    setCategories(unique)

    // Initialise la catégorie seulement au premier chargement
    // Ne jamais reset si l'utilisateur a déjà sélectionné quelque chose
    if (!initializedRef.current && unique.length > 0) {
      initializedRef.current = true
      setSelectedCategory(unique[0])
      selectedCategoryRef.current = unique[0]
    }
  }, [])

  useEffect(() => {
    loadCategories()

    // Realtime — ne déclenche que loadCategories, jamais de reset de catégorie
    const channel = supabase
      .channel('ah_live_cats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ah_live' }, loadCategories)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadCategories])

  // Transition fondu propre au changement de catégorie
  const switchTo = useCallback((category: string | null, bazaar: boolean) => {
    // Évite le double-trigger si on clique sur la catégorie déjà active
    if (bazaar === (pendingRef.current?.bazaar ?? true) &&
        category === (pendingRef.current?.category ?? selectedCategoryRef.current)) return

    pendingRef.current = { category, bazaar }
    setPanelVisible(false)

    setTimeout(() => {
      if (!pendingRef.current) return
      setSelectedCategory(pendingRef.current.category)
      selectedCategoryRef.current = pendingRef.current.category
      setShowBazaar(pendingRef.current.bazaar)
      pendingRef.current = null
      setPanelVisible(true)
    }, TRANSITION_MS)
  }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 }}>

      {/* SIDEBAR */}
      <div>
        <div
          onClick={() => switchTo(null, true)}
          className="gem-tab-sm"
          style={{
            padding:      '11px 14px 11px 22px',
            marginBottom: 8,
            cursor:       'pointer',
            fontFamily:   'Space Grotesk, sans-serif',
            fontSize:     12.5,
            fontWeight:   showBazaar ? 700 : 500,
            background:   showBazaar ? 'linear-gradient(135deg,#1baf7a30,#1baf7a0c)' : 'linear-gradient(135deg,rgba(201,168,76,0.08),rgba(201,168,76,0.02))',
            border:       `1px solid ${showBazaar ? '#1baf7a90' : 'rgba(201,168,76,0.2)'}`,
            filter:       showBazaar ? 'drop-shadow(0 0 14px rgba(27,175,122,0.4))' : 'drop-shadow(0 0 4px rgba(201,168,76,0.1))',
            color:        showBazaar ? '#4ce0ab' : '#c8c6bf',
            transition:   'all 0.2s ease'
          }}
        >
          💰 Bazaar Top 25
        </div>

        <div style={{
          fontSize:      7.5,
          color:         '#8a6e2f',
          margin:        '16px 0 8px',
          fontFamily:    "'Press Start 2P', monospace",
          letterSpacing: '0.04em'
        }}>
          AH CATEGORIES
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
              className="gem-tab-sm"
              style={{
                padding:       '11px 14px 11px 22px',
                marginBottom:  8,
                cursor:        'pointer',
                fontFamily:    'Space Grotesk, sans-serif',
                fontSize:      12.5,
                fontWeight:    isActive ? 700 : 500,
                background:    isActive ? 'linear-gradient(135deg,#2a78d630,#2a78d60c)' : 'linear-gradient(135deg,rgba(201,168,76,0.08),rgba(201,168,76,0.02))',
                border:        `1px solid ${isActive ? '#2a78d690' : 'rgba(201,168,76,0.2)'}`,
                filter:        isActive ? 'drop-shadow(0 0 14px rgba(42,120,214,0.4))' : 'drop-shadow(0 0 4px rgba(201,168,76,0.1))',
                color:         isActive ? '#6fa8f0' : '#c8c6bf',
                transition:    'all 0.2s ease',
                textTransform: 'capitalize'
              }}
            >
              {cat}
            </div>
          )
        })}
      </div>

      {/* MAIN PANEL avec fondu propre */}
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
              LIVE · REFRESH 60S
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
              LIVE · REFRESH 60S · VS HISTORICAL AVG
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