// components/SkinArmorRender.tsx
// Skin + equipped-gear visual for SetupOverlay: the player's Minecraft skin
// rendered as real layered 3D cuboids, now on an actual 3D engine
// (three.js via @react-three/fiber) instead of CSS transform-style:preserve-3d.
//
// Why the migration: the CSS version needed three separate rounds of debugging
// across two sessions to stop flattening (filter/backdrop-filter on ANY modal
// ancestor rasterizes the whole subtree and silently kills nested preserve-3d,
// and ArmorLayer's own wrapper was missing transform-style:preserve-3d too) --
// each fix was necessary but not sufficient on its own. That's not bad luck,
// it's CSS 3D transforms being a layout-system feature repurposed for 3D, with
// well-documented flattening gotchas baked into the spec. three.js is an
// actual 3D engine built for exactly this, and eliminates that whole bug class
// structurally -- there is no "backdrop-filter silently rasterizes your scene"
// failure mode for a WebGL canvas.
//
// Appearance: no Skyblock armor piece has a unique base-game TEXTURE server
// side -- the "custom look" people associate with Necron's/Storm's/Divan's
// comes entirely from optional third-party resource packs. But most pieces
// (~62%, sampled across NEU-REPO) ARE real dyed LEATHER_* items with a real
// default color Hypixel assigns server-side (confirmed: Necron's Chestplate
// is leather dyed to #E7413C), sourced per-piece from item_stats.default_color
// (armor-color-sync, fetched from NEU-REPO's items/{id}.json) and attached to
// the matched setup via applyPreciseCost. Falls back to the verified vanilla
// default leather color (#A06540, RGB 160,101,64) whenever that's null.
//
// Lighting: armor tint is no longer six manually-tuned brightness() multipliers
// per face (the CSS version's TintedFace shade constants) -- a single
// DirectionalLight + MeshStandardMaterial now computes real per-face shading
// from actual geometry, which is both more robust (no hand-picked numbers to
// get subtly wrong) and correctly consistent with how the skin layer itself
// is now lit (also MeshStandardMaterial, so skin and armor share one coherent
// lighting model instead of the old mix of unlit skin + manually-shaded armor).
'use client'
import { useEffect, useMemo, useState, Suspense } from 'react'
import { Canvas, useLoader, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { BODY_PARTS, TEXTURE_SIZE, type BodyPart } from '../lib/skin-uv-map'
import { st, nm, ar } from '../lib/setup-field-helpers'
import { rarityColor } from '../lib/rarity-colors'

const VANILLA_LEATHER_COLOR = '#A06540' // real Minecraft default undyed-leather color, verified (not approximated)
const ARMOR_INFLATE = 1.0 // same outer-armor inflate as the vanilla model / the old CSS version

type ArmorTooltip = { name: string; rarity: string | null; stars: number; stats: string; enchants: string[]; reforge: string } | null

// ── CSS → three.js transform conversion ─────────────────────────────────
// The old CSS version's geometry (BODY_PARTS positions, face translate/rotate
// values, the rig's rotateX(-14deg) rotateY(-38deg) camera angle) was already
// validated in production against the real Mojang armor model -- that data is
// reused verbatim below, NOT re-derived. Only the coordinate system differs:
// CSS's Y axis points down the screen while three.js's points up (X and Z are
// shared, Z+ toward the viewer in both). Working through the algebra once
// (a single-axis reflection, Y -> -Y, flips the sign of any rotation that
// turns Y into something else, but leaves rotations *around* Y unchanged):
//   translateX(v) / translateZ(v)      -> unchanged
//   translateY(v)                      -> negate
//   rotateY(deg)                       -> unchanged
//   rotateX(deg)                       -> negate
// Cross-checked two independent ways before trusting it: (1) it reproduces the
// old CSS rig's own translate3d(x, -y, z) convention exactly (BODY_PARTS' y
// needs the same negation CSS already applied, so three.js can use raw part.y
// with none), and (2) applying it to each face's transform and computing the
// resulting outward normal by hand gives exactly the expected direction for
// all 6 faces (top -> +Y, bottom -> -Y, right -> +X, left -> -X, front -> +Z,
// back -> -Z) -- see the FACE_TRANSFORMS table below.

type FaceKey = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom'
const FACE_KEYS: FaceKey[] = ['front', 'back', 'right', 'left', 'top', 'bottom']

// Position/rotation of each face relative to its cuboid's center, given the
// box's own (w,h,d) half-dimensions are baked into these via the part's real
// size (or the inflated armor size). Derived directly from the old CSS Face
// transforms via the conversion rules above -- e.g. CSS `translateY(-h/2)
// rotateX(90deg)` for "top" becomes position.y=+h/2 (negate the CSS translateY
// value) and rotation.x=-90deg (negate the CSS rotateX value).
function faceTransform(fk: FaceKey, w: number, h: number, d: number): { position: [number, number, number]; rotation: [number, number, number] } {
  switch (fk) {
    case 'front':  return { position: [0, 0, d / 2],  rotation: [0, 0, 0] }
    case 'back':   return { position: [0, 0, -d / 2], rotation: [0, Math.PI, 0] }
    case 'right':  return { position: [w / 2, 0, 0],  rotation: [0, Math.PI / 2, 0] }
    case 'left':   return { position: [-w / 2, 0, 0], rotation: [0, -Math.PI / 2, 0] }
    case 'top':    return { position: [0, h / 2, 0],  rotation: [-Math.PI / 2, 0, 0] }
    case 'bottom': return { position: [0, -h / 2, 0], rotation: [Math.PI / 2, 0, 0] }
  }
}

// One flat, UV-mapped quad -- the three.js equivalent of the old CSS Face()
// div (a straight, non-mirrored crop of the texture atlas). Built once at
// module load per (part, face) pair since none of this depends on props.
// The quad starts centered at the origin facing +Z (normal (0,0,1)); its
// corners are placed so that, after the CSS->three.js Y-negation above, the
// same atlas pixels end up in the same visual positions as the old CSS crop.
function makeFaceGeometry(w: number, h: number, uv?: { u: number; v: number; w: number; h: number }): THREE.BufferGeometry {
  const positions = new Float32Array([-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0])
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
  let uvs: Float32Array
  if (uv) {
    const u0 = uv.u / TEXTURE_SIZE, u1 = (uv.u + uv.w) / TEXTURE_SIZE
    const vTop = 1 - uv.v / TEXTURE_SIZE, vBottom = 1 - (uv.v + uv.h) / TEXTURE_SIZE
    uvs = new Float32Array([u0, vBottom, u1, vBottom, u1, vTop, u0, vTop])
  } else {
    uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1])
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex([0, 1, 2, 0, 2, 3])
  return geo
}

