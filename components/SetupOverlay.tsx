// components/SetupOverlay.tsx
// Full-screen setup overlay for a Money Making method: a Minecraft-inventory-style
// equipment grid on the left, method description + strategy on the right.
//
// Item icons are Vault-styled placeholders (emoji inside a Minecraft-slot bevel),
// NOT Hypixel's or Mojang's actual texture files -- neither is confirmed freely
// redistributable (Hypixel's dev policy has an explicit anti-trademark-infringement
// clause and no asset-usage grant; Mojang's assets are copyrighted client files).
// A real Vault-owned texture pack is a separate future project.
'use client'
import { useEffect, useState } from 'react'
import SkinArmorRender from './SkinArmorRender'
import { DEFAULT_SKIN_URL } from '../lib/skin-uv-map'

type AnyMethod = Record<string, any>
type Setup = Record<string, any>
type FeedbackData = { positive: number; negative: number; total: number; approval_pct: number | null }

const st = (v: any) => typeof v === 'string' ? v : ''
const nm = (v: any) => typeof v === 'number' ? v : 0
const bl = (v: any) => typeof v === 'boolean' ? v : false
const ar = (v: any): string[] => Array.isArray(v) ? v.filter(x => typeof x === 'string') : []

// ─── Minecraft-style inventory slot ────────────────────────────
function Slot({ icon, label, sub, accentColor, size = 52 }: {
  icon: string; label?: string; sub?: string; accentColor: string; size?: number
}) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:size+18 }}>
      <div title={label} style={{
        width:size, height:size, flexShrink:0,
        background:'linear-gradient(135deg, #1a1917, #0d0d0c)',
        border:`2px solid ${accentColor}45`,
        boxShadow:`inset 2px 2px 0 rgba(0,0,0,0.6), inset -2px -2px 0 ${accentColor}1a, 0 0 8px ${accentColor}15`,
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.42,
      }}>
        {icon}
      </div>
      {label && (
        <div style={{ fontSize:8.5, color:'#9b9b8f', textAlign:'center', marginTop:5, lineHeight:1.3, maxWidth:size+18, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
          {label}
        </div>
      )}
      {sub && <div style={{ fontSize:8, color:accentColor, marginTop:2, fontFamily:'Space Mono, monospace' }}>{sub}</div>}
    </div>
  )
}

// Real Hypixel rarity tiers (the `tier` field on /v2/resources/skyblock/items,
// now captured in item_stats.rarity) mapped to the standard Minecraft/Hypixel
// chat-color convention for each rarity -- not an invented palette.
const RARITY_COLORS: Record<string, string> = {
  COMMON: '#AAAAAA', UNCOMMON: '#55FF55', RARE: '#5555FF', EPIC: '#AA00AA',
  LEGENDARY: '#FFAA00', MYTHIC: '#FF55FF', DIVINE: '#55FFFF',
  SPECIAL: '#FF5555', VERY_SPECIAL: '#FF5555', ADMIN: '#FF5555',
}
const rarityColor = (r: string | null, fallback: string) => (r && RARITY_COLORS[r]) || fallback

