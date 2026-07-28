// components/FreeFlashPreview.tsx
// Aperçu Flash Alerts pour le plan Free -- volontairement séparé de
// LiveRankedFeed/FlashAlertsPage plutôt que d'y ajouter des branches
// conditionnelles partout : ah_live_free_preview/bazaar_1h_free_preview
// n'ont presque aucune des colonnes de la vraie table (pas de prix pour
// l'AH, pas de nom d'item pour le Bazaar, pas de best_auction_uuid),
// donc réutiliser les mêmes cartes aurait forcé un rendu conditionnel
// dans chaque champ plutôt qu'un composant simple et honnête sur ce
// qu'il montre réellement : un teaser à 5 items, pas un feed complet.
'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '../lib/supabase'

const supabase = createClient()

type AhPreviewItem = { item_name: string; category: string | null; discount_pct: number }
type BazaarPreviewItem = { item_id: string; buy_price: number; sell_price: number; spread_pct: number }

const REFRESH_MS = 60_000

export default function FreeFlashPreview() {
  const [ahItems, setAhItems] = useState<AhPreviewItem[]>([])
  const [bazaarItems, setBazaarItems] = useState<BazaarPreviewItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [{ data: ah }, { data: bazaar }] = await Promise.all([
      supabase.from('ah_live_free_preview').select('item_name, category, discount_pct').order('discount_pct', { ascending: false }),
      supabase.from('bazaar_1h_free_preview').select('item_id, buy_price, sell_price, spread_pct').order('spread_pct', { ascending: false }),
    ])
    setAhItems(ah || [])
    setBazaarItems(bazaar || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  return (
    <div>
      <div className="vault-surface gem-tab-lg" style={{
        marginBottom: 20, padding: '12px 16px 12px 44px',
        border: '1px solid rgba(232,192,99,0.4)', filter: 'drop-shadow(0 0 20px rgba(232,192,99,0.08))',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 20 }}>🔒</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#c9a84c', fontFamily: "'Press Start 2P', monospace", letterSpacing: '0.04em' }}>
            FREE PREVIEW
          </div>
          <div style={{ fontSize: 10.5, color: '#6b6960', marginTop: 4 }}>
            Top 5 only, no live auction links. <a href="/#pricing" style={{ color: '#c9a84c' }}>Upgrade to Alert+</a> for the full 25-per-category live feed.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Bazaar */}
        <div>
          <div className="section-label" style={{ color: '#1baf7a' }}>💰 Top 5 Bazaar Flips</div>
          {loading ? (
            <div style={{ padding: 20, color: '#6b6960', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>Loading...</div>
          ) : bazaarItems.length === 0 ? (
            <div style={{ padding: 20, color: '#6b6960', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>No data yet</div>
          ) : bazaarItems.map((item, i) => (
            <div key={item.item_id} className="vault-surface gem-tab-sm" style={{
              height: 64, marginBottom: 6, border: '1px solid #1baf7a45', filter: 'drop-shadow(0 0 8px #1baf7a15)',
              padding: '8px 14px 8px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e6df', fontFamily: 'Space Grotesk, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i === 0 && '🥇 '}{i === 1 && '🥈 '}{i === 2 && '🥉 '}
                  {item.item_id.replace(/_/g, ' ').slice(0, 28)}
                </div>
                <div style={{ fontSize: 9, color: '#6b6960', fontFamily: 'Space Mono, monospace', marginTop: 2 }}>
                  {item.sell_price.toFixed(1)} → {item.buy_price.toFixed(1)}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1baf7a', fontFamily: 'Space Mono, monospace', flexShrink: 0, marginLeft: 8, textShadow: '0 0 8px #1baf7a50' }}>
                +{item.spread_pct}%
              </div>
            </div>
          ))}
        </div>

        {/* AH */}
        <div>
          <div className="section-label" style={{ color: '#2a78d6' }}>🎯 Top 5 AH Underpriced</div>
          {loading ? (
            <div style={{ padding: 20, color: '#6b6960', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>Loading...</div>
          ) : ahItems.length === 0 ? (
            <div style={{ padding: 20, color: '#6b6960', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>No data yet</div>
          ) : ahItems.map((item, i) => (
            <div key={item.item_name + i} className="vault-surface gem-tab-sm" style={{
              height: 64, marginBottom: 6, border: '1px solid #2a78d645', filter: 'drop-shadow(0 0 8px #2a78d615)',
              padding: '8px 14px 8px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e6df', fontFamily: 'Space Grotesk, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i === 0 && '🥇 '}{i === 1 && '🥈 '}{i === 2 && '🥉 '}
                  {item.item_name.slice(0, 28)}
                </div>
                {item.category && (
                  <div style={{ fontSize: 9, color: '#6b6960', fontFamily: 'Space Mono, monospace', marginTop: 2, textTransform: 'capitalize' }}>
                    {item.category}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#2a78d6', fontFamily: 'Space Mono, monospace', flexShrink: 0, marginLeft: 8, textShadow: '0 0 8px #2a78d650' }}>
                -{item.discount_pct}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