// Precomputed once at module scope: 6 skin faces + 6 armor faces per body
// part, geometry only (materials are created per-instance since color/texture
// differ). Mirrors the old Cuboid()/ArmorLayer() split exactly.
const SKIN_GEOMETRY = new Map<string, Record<FaceKey, THREE.BufferGeometry>>()
const ARMOR_GEOMETRY = new Map<string, Record<FaceKey, THREE.BufferGeometry>>()
for (const part of BODY_PARTS) {
  const skinFaces = {} as Record<FaceKey, THREE.BufferGeometry>
  for (const fk of FACE_KEYS) skinFaces[fk] = makeFaceGeometry(part.uv[fk].w, part.uv[fk].h, part.uv[fk])
  SKIN_GEOMETRY.set(part.key, skinFaces)

  const aw = part.w + ARMOR_INFLATE * 2, ah = part.h + ARMOR_INFLATE * 2, ad = part.d + ARMOR_INFLATE * 2
  ARMOR_GEOMETRY.set(part.key, {
    front:  makeFaceGeometry(aw, ah),
    back:   makeFaceGeometry(aw, ah),
    right:  makeFaceGeometry(ad, ah),
    left:   makeFaceGeometry(ad, ah),
    top:    makeFaceGeometry(aw, ad),
    bottom: makeFaceGeometry(aw, ad),
  })
}

