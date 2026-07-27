// components/MoneyMakingSection.tsx
// Visuel 100% React — Claude fournit uniquement du texte
'use client'
import { useState, useCallback } from 'react'

type AnyMethod = Record<string, any>
type Setup = Record<string, any>
type FeedbackData = { positive: number; negative: number; total: number; approval_pct: number | null }

const TIERS = [
  { key:'early', label:'Early', emoji:'🌱', target:'10M/h', color:'#1baf7a', desc:'0-50M networth' },
  { key:'mid',   label:'Mid',   emoji:'⚔️', target:'25M/h', color:'#c9a84c', desc:'50-500M networth' },
  { key:'end',   label:'End',   emoji:'🔥', target:'50M/h', color:'#e34948', desc:'500M-5B networth' },
  { key:'late',  label:'Late',  emoji:'👑', target:'70M+/h',color:'#9b59b6', desc:'5B+ networth' },
]

const SKILL_ICONS: Record<string, string> = {
  combat:'⚔️', mining:'⛏️', farming:'🌾', fishing:'🎣', foraging:'🌲'
}

const CONF_COLORS: Record<string, string> = { HIGH:'#1baf7a', MED:'#c9a84c', LOW:'#e34948' }

const st = (v: any) => typeof v === 'string' ? v : ''
const nm = (v: any) => typeof v === 'number' ? v : 0
const bl = (v: any) => typeof v === 'boolean' ? v : false
const ar = (v: any): string[] => Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
const methodKey = (m: any) =>
  (st(m.id)||st(m.method)).toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'').slice(0,80)

// ─── Stars ────────────────────────────────────────────────────
function Stars({ count }: { count: number }) {
  const c = Math.min(Math.max(nm(count),0),7)
  return c ? <span style={{ color:'#c9a84c', fontSize:10, marginLeft:4, letterSpacing:1 }}>{'⭐'.repeat(c)}</span> : null
}

// ─── Tag ──────────────────────────────────────────────────────
function Tag({ text, color='#c9a84c' }: { text: string; color?: string }) {
  if (!text) return null
  return <span style={{ display:'inline-block', fontSize:9, padding:'1px 7px', borderRadius:4, background:color+'15', border:'1px solid '+color+'28', color, margin:'2px 3px 2px 0', fontFamily:'Space Mono, monospace', whiteSpace:'nowrap', fontWeight:600 }}>{text}</span>
}

// ─── Row ──────────────────────────────────────────────────────
function Row({ icon, label, children }: { icon:string; label:string; children:React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize:14, width:22, textAlign:'center', flexShrink:0, paddingTop:1 }}>{icon}</span>
      <span style={{ fontSize:8.5, fontFamily:'Space Mono, monospace', color:'#4a4a45', textTransform:'uppercase', letterSpacing:'0.1em', width:76, flexShrink:0, paddingTop:2 }}>{label}</span>
      <div style={{ flex:1, fontSize:11.5, color:'#cac8c0', lineHeight:1.6 }}>{children}</div>
    </div>
  )
}

