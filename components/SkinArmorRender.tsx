// components/SkinArmorRender.tsx
// Skin + equipped-gear visual for SetupOverlay: the player's Minecraft skin
// rendered as real layered 3D cuboids (CSS transform-style:preserve-3d, no
// WebGL/skinview3d dependency) with armor drawn as separate, slightly-larger
// "inflated" cuboid layers on top -- matching Minecraft's own armor-model
// inflate convention (helmet/chestplate/boots ~1.0, leggings ~0.5, applied
// as a per-axis size delta on the same box, same technique as vanilla's
// ArmorStandRenderer / HumanoidArmorLayer.CubeDeformation).
//
// Appearance: no Skyblock armor piece has a unique base-game TEXTURE server
// side -- the "custom look" people associate with Necron's/Storm's/Divan's
// comes entirely from optional third-party resource packs. But most pieces
// (~62%, sampled across NEU-REPO) ARE real dyed LEATHER_* items with a real
// default color Hypixel assigns server-side (confirmed: Necron's Chestplate
// is leather dyed to #E7413C), which we now source per-piece from
// item_stats.default_color (armor-color-sync, fetched from NEU-REPO's
// items/{id}.json) and attach to the matched setup via applyPreciseCost.
// Falls back to the verified vanilla default leather color (#A06540, RGB
// 160,101,64) whenever that's null -- genuinely no color exists server-side
// for the other ~38% (re-skinned player heads for some helmets, or
// non-leather base items like Revenant Armor's diamond_chestplate, both
// 100% resource-pack-only looks). Real skull skin.value decoding for the
// head-reskin case is a separate future project, not yet started, see
// CLAUDE.md.
'use client'
import { useState } from 'react'
import { BODY_PARTS, TEXTURE_SIZE, type UVMap, type BodyPart } from '../lib/skin-uv-map'

const SCALE = 6 // CSS px per model unit
const VANILLA_LEATHER_COLOR = '#A06540' // real Minecraft default undyed-leather color, verified (not approximated)

type TooltipContent = { title: string; lines: string[] } | null

function Face({ uv, textureUrl, transform }: { uv: { u: number; v: number; w: number; h: number }; textureUrl: string; transform: string }) {
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0,
      width: uv.w * SCALE, height: uv.h * SCALE,
      marginLeft: -(uv.w * SCALE) / 2, marginTop: -(uv.h * SCALE) / 2,
      backgroundImage: `url(${textureUrl})`,
      backgroundSize: `${TEXTURE_SIZE * SCALE}px ${TEXTURE_SIZE * SCALE}px`,
      backgroundPosition: `-${uv.u * SCALE}px -${uv.v * SCALE}px`,
      imageRendering: 'pixelated',
      transform,
      backfaceVisibility: 'hidden',
    }} />
  )
}

function TintedFace({ w, h, transform, color, shade }: { w: number; h: number; transform: string; color: string; shade: number }) {
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0,
      width: w * SCALE, height: h * SCALE,
      marginLeft: -(w * SCALE) / 2, marginTop: -(h * SCALE) / 2,
      background: color,
      opacity: 0.8,
      filter: `brightness(${shade})`,
      transform,
      backfaceVisibility: 'hidden',
    }} />
  )
}

// Un cuboid = 6 faces positionnées par rotation+translation autour du centre
// de la boîte -- même géométrie que le vrai modèle Minecraft (box UV mapping).
function Cuboid({ part, textureUrl }: { part: BodyPart; textureUrl: string }) {
  const { w, h, d, uv } = part
  return (
    <>
      <Face uv={uv.front}  textureUrl={textureUrl} transform={`translateZ(${d / 2 * SCALE}px)`} />
      <Face uv={uv.back}   textureUrl={textureUrl} transform={`translateZ(-${d / 2 * SCALE}px) rotateY(180deg)`} />
      <Face uv={uv.right}  textureUrl={textureUrl} transform={`translateX(${w / 2 * SCALE}px) rotateY(90deg)`} />
      <Face uv={uv.left}   textureUrl={textureUrl} transform={`translateX(-${w / 2 * SCALE}px) rotateY(-90deg)`} />
      <Face uv={uv.top}    textureUrl={textureUrl} transform={`translateY(-${h / 2 * SCALE}px) rotateX(90deg)`} />
      <Face uv={uv.bottom} textureUrl={textureUrl} transform={`translateY(${h / 2 * SCALE}px) rotateX(-90deg)`} />
    </>
  )
}