// ── Skin cuboid ───────────────────────────────────────────────
function SkinCuboid({ part, texture }: { part: BodyPart; texture: THREE.Texture }) {
  const geoms = SKIN_GEOMETRY.get(part.key)!
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0 }), [texture])
  return (
    <group position={[part.x, part.y, part.z]}>
      {FACE_KEYS.map(fk => {
        const t = faceTransform(fk, part.w, part.h, part.d)
        return <mesh key={fk} geometry={geoms[fk]} material={material} position={t.position} rotation={t.rotation} />
      })}
    </group>
  )
}

// ── Armor layer (inflated box, real per-face lighting instead of manual
//    brightness() shading) ───────────────────────────────────
function ArmorPart({
  part, color, onEnter, onLeave,
}: {
  part: BodyPart; color: string
  onEnter: (e: ThreeEvent<PointerEvent>) => void; onLeave: () => void
}) {
  const geoms = ARMOR_GEOMETRY.get(part.key)!
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 }), [color])
  const w = part.w + ARMOR_INFLATE * 2, h = part.h + ARMOR_INFLATE * 2, d = part.d + ARMOR_INFLATE * 2
  return (
    <group
      position={[part.x, part.y, part.z]}
      onPointerOver={onEnter}
      onPointerOut={onLeave}
    >
      {FACE_KEYS.map(fk => {
        const t = faceTransform(fk, w, h, d)
        return <mesh key={fk} geometry={geoms[fk]} material={material} position={t.position} rotation={t.rotation} />
      })}
    </group>
  )
}

const partByKey = (k: BodyPart['key']) => BODY_PARTS.find(p => p.key === k)!

// ── Rig: the whole character, rotated to match the old CSS camera angle ──
// CSS `transform: rotateX(-14deg) rotateY(-38deg)` applies rotateY first (it's
// the innermost/rightmost function), then rotateX to the result -- composed
// here as an explicit matrix (rx * ry) rather than a Euler triplet, to sidestep
// any ambiguity about three.js's default Euler rotation order and replicate
// CSS's actual composition order exactly.
const RIG_QUATERNION = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4()
    .makeRotationX(THREE.MathUtils.degToRad(14))   // CSS rotateX(-14deg), sign negated per the conversion above
    .multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(-38))) // CSS rotateY(-38deg), unchanged
)

function Scene({ skinUrl, setup, onTooltip }: {
  skinUrl: string; setup: Record<string, any>
  onTooltip: (content: ArmorTooltip, e?: ThreeEvent<PointerEvent>) => void
}) {
  const texture = useLoader(THREE.TextureLoader, skinUrl, loader => loader.setCrossOrigin('anonymous'))
  useEffect(() => {
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.colorSpace = THREE.SRGBColorSpace
    texture.generateMipmaps = false
    texture.needsUpdate = true
  }, [texture])

  const hasArmor = !!setup.armor_set

  const PIECE_BY_PART: Record<BodyPart['key'], 'HELMET' | 'CHESTPLATE' | 'BOOTS'> = {
    head: 'HELMET', torso: 'CHESTPLATE', armRight: 'CHESTPLATE', armLeft: 'CHESTPLATE',
    legRight: 'BOOTS', legLeft: 'BOOTS',
  }
  const PIECE_LABEL: Record<'HELMET' | 'CHESTPLATE' | 'BOOTS', string> = {
    HELMET: 'Helmet', CHESTPLATE: 'Chestplate', BOOTS: 'Boots',
  }
  const PIECE_COLOR_FIELD: Record<'HELMET' | 'CHESTPLATE' | 'BOOTS', string> = {
    HELMET: 'armor_helmet_color', CHESTPLATE: 'armor_chestplate_color', BOOTS: 'armor_boots_color',
  }
  const colorForPart = (k: BodyPart['key']): string => setup[PIECE_COLOR_FIELD[PIECE_BY_PART[k]]] || VANILLA_LEATHER_COLOR
  const armorTooltipFor = (k: BodyPart['key']): ArmorTooltip => {
    if (!hasArmor) return null
    const piece = PIECE_BY_PART[k]
    return {
      name: `${st(setup.armor_set)} ${PIECE_LABEL[piece]}`,
      rarity: setup.armor_rarity || null,
      stars: nm(setup.armor_stars),
      stats: st(setup.armor_stats),
      enchants: ar(setup.enchants_armor),
      reforge: st(setup.armor_reforge),
    }
  }

  return (
    <group quaternion={RIG_QUATERNION}>
      {BODY_PARTS.map(part => <SkinCuboid key={part.key} part={part} texture={texture} />)}

      {/* Armure -- même géométrie d'inflate/couverture que la version CSS (voir
          son commentaire d'origine, toujours vrai ici) : helmet/chestplate/boots
          partagent le modèle "outer" sur head/torso+bras/jambes, la couche
          leggings "inner" reste toujours entièrement invisible en dessous. */}
      {hasArmor && (['head', 'torso', 'armRight', 'armLeft', 'legRight', 'legLeft'] as const).map(k => (
        <ArmorPart
          key={k} part={partByKey(k)} color={colorForPart(k)}
          onEnter={e => { e.stopPropagation(); onTooltip(armorTooltipFor(k), e) }}
          onLeave={() => onTooltip(null)}
        />
      ))}
    </group>
  )
}