// ─── Setup Panel ─────────────────────────────────────────────
function SetupPanel({ setup }: { setup: Setup }) {
  const ew = ar(setup.enchants_weapon), ea = ar(setup.enchants_armor)
  const et = ar(setup.enchants_tool),   er = ar(setup.enchants_rod)

  return (
    <div style={{ background:'#0a0a09', padding:'16px 18px 14px' }}>

      {/* HOW TO */}
      {(st(setup.how_to)||st(setup.why_best)) && (
        <div style={{ background:'linear-gradient(135deg,rgba(201,168,76,0.06),rgba(201,168,76,0.02))', border:'1px solid rgba(201,168,76,0.12)', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
          <div style={{ fontSize:8.5, color:'#c9a84c', fontFamily:'Space Mono, monospace', letterSpacing:'0.12em', marginBottom:7, textTransform:'uppercase', fontWeight:700 }}>⚡ How To</div>
          {st(setup.how_to)   && <div style={{ fontSize:12.5, color:'#d8d6cf', lineHeight:1.75 }}>{st(setup.how_to)}</div>}
          {st(setup.why_best) && <div style={{ fontSize:11, color:'#6b6960', marginTop:8, fontStyle:'italic', paddingLeft:10, borderLeft:'2px solid rgba(201,168,76,0.2)' }}>→ {st(setup.why_best)}</div>}
        </div>
      )}

      {st(setup.armor_set) && (
        <Row icon="🛡" label="Armor">
          <div><strong style={{ color:'#e8e6df' }}>{st(setup.armor_set)}</strong><Stars count={nm(setup.armor_stars)} />{bl(setup.armor_recomb)&&<Tag text="RECOMB" color="#9b59b6"/>}</div>
          {st(setup.armor_stats) && <div style={{ fontSize:10.5, color:'#6b6960', marginTop:3 }}>{st(setup.armor_stats)}</div>}
          {st(setup.armor_bonus) && <div style={{ fontSize:10.5, color:'#9b59b6', marginTop:2 }}>{st(setup.armor_bonus)}</div>}
        </Row>
      )}
      {st(setup.weapon_name) && (
        <Row icon="⚔️" label="Weapon">
          <div><strong style={{ color:'#e8e6df' }}>{st(setup.weapon_name)}</strong><Stars count={nm(setup.weapon_stars)} />{bl(setup.weapon_recomb)&&<Tag text="RECOMB" color="#9b59b6"/>}</div>
          {st(setup.weapon_stats)   && <div style={{ fontSize:10.5, color:'#6b6960', marginTop:3 }}>{st(setup.weapon_stats)}</div>}
          {st(setup.weapon_ability) && <div style={{ fontSize:10.5, color:'#2a78d6', marginTop:2 }}>{st(setup.weapon_ability)}</div>}
        </Row>
      )}
      {st(setup.tool) && <Row icon="⛏️" label="Drill"><span style={{ color:'#e8e6df' }}>{st(setup.tool)}</span></Row>}
      {st(setup.rod)  && <Row icon="🎣" label="Rod"><span style={{ color:'#e8e6df' }}>{st(setup.rod)}</span></Row>}
      {st(setup.pet_name) && (
        <Row icon="🐾" label="Pet">
          <div><strong style={{ color:'#e8e6df' }}>{st(setup.pet_name)}</strong><Tag text={'L'+(nm(setup.pet_level)||100)} color="#1baf7a"/><Tag text={(st(setup.pet_rarity)||'LEG').slice(0,3)} color="#9b59b6"/></div>
          {st(setup.pet_bonus) && <div style={{ fontSize:10.5, color:'#1baf7a', marginTop:3 }}>{st(setup.pet_bonus)}</div>}
          {st(setup.pet_alt)   && <div style={{ fontSize:10, color:'#4a4a45', marginTop:2 }}>Alt: {st(setup.pet_alt)}</div>}
        </Row>
      )}
      {(ar(setup.accessories).length>0||st(setup.power_stone)||nm(setup.mp_target)) && (
        <Row icon="💍" label="Access.">
          <div style={{ marginBottom:5 }}><Tag text={'MP '+(nm(setup.mp_target)||900)+'+'} color="#c9a84c"/>{st(setup.power_stone)&&<Tag text={st(setup.power_stone)} color="#9b59b6"/>}</div>
          {ar(setup.accessories).length>0&&<div>{ar(setup.accessories).map((x,i)=><Tag key={i} text={x}/>)}</div>}
        </Row>
      )}
      {(ew.length>0||ea.length>0||et.length>0||er.length>0) && (
        <Row icon="✨" label="Enchants">
          {ew.length>0&&<div style={{marginBottom:4}}><span style={{fontSize:8.5,color:'#4a4a45',fontFamily:'Space Mono, monospace',marginRight:4}}>Weapon:</span>{ew.map((e,i)=><Tag key={i} text={e} color="#2a78d6"/>)}</div>}
          {ea.length>0&&<div style={{marginBottom:4}}><span style={{fontSize:8.5,color:'#4a4a45',fontFamily:'Space Mono, monospace',marginRight:4}}>Armor:</span>{ea.map((e,i)=><Tag key={i} text={e} color="#2a78d6"/>)}</div>}
          {et.length>0&&<div style={{marginBottom:4}}><span style={{fontSize:8.5,color:'#4a4a45',fontFamily:'Space Mono, monospace',marginRight:4}}>Drill:</span>{et.map((e,i)=><Tag key={i} text={e} color="#2a78d6"/>)}</div>}
          {er.length>0&&<div><span style={{fontSize:8.5,color:'#4a4a45',fontFamily:'Space Mono, monospace',marginRight:4}}>Rod:</span>{er.map((e,i)=><Tag key={i} text={e} color="#2a78d6"/>)}</div>}
        </Row>
      )}
      {st(setup.gemstones)    && <Row icon="💎" label="Gems"><span style={{color:'#e8e6df'}}>{st(setup.gemstones)}</span></Row>}
      {st(setup.reforges)     && <Row icon="🔮" label="Reforges"><span style={{color:'#e8e6df'}}>{st(setup.reforges)}</span></Row>}
      {st(setup.target_stats) && <Row icon="🎯" label="Stats"><span style={{fontFamily:'Space Mono, monospace',fontSize:10.5,color:'#1baf7a',fontWeight:700}}>{st(setup.target_stats)}</span></Row>}
      {st(setup.requirements) && <Row icon="📋" label="Reqs"><span style={{color:'#9b9b8f'}}>{st(setup.requirements)}</span></Row>}
      {(st(setup.cost_budget)||st(setup.cost_optimal)||st(setup.cost_endgame)) && (
        <Row icon="💰" label="Cost">
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            {st(setup.cost_budget)  &&<div><Tag text="Budget" color="#1baf7a"/><span style={{fontSize:10.5,color:'#9b9b8f'}}>{st(setup.cost_budget)}</span></div>}
            {st(setup.cost_optimal) &&<div><Tag text="Optimal" color="#c9a84c"/><span style={{fontSize:10.5,color:'#9b9b8f'}}>{st(setup.cost_optimal)}</span></div>}
            {st(setup.cost_endgame) &&<div><Tag text="BiS" color="#9b59b6"/><span style={{fontSize:10.5,color:'#9b9b8f'}}>{st(setup.cost_endgame)}</span></div>}
          </div>
        </Row>
      )}
      {st(setup.location)    && <Row icon="🗺️" label="Location"><span style={{color:'#e8e6df'}}>{st(setup.location)}</span></Row>}
      {st(setup.strategy)    && <Row icon="👹" label="Strategy"><span style={{color:'#e8e6df',lineHeight:1.6}}>{st(setup.strategy)}</span></Row>}
      {st(setup.team_config) && <Row icon="🏰" label="Team"><span style={{color:'#e8e6df',lineHeight:1.6}}>{st(setup.team_config)}</span></Row>}
      {st(setup.hotm_perks)  && <Row icon="⛏️" label="HotM"><span style={{color:'#e8e6df'}}>{st(setup.hotm_perks)}</span></Row>}
    </div>
  )
}

// ─── Vote Modal ───────────────────────────────────────────────
function VoteModal({ method, tier, onClose, onVoted }: {
  method:AnyMethod; tier:string; onClose:()=>void; onVoted:(v:'works'|'doesnt_work',c:string)=>void
}) {
  const [vote, setVote] = useState<'works'|'doesnt_work'|null>(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!vote) return
    setLoading(true)
    try {
      await fetch('/api/method/vote', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ method_id: methodKey(method), tier, vote, comment: comment.trim()||null })
      })
      onVoted(vote, comment)
    } catch {}
    setLoading(false)
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem', backdropFilter:'blur(8px)' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#0f0f0e', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:'24px', maxWidth:420, width:'100%', boxShadow:'0 40px 80px rgba(0,0,0,0.8)' }}>
        <div style={{ fontSize:9, color:'#c9a84c', fontFamily:'Space Mono, monospace', letterSpacing:'0.12em', marginBottom:10, textTransform:'uppercase' }}>Community Feedback</div>
        <div style={{ fontSize:15, fontWeight:700, color:'#e8e6df', marginBottom:5 }}>Did this work for you?</div>
        <div style={{ fontSize:11.5, color:'#6b6960', marginBottom:20 }}>{st(method.method)}</div>

        <div style={{ display:'flex', gap:10, marginBottom:18 }}>
          {(['works','doesnt_work'] as const).map(v => {
            const isWorks = v==='works'
            const active  = vote===v
            const col     = isWorks?'#1baf7a':'#e34948'
            return (
              <button key={v} onClick={()=>setVote(v)} style={{
                flex:1, padding:'14px', borderRadius:10, cursor:'pointer', transition:'all 0.15s',
                border:`1px solid ${active?col:'rgba(255,255,255,0.08)'}`,
                background: active?col+'15':'transparent',
                color: active?col:'#6b6960',
                fontFamily:'Space Grotesk, sans-serif', fontWeight:600, fontSize:13,
                display:'flex', alignItems:'center', justifyContent:'center', gap:8
              }}>
                <span style={{fontSize:18}}>{isWorks?'✅':'❌'}</span>
                {isWorks?'Works!':'Didn\'t work'}
              </button>
            )
          })}
        </div>

        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:9.5, color:'#4a4a45', fontFamily:'Space Mono, monospace', marginBottom:7, textTransform:'uppercase', letterSpacing:'0.08em' }}>
            Comment (optional) — helps Vault improve
          </div>
          <textarea
            value={comment} onChange={e=>setComment(e.target.value)}
            placeholder={vote==='doesnt_work'?"What was wrong? (coins/h, gear cost, wrong info...)":"Tips for other players?"}
            maxLength={500} rows={3}
            style={{ width:'100%', background:'#111110', border:'1px solid rgba(255,255,255,0.08)', borderRadius:9, padding:'10px 13px', color:'#e8e6df', fontFamily:'Space Grotesk, sans-serif', fontSize:12, lineHeight:1.55, resize:'none', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s' }}
          />
          <div style={{ fontSize:9, color:'#2a2a28', textAlign:'right', marginTop:3 }}>{comment.length}/500</div>
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:8, border:'1px solid rgba(255,255,255,0.07)', background:'transparent', color:'#4a4a45', cursor:'pointer', fontFamily:'Space Grotesk, sans-serif', fontSize:12 }}>Cancel</button>
          <button onClick={submit} disabled={!vote||loading} style={{
            flex:2, padding:'11px', borderRadius:8, border:'none',
            background: !vote?'#1a1a18':vote==='works'?'#1baf7a':'#e34948',
            color: !vote?'#3a3a38':'#fff', cursor:!vote?'not-allowed':'pointer',
            fontFamily:'Space Grotesk, sans-serif', fontWeight:700, fontSize:13, transition:'all 0.15s'
          }}>{loading?'Sending...':'Submit feedback'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Feedback Badge ───────────────────────────────────────────
function FeedbackBadge({ fb }: { fb: FeedbackData }) {
  if (!fb||fb.total===0) return null
  const pct   = fb.approval_pct ?? 0
  const color = pct>=70?'#1baf7a':pct>=40?'#c9a84c':'#e34948'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:9, fontFamily:'Space Mono, monospace' }}>
      <span style={{ color:'#1baf7a' }}>✅{fb.positive}</span>
      <span style={{ color:'#2a2a28' }}>·</span>
      <span style={{ color:'#e34948' }}>❌{fb.negative}</span>
      <span style={{ color, fontWeight:700 }}>({pct}%)</span>
    </div>
  )
}