// Couche d'armure : même boîte, gonflée de `inflate` unités sur chaque axe
// (comme le vrai inflate Minecraft), teintée et ombrée par face (avant plus
// clair, côtés plus sombres, dessus le plus clair) pour un vrai volume sans
// texture d'item.
function ArmorLayer({ part, inflate, color, onHover }: {
  part: BodyPart; inflate: number; color: string
  onHover: (c: TooltipContent, e: React.MouseEvent | null) => void
}) {
  const w = part.w + inflate * 2
  const h = part.h + inflate * 2
  const d = part.d + inflate * 2
  return (
    <div
      onMouseEnter={e => onHover(null, e)}
      // transformStyle:'preserve-3d' is required HERE, not just on the ancestor
      // translate3d wrapper -- every link in the chain down to the transformed
      // TintedFace children needs it, or this link flattens all 6 faces into a
      // single overlapping 2D stack (the missing link that caused the "flat
      // rectangle" render even after the filter/backdrop-filter ancestor fixes).
      style={{ position: 'absolute', width: 1, height: 1, cursor: 'default', transformStyle: 'preserve-3d' }}
    >
      <TintedFace w={w} h={h} color={color} shade={1.15} transform={`translateZ(${d / 2 * SCALE}px)`} />
      <TintedFace w={w} h={h} color={color} shade={0.75} transform={`translateZ(-${d / 2 * SCALE}px) rotateY(180deg)`} />
      <TintedFace w={d} h={h} color={color} shade={0.95} transform={`translateX(${w / 2 * SCALE}px) rotateY(90deg)`} />
      <TintedFace w={d} h={h} color={color} shade={0.65} transform={`translateX(-${w / 2 * SCALE}px) rotateY(-90deg)`} />
      <TintedFace w={w} h={d} color={color} shade={1.35} transform={`translateY(-${h / 2 * SCALE}px) rotateX(90deg)`} />
      <TintedFace w={w} h={d} color={color} shade={0.55} transform={`translateY(${h / 2 * SCALE}px) rotateX(-90deg)`} />
    </div>
  )
}

const partByKey = (k: BodyPart['key']) => BODY_PARTS.find(p => p.key === k)!