export default function SkinArmorRender({ skinUrl, setup, accentColor }: {
  skinUrl: string
  setup: Record<string, any>
  accentColor: string
}) {
  const [tooltip, setTooltip] = useState<{ content: ArmorTooltip; x: number; y: number }>({ content: null, x: 0, y: 0 })

  const handleTooltip = (content: ArmorTooltip, e?: ThreeEvent<PointerEvent>) => {
    if (content && e) setTooltip({ content, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
    else setTooltip(t => ({ ...t, content: null }))
  }

  return (
    <div
      onMouseMove={e => tooltip.content && setTooltip(t => ({ ...t, x: e.clientX, y: e.clientY }))}
      style={{ position: 'relative', width: '100%', height: 260 }}
    >
      <Canvas
        orthographic
        camera={{ position: [0, 15, 100], zoom: 6, near: 0.1, far: 1000 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[6, 10, 8]} intensity={1.1} />
        <directionalLight position={[-6, -4, -6]} intensity={0.25} />
        <Suspense fallback={null}>
          <Scene skinUrl={skinUrl} setup={setup} onTooltip={handleTooltip} />
        </Suspense>
      </Canvas>

      {tooltip.content && (() => {
        const c = tooltip.content
        const color = rarityColor(c.rarity, accentColor)
        return (
          <div style={{
            position: 'fixed', left: tooltip.x + 16, top: tooltip.y + 10, zIndex: 500,
            pointerEvents: 'none', maxWidth: 240,
            background: '#111110', border: `1px solid ${color}55`,
            borderRadius: 8, padding: '10px 13px',
            boxShadow: `0 8px 24px rgba(0,0,0,0.6), 0 0 12px ${color}25`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: (c.stats || c.enchants.length || c.reforge) ? 5 : 0 }}>
              {c.name}{c.stars ? ' ' + '✪'.repeat(Math.min(c.stars, 5)) : ''}
            </div>
            {c.stats && <div style={{ fontSize: 9.5, color: '#9b9b8f', fontFamily: 'Space Mono, monospace', marginBottom: (c.enchants.length || c.reforge) ? 4 : 0 }}>{c.stats}</div>}
            {c.enchants.length > 0 && <div style={{ fontSize: 9.5, color: '#7ec8e3', marginBottom: c.reforge ? 4 : 0 }}>{c.enchants.join(', ')}</div>}
            {c.reforge && <div style={{ fontSize: 9.5, color: '#c9a84c', textTransform: 'capitalize' }}>{c.reforge} reforge</div>}
          </div>
        )
      })()}
    </div>
  )
}