// ─── Clickable gear slot with a rich NBT-style tooltip (name colored by
// real rarity, stats, enchants, reforge) -- same slot-icon treatment as the
// accessory slots below, but with a hover panel instead of a plain title=. ───
function GearSlot({ icon, name, rarity, stars, stats, enchants, reforge, accentColor, size = 52 }: {
  icon: string; name: string; rarity?: string | null; stars?: number; stats?: string
  enchants?: string[]; reforge?: string; accentColor: string; size?: number
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const color = rarityColor(rarity || null, accentColor)

  return (
    <div
      onMouseEnter={e => setHover({ x: e.clientX, y: e.clientY })}
      onMouseMove={e => setHover({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHover(null)}
      style={{ display:'flex', flexDirection:'column', alignItems:'center', width:size+18, cursor:'default' }}
    >
      <div style={{
        width:size, height:size, flexShrink:0,
        background:'linear-gradient(135deg, #1a1917, #0d0d0c)',
        border:`2px solid ${color}60`,
        boxShadow:`inset 2px 2px 0 rgba(0,0,0,0.6), inset -2px -2px 0 ${color}1a, 0 0 8px ${color}25`,
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.42,
      }}>
        {icon}
      </div>
      <div style={{ fontSize:8.5, color, fontWeight:700, textAlign:'center', marginTop:5, lineHeight:1.3, maxWidth:size+18, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
        {name}
      </div>

      {hover && (
        <div style={{
          position:'fixed', left:hover.x+16, top:hover.y+10, zIndex:500, pointerEvents:'none', maxWidth:240,
          background:'#111110', border:`1px solid ${color}55`, borderRadius:8, padding:'10px 13px',
          boxShadow:`0 8px 24px rgba(0,0,0,0.6), 0 0 12px ${color}25`,
        }}>
          <div style={{ fontSize:12, fontWeight:700, color, marginBottom: (stats || (enchants && enchants.length) || reforge) ? 5 : 0 }}>
            {name}{stars ? ' ' + '✪'.repeat(Math.min(stars, 5)) : ''}
          </div>
          {stats && <div style={{ fontSize:9.5, color:'#9b9b8f', fontFamily:'Space Mono, monospace', marginBottom: ((enchants && enchants.length) || reforge) ? 4 : 0 }}>{stats}</div>}
          {enchants && enchants.length > 0 && <div style={{ fontSize:9.5, color:'#7ec8e3', marginBottom: reforge ? 4 : 0 }}>{enchants.join(', ')}</div>}
          {reforge && <div style={{ fontSize:9.5, color:'#c9a84c', textTransform:'capitalize' }}>{reforge} reforge</div>}
        </div>
      )}
    </div>
  )
}

function EmptySlot({ size = 52 }: { size?: number }) {
  return (
    <div style={{
      width:size, height:size, flexShrink:0,
      background:'#0a0a09', border:'2px solid rgba(201,168,76,0.1)',
      boxShadow:'inset 2px 2px 0 rgba(0,0,0,0.6), inset -2px -2px 0 rgba(255,255,255,0.03)',
    }} />
  )
}

// ─── Text block for the right panel ────────────────────────────
function InfoBlock({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:8, color, fontFamily:"'Press Start 2P', monospace", letterSpacing:'0.04em', marginBottom:7 }}>{label}</div>
      <div style={{ fontSize:12.5, color:'#d8d6cf', lineHeight:1.7 }}>{children}</div>
    </div>
  )
}

export default function SetupOverlay({ method, tier, accentColor, setup, loading, notReady, feedback, userVote, onClose, onRate }: {
  method: AnyMethod; tier: string; accentColor: string
  setup: Setup | null; loading: boolean; notReady: boolean
  feedback: FeedbackData | null; userVote: 'works' | 'doesnt_work' | null
  onClose: () => void; onRate: () => void
}) {
  const coins = st(method.coins_display)
  const s = setup || {}
  const ew = ar(s.enchants_weapon), ea = ar(s.enchants_armor), et = ar(s.enchants_tool), er = ar(s.enchants_rod)
  const hasArmor = !!st(s.armor_set)
  const hasGear  = hasArmor || st(s.weapon_name) || st(s.tool) || st(s.rod)
  const hasAny = hasGear || st(s.pet_name) || ar(s.accessories).length > 0

  // Skin du joueur connecté (si lié à un compte Hypixel), sinon fallback Steve --
  // /api/player/status est déjà gated Pro (même palier que Money Making lui-même).
  const [skinUrl, setSkinUrl] = useState(DEFAULT_SKIN_URL)
  useEffect(() => {
    let cancelled = false
    fetch('/api/player/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.linked && d?.hypixel_uuid) setSkinUrl(`https://crafatar.com/skins/${d.hypixel_uuid}`) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem 1rem', backdropFilter:'blur(10px)' }}>
      <div
        onClick={e => e.stopPropagation()}
        className="vault-surface"
        style={{
          border:`1px solid ${accentColor}45`,
          filter:`drop-shadow(0 40px 90px rgba(0,0,0,0.85)) drop-shadow(0 0 40px ${accentColor}20)`,
          borderRadius:14, maxWidth:920, width:'100%', maxHeight:'88vh', overflowY:'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding:'20px 26px 16px', borderBottom:`1px solid ${accentColor}20`, position:'sticky', top:0, background:'#111110', zIndex:1, display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:8, color:accentColor, fontFamily:"'Press Start 2P', monospace", letterSpacing:'0.04em', marginBottom:8 }}>EQUIP THIS SETUP</div>
            <div style={{ fontSize:17, fontWeight:700, color:'#e8e6df' }}>{st(method.method)}</div>
          </div>
          {coins && (
            <div className="coin-value" style={{ fontSize:18, whiteSpace:'nowrap', flexShrink:0 }}>{coins}</div>
          )}
          <button onClick={onClose} style={{ background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.15)', color:'#9b9b8f', cursor:'pointer', borderRadius:8, padding:'6px 11px', fontSize:14, flexShrink:0 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding:'60px 20px', textAlign:'center' }}>
            <div style={{ fontSize:9, color:accentColor, fontFamily:"'Press Start 2P', monospace", letterSpacing:'0.08em', marginBottom:16 }}>LOADING SETUP...</div>
            <div style={{ display:'flex', justifyContent:'center', gap:7 }}>
              {[0,1,2].map(i=><div key={i} style={{ width:7,height:7,borderRadius:'50%',background:accentColor,animation:`ov_pulse 1.2s ${i*0.2}s infinite`,opacity:0.7 }}/>)}
            </div>
            <style>{`@keyframes ov_pulse{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.6);opacity:1}}`}</style>
          </div>
        ) : notReady ? (
          <div style={{ padding:'60px 20px', textAlign:'center' }}>
            <div style={{ fontSize:22, marginBottom:10 }}>⏳</div>
            <div style={{ fontSize:11, color:'#6b6960', fontFamily:'Space Mono, monospace', marginBottom:4 }}>Setup not yet generated</div>
            <div style={{ fontSize:10, color:'#3a3a38', fontFamily:'Space Mono, monospace' }}>Available after Monday 7h UTC</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:0 }}>

            {/* LEFT — Minecraft-style inventory */}
            <div style={{ padding:'22px 20px', borderRight:`1px solid ${accentColor}18` }}>
              <div style={{ fontSize:7.5, color:'#8a6e2f', fontFamily:"'Press Start 2P', monospace", letterSpacing:'0.03em', marginBottom:14 }}>INVENTORY</div>

              {!hasAny ? (
                <div style={{ fontSize:10.5, color:'#3a3a38', fontFamily:'Space Mono, monospace', textAlign:'center', padding:'20px 0' }}>No gear specified for this method</div>
              ) : (
                <>
                  {/* Skin + armor -- hover a piece for its stats */}
                  {hasGear && (
                    <div style={{ marginBottom:10 }}>
                      <SkinArmorRender skinUrl={skinUrl} setup={s} accentColor={accentColor} />
                    </div>
                  )}

                  {/* Weapon / Tool / Rod -- clickable slots, same treatment as accessories below */}
                  {(st(s.weapon_name)||st(s.tool)||st(s.rod)) && (
                    <div style={{ marginBottom:16 }}>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        {st(s.weapon_name) && (
                          <GearSlot icon="⚔️" name={st(s.weapon_name)} rarity={st(s.weapon_rarity)||null}
                            stars={nm(s.weapon_stars)} stats={st(s.weapon_stats)} enchants={ew}
                            reforge={st(s.weapon_reforge)} accentColor={accentColor} />
                        )}
                        {st(s.tool) && (
                          <GearSlot icon="⛏️" name={st(s.tool)} rarity={st(s.tool_rarity)||null}
                            enchants={et} accentColor={accentColor} />
                        )}
                        {st(s.rod) && (
                          <GearSlot icon="🎣" name={st(s.rod)} rarity={st(s.rod_rarity)||null}
                            enchants={er} accentColor={accentColor} />
                        )}
                      </div>
                      {st(s.weapon_ability) && <div style={{ fontSize:9.5, color:'#2a78d6', marginTop:6 }}>{st(s.weapon_ability)}</div>}
                    </div>
                  )}

                  {/* Pet + Accessories */}
                  {(st(s.pet_name)||ar(s.accessories).length>0) && (
                    <div style={{ marginBottom:16 }}>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        {st(s.pet_name) && <Slot icon="🐾" label={st(s.pet_name)} sub={'L'+(nm(s.pet_level)||100)} accentColor={accentColor} />}
                        {ar(s.accessories).map((acc,i)=><Slot key={i} icon="💍" label={acc} accentColor={accentColor} size={44} />)}
                      </div>
                      {(nm(s.mp_target)>0||st(s.power_stone)) && (
                        <div style={{ fontSize:9.5, color:'#c9a84c', marginTop:6, fontFamily:'Space Mono, monospace' }}>
                          MP {nm(s.mp_target)||900}+{st(s.power_stone)?' · '+st(s.power_stone):''}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Enchants / Gems / Reforges — modifiers, not slots */}
                  {(ew.length>0||ea.length>0||et.length>0||er.length>0||st(s.gemstones)||st(s.reforges)) && (
                    <div style={{ borderTop:`1px solid ${accentColor}15`, paddingTop:12, marginTop:4 }}>
                      <div style={{ fontSize:7.5, color:'#8a6e2f', fontFamily:"'Press Start 2P', monospace", letterSpacing:'0.03em', marginBottom:8 }}>MODIFIERS</div>
                      {ew.length>0 && <div style={{ fontSize:10, color:'#9b9b8f', marginBottom:4 }}><b style={{color:'#e8e6df'}}>Weapon:</b> {ew.join(', ')}</div>}
                      {ea.length>0 && <div style={{ fontSize:10, color:'#9b9b8f', marginBottom:4 }}><b style={{color:'#e8e6df'}}>Armor:</b> {ea.join(', ')}</div>}
                      {et.length>0 && <div style={{ fontSize:10, color:'#9b9b8f', marginBottom:4 }}><b style={{color:'#e8e6df'}}>Drill:</b> {et.join(', ')}</div>}
                      {er.length>0 && <div style={{ fontSize:10, color:'#9b9b8f', marginBottom:4 }}><b style={{color:'#e8e6df'}}>Rod:</b> {er.join(', ')}</div>}
                      {st(s.gemstones) && <div style={{ fontSize:10, color:'#9b9b8f', marginBottom:4 }}><b style={{color:'#e8e6df'}}>Gems:</b> {st(s.gemstones)}</div>}
                      {st(s.reforges) && <div style={{ fontSize:10, color:'#9b9b8f' }}><b style={{color:'#e8e6df'}}>Reforges:</b> {st(s.reforges)}</div>}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* RIGHT — Description + Strategy */}
            <div style={{ padding:'22px 26px' }}>
              {(st(s.how_to)||st(s.why_best)) && (
                <InfoBlock label="⚡ HOW TO" color={accentColor}>
                  {st(s.how_to)}
                  {st(s.why_best) && <div style={{ marginTop:8, fontSize:11.5, color:'#6b6960', fontStyle:'italic', paddingLeft:10, borderLeft:`2px solid ${accentColor}35` }}>→ {st(s.why_best)}</div>}
                </InfoBlock>
              )}
              {st(s.gear_justification) && <InfoBlock label="🛡️ GEAR CHOICE" color={accentColor}><span style={{color:'#9b9b8f'}}>{st(s.gear_justification)}</span></InfoBlock>}
              {st(s.strategy) && <InfoBlock label="👹 STRATEGY" color={accentColor}>{st(s.strategy)}</InfoBlock>}
              {st(s.team_config) && <InfoBlock label="🏰 TEAM SETUP" color={accentColor}>{st(s.team_config)}</InfoBlock>}
              {st(s.location) && <InfoBlock label="🗺️ LOCATION" color={accentColor}>{st(s.location)}</InfoBlock>}
              {st(s.target_stats) && (
                <InfoBlock label="🎯 TARGET STATS" color={accentColor}>
                  <span style={{ fontFamily:'Space Mono, monospace', color:'#1baf7a', fontWeight:700 }}>{st(s.target_stats)}</span>
                </InfoBlock>
              )}
              {st(s.requirements) && <InfoBlock label="📋 REQUIREMENTS" color={accentColor}><span style={{color:'#9b9b8f'}}>{st(s.requirements)}</span></InfoBlock>}
              {st(s.hotm_perks) && <InfoBlock label="⛏️ HOTM PERKS" color={accentColor}>{st(s.hotm_perks)}</InfoBlock>}
              {(st(s.cost_budget)||st(s.cost_optimal)||st(s.cost_endgame)) && (
                <InfoBlock label="💰 COST" color={accentColor}>
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    {st(s.cost_budget)  && <div><span style={{ color:'#1baf7a', fontWeight:700 }}>Budget: </span><span style={{color:'#9b9b8f'}}>{st(s.cost_budget)}</span></div>}
                    {st(s.cost_optimal) && <div><span style={{ color:'#c9a84c', fontWeight:700 }}>Optimal: </span><span style={{color:'#9b9b8f'}}>{st(s.cost_optimal)}</span></div>}
                    {st(s.cost_endgame) && <div><span style={{ color:'#9b59b6', fontWeight:700 }}>BiS: </span><span style={{color:'#9b9b8f'}}>{st(s.cost_endgame)}</span></div>}
                  </div>
                </InfoBlock>
              )}
            </div>
          </div>
        )}

        {/* Footer — feedback bar */}
        {!loading && !notReady && (
          <div style={{ padding:'13px 26px', background:'#0c0c0b', borderTop:`1px solid ${accentColor}18`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div style={{ flex:1 }}>
              {feedback && feedback.total>0 ? (
                <div style={{ fontSize:10.5, color:'#6b6960', fontFamily:'Space Mono, monospace' }}>
                  <span style={{ color:'#1baf7a' }}>✅ {feedback.positive}</span> · <span style={{ color:'#e34948' }}>❌ {feedback.negative}</span> · <span>{feedback.total} players</span>
                </div>
              ) : (
                <div style={{ fontSize:10.5, color:'#2a2a28', fontFamily:'Space Mono, monospace' }}>No ratings yet — be first!</div>
              )}
            </div>
            {userVote ? (
              <div style={{ fontSize:10.5, color:userVote==='works'?'#1baf7a':'#e34948', fontFamily:'Space Mono, monospace', fontWeight:700 }}>
                {userVote==='works'?'✅ Works':'❌ Issue'} — Your vote
              </div>
            ) : (
              <button onClick={onRate} style={{ padding:'7px 16px', borderRadius:6, border:`1px solid ${accentColor}45`, background:accentColor+'12', boxShadow:`0 0 10px ${accentColor}15`, color:accentColor, fontSize:9, fontFamily:"'Press Start 2P', monospace", cursor:'pointer', whiteSpace:'nowrap' }}>
                RATE ›
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