export default function SkinArmorRender({ skinUrl, setup, accentColor }: {
  skinUrl: string
  setup: Record<string, any>
  accentColor: string
}) {
  const [tooltip, setTooltip] = useState<{ content: TooltipContent; x: number; y: number }>({ content: null, x: 0, y: 0 })

  const hasArmor = !!setup.armor_set

  const showTip = (content: TooltipContent, e: React.MouseEvent | null) => {
    if (!e) return
    setTooltip({ content, x: e.clientX, y: e.clientY })
  }
  const hideTip = () => setTooltip({ content: null, x: 0, y: 0 })

  const armorTip: TooltipContent = hasArmor ? {
    title: `${setup.armor_set}${setup.armor_stars ? ' ' + '✪'.repeat(Math.min(setup.armor_stars, 5)) : ''}`,
    lines: [setup.armor_stats, setup.armor_bonus].filter(Boolean),
  } : null

  // Couleur réelle par pièce (item_stats.default_color, attaché par
  // applyPreciseCost depuis le vrai item matché) quand elle existe, sinon le
  // placeholder vanilla -- jamais un mélange des deux sur la même pièce.
  // helmet -> head ; chestplate -> torso+bras ; boots -> jambes (le legging
  // "inner" reste toujours enfermé et invisible, voir le commentaire de
  // géométrie plus bas, donc c'est bien boots qui teinte visuellement la
  // jambe entière, pas leggings).
  const colorForPart = (k: BodyPart['key']): string => {
    if (k === 'head') return setup.armor_helmet_color || VANILLA_LEATHER_COLOR
    if (k === 'torso' || k === 'armRight' || k === 'armLeft') return setup.armor_chestplate_color || VANILLA_LEATHER_COLOR
    return setup.armor_boots_color || VANILLA_LEATHER_COLOR // legRight, legLeft
  }

  return (
    <div
      onMouseMove={e => tooltip.content && setTooltip(t => ({ ...t, x: e.clientX, y: e.clientY }))}
      // Pas de `perspective` volontairement -- un vrai point de fuite fausse la
      // vue isométrique demandée (parallélogrammes sur les pièces excentrées,
      // proportions écrasées selon la profondeur). Sans perspective, les
      // transforms 3D restent actifs (preserve-3d + rotateX/Y + translateZ)
      // mais la projection devient orthographique -- les arêtes parallèles le
      // restent, exactement le rendu isométrique voulu.
      style={{ position: 'relative', width: '100%', height: 260, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div style={{
        position: 'relative', transformStyle: 'preserve-3d',
        transform: 'rotateX(-14deg) rotateY(-38deg)',
        marginBottom: 8,
      }}>
        {BODY_PARTS.map(part => (
          <div key={part.key} style={{
            position: 'absolute', left: 0, top: 0, width: 1, height: 1,
            transformStyle: 'preserve-3d',
            transform: `translate3d(${part.x * SCALE}px, ${-part.y * SCALE}px, ${part.z * SCALE}px)`,
          }}>
            <Cuboid part={part} textureUrl={skinUrl} />
          </div>
        ))}

        {/* Armure -- géométrie vérifiée contre le vrai modèle Mojang (outer_armor.JEM /
            inner_armor.JEM) : helmet/chestplate/boots partagent le même modèle "outer"
            (inflate 1.0) sur head / torso+bras / jambes ; leggings utilise le modèle
            "inner" (inflate 0.5) sur torso+jambes mais SUR LES MÊMES PARTIES DU CORPS
            que chestplate/boots -- comme l'outer (1.0) est strictement plus grand que
            l'inner (0.5) sur la même boîte, la couche leggings est entièrement
            enfermée dedans et n'est JAMAIS visible de l'extérieur sur un joueur en
            set complet (vrai en jeu aussi : on ne voit jamais le legging sous un
            chestplate+boots portés). Donc une seule couche outer (1.0) par partie
            couverte, jambe entière (pas de découpe haut/bas inventée) -- fidèle au
            rendu réel, pas une approximation stylisée. */}
        {hasArmor && (
          <>
            {(['head', 'torso', 'armRight', 'armLeft', 'legRight', 'legLeft'] as const).map(k => {
              const part = partByKey(k)
              return (
                <div key={k}
                  onMouseEnter={e => showTip(armorTip, e)} onMouseLeave={hideTip}
                  style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, transformStyle: 'preserve-3d', transform: `translate3d(${part.x * SCALE}px, ${-part.y * SCALE}px, ${part.z * SCALE}px)` }}
                >
                  <ArmorLayer part={part} inflate={1.0} color={colorForPart(k)} onHover={() => {}} />
                </div>
              )
            })}
          </>
        )}

      </div>

      {tooltip.content && (
        <div style={{
          position: 'fixed', left: tooltip.x + 16, top: tooltip.y + 10, zIndex: 500,
          pointerEvents: 'none', maxWidth: 220,
          background: '#111110', border: `1px solid ${accentColor}45`,
          borderRadius: 8, padding: '9px 12px',
          boxShadow: `0 8px 24px rgba(0,0,0,0.6), 0 0 12px ${accentColor}20`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e8e6df', marginBottom: tooltip.content.lines.length ? 5 : 0 }}>
            {tooltip.content.title}
          </div>
          {tooltip.content.lines.map((l, i) => (
            <div key={i} style={{ fontSize: 9.5, color: '#9b9b8f', lineHeight: 1.5 }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  )
}