// ─── Method Card ─────────────────────────────────────────────
function MethodCard({ method, tier, accentColor, type }: {
  method:AnyMethod; tier:string; accentColor:string; type:'active'|'vault'
}) {
  const [expanded, setExpanded]   = useState(false)
  const [setup, setSetup]         = useState<Setup|null>(null)
  const [loading, setLoading]     = useState(false)
  const [notReady, setNotReady]   = useState(false)
  const [showVote, setShowVote]   = useState(false)
  const [userVote, setUserVote]   = useState<'works'|'doesnt_work'|null>(null)
  const [feedback, setFeedback]   = useState<FeedbackData|null>(null)
  const [fbLoaded, setFbLoaded]   = useState(false)

  const key       = methodKey(method)
  const skill     = type==='active'?st(method.skill):ar(method.skills_combined).join('+')
  const skillIcon = SKILL_ICONS[st(method.skill)]||SKILL_ICONS[ar(method.skills_combined)[0]]||'⚡'
  const confColor = CONF_COLORS[st(method.confidence)]||'#c9a84c'

  const loadFeedback = useCallback(async () => {
    if (fbLoaded) return
    try {
      const res  = await fetch(`/api/method/vote?method_id=${encodeURIComponent(key)}&tier=${tier}`)
      const data = await res.json()
      setFeedback(data)
    } catch {}
    setFbLoaded(true)
  }, [key, tier, fbLoaded])

  async function toggle() {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    loadFeedback()
    if (setup||notReady) return
    setLoading(true)
    try {
      const res  = await fetch('/api/setup/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({method,tier}) })
      const data = await res.json()
      if (data.not_ready||data.error) setNotReady(true)
      else if (data.setup) setSetup(data.setup)
      else setNotReady(true)
    } catch { setNotReady(true) }
    finally   { setLoading(false) }
  }

  function onVoted(vote:'works'|'doesnt_work') {
    setUserVote(vote)
    setShowVote(false)
    setFeedback(prev=>prev?{
      ...prev,
      positive: vote==='works'?prev.positive+1:prev.positive,
      negative: vote==='doesnt_work'?prev.negative+1:prev.negative,
      total:    prev.total+1,
      approval_pct: Math.round((vote==='works'?prev.positive+1:prev.positive)/(prev.total+1)*100)
    }:{ positive:vote==='works'?1:0, negative:vote==='doesnt_work'?1:0, total:1, approval_pct:vote==='works'?100:0 })
  }

  const coins   = st(method.coins_display)
  const preview = st(method.why_best)||st(method.the_edge)

  return (
    <>
      <div style={{ marginBottom:10 }}>
        {/* Header card */}
        <div
          onClick={toggle}
          style={{
            background:   expanded?accentColor+'0d':'#0f0f0e',
            border:       `1px solid ${expanded?accentColor+'35':'rgba(255,255,255,0.07)'}`,
            borderLeft:   `3px solid ${accentColor}`,
            borderRadius: expanded?'10px 10px 0 0':10,
            padding:      '12px 14px', cursor:'pointer', transition:'all 0.15s',
          }}
        >
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* Skill icon */}
            <div style={{ width:36, height:36, borderRadius:8, flexShrink:0, background:accentColor+'12', border:'1px solid '+accentColor+'25', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
              {skillIcon}
            </div>

            {/* Name */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12.5, fontWeight:700, color:'#e8e6df', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:3 }}>
                {st(method.method)}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {skill && <span style={{ fontSize:9, color:accentColor+'bb', fontFamily:'Space Mono, monospace', textTransform:'uppercase', letterSpacing:'0.06em' }}>{skill.replace(/_/g,' ')}</span>}
                {feedback && <FeedbackBadge fb={feedback} />}
              </div>
            </div>

            {/* Coins + conf */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
              {coins && (
                <div style={{ fontSize:13, fontWeight:700, color:accentColor, fontFamily:'Space Mono, monospace', textShadow:'0 0 12px '+accentColor+'40' }}>
                  {coins}
                </div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:8, color:confColor, background:confColor+'13', border:'1px solid '+confColor+'20', padding:'1px 6px', borderRadius:4, fontFamily:'Space Mono, monospace', fontWeight:700 }}>
                  {st(method.confidence)||'MED'}
                </span>
                <span style={{ fontSize:14, color:accentColor, transform:expanded?'rotate(90deg)':'none', transition:'transform 0.2s', display:'inline-block' }}>›</span>
              </div>
            </div>
          </div>

          {/* Preview */}
          {!expanded && preview && (
            <div style={{ marginTop:6, paddingLeft:46, fontSize:10.5, color:'#4a4a45', lineHeight:1.4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical' }}>
              {preview}
            </div>
          )}
        </div>

        {/* Accordion */}
        {expanded && (
          <div style={{ border:'1px solid '+accentColor+'22', borderTop:'none', borderRadius:'0 0 10px 10px', overflow:'hidden' }}>
            {loading ? (
              <div style={{ padding:'24px', textAlign:'center', background:'#0a0a09' }}>
                <div style={{ fontSize:9.5, color:accentColor, fontFamily:'Space Mono, monospace', letterSpacing:'0.1em', marginBottom:12 }}>LOADING SETUP...</div>
                <div style={{ display:'flex', justifyContent:'center', gap:6 }}>
                  {[0,1,2].map(i=><div key={i} style={{ width:6,height:6,borderRadius:'50%',background:accentColor,animation:`mm_pulse 1.2s ${i*0.2}s infinite`,opacity:0.7 }}/>)}
                </div>
              </div>
            ) : notReady ? (
              <div style={{ padding:'18px', background:'#0a0a09', textAlign:'center' }}>
                <div style={{ fontSize:14, marginBottom:6 }}>⏳</div>
                <div style={{ fontSize:10, color:'#4a4a45', fontFamily:'Space Mono, monospace', marginBottom:3 }}>Setup not yet generated</div>
                <div style={{ fontSize:9.5, color:'#2a2a28', fontFamily:'Space Mono, monospace' }}>Available after Monday 7h UTC</div>
              </div>
            ) : setup ? (
              <SetupPanel setup={setup} />
            ) : null}

            {/* Feedback bar */}
            <div style={{ padding:'11px 14px', background:'#0c0c0b', borderTop:'1px solid rgba(255,255,255,0.04)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
              <div style={{ flex:1 }}>
                {feedback&&feedback.total>0 ? (
                  <div style={{ fontSize:10, color:'#6b6960', fontFamily:'Space Mono, monospace' }}>
                    <span style={{ color:'#1baf7a' }}>✅ {feedback.positive}</span> · <span style={{ color:'#e34948' }}>❌ {feedback.negative}</span> · <span>{feedback.total} players</span>
                  </div>
                ) : (
                  <div style={{ fontSize:10, color:'#2a2a28', fontFamily:'Space Mono, monospace' }}>No ratings yet — be first!</div>
                )}
              </div>
              {userVote ? (
                <div style={{ fontSize:10, color:userVote==='works'?'#1baf7a':'#e34948', fontFamily:'Space Mono, monospace', fontWeight:700 }}>
                  {userVote==='works'?'✅ Works':'❌ Issue'} — Your vote
                </div>
              ) : (
                <button
                  onClick={e=>{ e.stopPropagation(); setShowVote(true) }}
                  style={{ padding:'5px 13px', borderRadius:6, border:'1px solid rgba(201,168,76,0.2)', background:'rgba(201,168,76,0.06)', color:'#c9a84c', fontSize:9.5, fontFamily:'Space Mono, monospace', cursor:'pointer', fontWeight:700, whiteSpace:'nowrap' }}
                >Rate this ›</button>
              )}
            </div>
          </div>
        )}
      </div>

      {showVote && <VoteModal method={method} tier={tier} onClose={()=>setShowVote(false)} onVoted={onVoted} />}
    </>
  )
}

// ─── Main Section ─────────────────────────────────────────────
export default function MoneyMakingSection({ marketData, dataLoading }: {
  marketData: Record<string,string>; dataLoading: boolean
}) {
  const [mmTier, setMmTier] = useState('early')
  const tier = TIERS.find(t=>t.key===mmTier)||TIERS[0]

  let active: AnyMethod[] = [], vault: AnyMethod[] = [], summary = ''
  try {
    const raw = marketData['money_making_'+mmTier]||''
    if (raw) {
      const parsed = JSON.parse(raw)
      active  = Array.isArray(parsed.active)?parsed.active:[]
      vault   = Array.isArray(parsed.vault) ?parsed.vault :[]
      summary = typeof parsed.comparison_summary==='string'?parsed.comparison_summary:''
    }
  } catch {}

  return (
    <div>
      <style>{`@keyframes mm_pulse{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.6);opacity:1}}`}</style>

      {/* Section title -- same branded-banner pattern as Patch Analysis and Radar */}
      <div style={{ marginBottom:20, padding:'12px 16px', background:'linear-gradient(135deg, rgba(201,168,76,0.06) 0%, rgba(201,168,76,0.02) 100%)', border:'1px solid rgba(201,168,76,0.12)', borderRadius:10, display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:20 }}>💰</span>
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'#c9a84c', fontFamily:"'Press Start 2P', monospace", letterSpacing:'0.04em' }}>MONEY MAKING</div>
          <div style={{ fontSize:10, color:'#3a3a38', marginTop:2 }}>Active Grind (verified methods) + Vault Exclusive (AI-discovered), per net worth tier</div>
        </div>
        <div style={{ marginLeft:'auto', fontSize:8.5, color:'#3a3a38', fontFamily:'Space Mono, monospace', textAlign:'right' }}>
          Updated weekly<br/>by Vault AI
        </div>
      </div>

      {/* Tier selector */}
      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {TIERS.map(t => {
          const active = mmTier===t.key
          return (
            <button key={t.key} onClick={()=>setMmTier(t.key)} style={{
              flex:1, padding:'12px 8px', borderRadius:10,
              border:`1px solid ${active?t.color+'50':'rgba(255,255,255,0.06)'}`,
              background: active?`linear-gradient(135deg,${t.color}12,${t.color}06)`:'#0f0f0e',
              color: active?t.color:'#4a4a45',
              cursor:'pointer', textAlign:'center', transition:'all 0.2s',
              fontFamily:'Space Grotesk, sans-serif', fontWeight:500,
              boxShadow: active?`0 0 20px ${t.color}15`:'none',
            }}>
              <div style={{ fontSize:18, marginBottom:3 }}>{t.emoji}</div>
              <div style={{ fontWeight:700, fontSize:12.5 }}>{t.label}</div>
              <div style={{ fontSize:8.5, fontFamily:'Space Mono, monospace', marginTop:2, color:active?t.color+'cc':'#2a2a28' }}>{t.target}</div>
              <div style={{ fontSize:8, color:active?t.color+'66':'#1a1a18', marginTop:1 }}>{t.desc}</div>
            </button>
          )
        })}
      </div>

      {/* Banner */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:summary?10:16, padding:'10px 16px', background:`linear-gradient(135deg,${tier.color}08,${tier.color}03)`, border:'1px solid '+tier.color+'18', borderRadius:9 }}>
        <span style={{ fontSize:20 }}>{tier.emoji}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:tier.color, fontFamily:'Space Mono, monospace', letterSpacing:'0.08em' }}>TARGET {tier.target} minimum · {tier.desc}</div>
          <div style={{ fontSize:10, color:'#3a3a38', marginTop:2 }}>Click any method → full gear setup + community feedback</div>
        </div>
        <div style={{ fontSize:8.5, fontFamily:'Space Mono, monospace', color:'#3a3a38', padding:'3px 9px', background:'rgba(255,255,255,0.02)', borderRadius:5, border:'1px solid rgba(255,255,255,0.04)' }}>Weekly AI</div>
      </div>

      {/* This week analysis */}
      {summary && (
        <div style={{ marginBottom:16, padding:'11px 15px', background:'#0f0f0e', border:'1px solid rgba(255,255,255,0.06)', borderRadius:8 }}>
          <div style={{ fontSize:8.5, color:'#4a4a45', fontFamily:'Space Mono, monospace', letterSpacing:'0.1em', marginBottom:5, textTransform:'uppercase' }}>📊 This Week's Analysis</div>
          <div style={{ fontSize:11.5, color:'#9b9b8f', lineHeight:1.65 }}>{summary}</div>
        </div>
      )}

      {/* Grid */}
      {dataLoading ? (
        <div style={{ color:'#2a2a28', fontSize:10.5, textAlign:'center', padding:'4rem', fontFamily:'Space Mono, monospace', letterSpacing:'0.08em' }}>LOADING AI ANALYSIS...</div>
      ) : active.length===0&&vault.length===0 ? (
        <div style={{ color:'#2a2a28', fontSize:10.5, textAlign:'center', padding:'4rem', fontFamily:'Space Mono, monospace' }}>AI analysis available after Monday 6h UTC</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>

          {/* Active Grind */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, padding:'8px 12px', background:'#0f0f0e', border:'1px solid rgba(255,255,255,0.05)', borderRadius:7 }}>
              <span style={{ fontSize:14 }}>⚔️</span>
              <div>
                <div style={{ fontSize:9.5, fontWeight:700, fontFamily:'Space Mono, monospace', color:tier.color, letterSpacing:'0.12em', textTransform:'uppercase' }}>Active Grind</div>
                <div style={{ fontSize:8.5, color:'#2a2a28', marginTop:1 }}>Best verified methods for this tier</div>
              </div>
            </div>
            {active.slice(0,3).map((m,i)=>(
              <MethodCard key={mmTier+'_a_'+(st(m.id)||i)} method={m} tier={mmTier} accentColor={tier.color} type="active" />
            ))}
          </div>

          {/* Vault Exclusive */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, padding:'8px 12px', background:'#0f0f0e', border:'1px solid rgba(255,255,255,0.05)', borderRadius:7 }}>
              <span style={{ fontSize:14 }}>⚡</span>
              <div>
                <div style={{ fontSize:9.5, fontWeight:700, fontFamily:'Space Mono, monospace', color:'#9b59b6', letterSpacing:'0.12em', textTransform:'uppercase' }}>Vault Exclusive</div>
                <div style={{ fontSize:8.5, color:'#2a2a28', marginTop:1 }}>Non-obvious innovations discovered by AI</div>
              </div>
            </div>
            {vault.slice(0,3).map((m,i)=>(
              <MethodCard key={mmTier+'_v_'+(st(m.id)||i)} method={m} tier={mmTier} accentColor="#9b59b6" type="vault" />
            ))}
          </div>

        </div>
      )}
    </div>
  )
}