// lib/skin-uv-map.ts
// Standard Minecraft Java Edition skin UV layout (64x64, "new" format with
// separate left arm/leg regions) -- this is the public skin FORMAT spec used
// by every skin viewer (Crafatar, NameMC, skinview3d...), not copyrighted
// artwork. We composite the PLAYER'S OWN public skin texture (or Crafatar's
// default Steve fallback) onto these regions -- never Mojang/Hypixel item art.
export type UVFace = { u: number; v: number; w: number; h: number }
export type UVMap  = { top: UVFace; bottom: UVFace; front: UVFace; back: UVFace; left: UVFace; right: UVFace }

export type BodyPart = {
  key: 'head' | 'torso' | 'armRight' | 'armLeft' | 'legRight' | 'legLeft'
  w: number; h: number; d: number // model units (== texture texels for the vanilla box UV)
  uv: UVMap
  // Position of the box CENTER, in model units, origin at the character's feet-center.
  x: number; y: number; z: number
}

export const BODY_PARTS: BodyPart[] = [
  {
    key: 'head', w: 8, h: 8, d: 8, x: 0, y: 28, z: 0,
    uv: {
      top:    { u: 8,  v: 0, w: 8, h: 8 },
      bottom: { u: 16, v: 0, w: 8, h: 8 },
      right:  { u: 0,  v: 8, w: 8, h: 8 },
      front:  { u: 8,  v: 8, w: 8, h: 8 },
      left:   { u: 16, v: 8, w: 8, h: 8 },
      back:   { u: 24, v: 8, w: 8, h: 8 },
    },
  },
  {
    key: 'torso', w: 8, h: 12, d: 4, x: 0, y: 18, z: 0,
    uv: {
      top:    { u: 20, v: 16, w: 8, h: 4 },
      bottom: { u: 28, v: 16, w: 8, h: 4 },
      right:  { u: 16, v: 20, w: 4, h: 12 },
      front:  { u: 20, v: 20, w: 8, h: 12 },
      left:   { u: 28, v: 20, w: 4, h: 12 },
      back:   { u: 32, v: 20, w: 8, h: 12 },
    },
  },
  {
    key: 'armRight', w: 4, h: 12, d: 4, x: -6, y: 18, z: 0,
    uv: {
      top:    { u: 44, v: 16, w: 4, h: 4 },
      bottom: { u: 48, v: 16, w: 4, h: 4 },
      right:  { u: 40, v: 20, w: 4, h: 12 },
      front:  { u: 44, v: 20, w: 4, h: 12 },
      left:   { u: 48, v: 20, w: 4, h: 12 },
      back:   { u: 52, v: 20, w: 4, h: 12 },
    },
  },
  {
    key: 'armLeft', w: 4, h: 12, d: 4, x: 6, y: 18, z: 0,
    uv: {
      top:    { u: 36, v: 48, w: 4, h: 4 },
      bottom: { u: 40, v: 48, w: 4, h: 4 },
      right:  { u: 32, v: 52, w: 4, h: 12 },
      front:  { u: 36, v: 52, w: 4, h: 12 },
      left:   { u: 40, v: 52, w: 4, h: 12 },
      back:   { u: 44, v: 52, w: 4, h: 12 },
    },
  },
  {
    key: 'legRight', w: 4, h: 12, d: 4, x: -2, y: 6, z: 0,
    uv: {
      top:    { u: 4,  v: 16, w: 4, h: 4 },
      bottom: { u: 8,  v: 16, w: 4, h: 4 },
      right:  { u: 0,  v: 20, w: 4, h: 12 },
      front:  { u: 4,  v: 20, w: 4, h: 12 },
      left:   { u: 8,  v: 20, w: 4, h: 12 },
      back:   { u: 12, v: 20, w: 4, h: 12 },
    },
  },
  {
    key: 'legLeft', w: 4, h: 12, d: 4, x: 2, y: 6, z: 0,
    uv: {
      top:    { u: 20, v: 48, w: 4, h: 4 },
      bottom: { u: 24, v: 48, w: 4, h: 4 },
      right:  { u: 16, v: 52, w: 4, h: 12 },
      front:  { u: 20, v: 52, w: 4, h: 12 },
      left:   { u: 24, v: 52, w: 4, h: 12 },
      back:   { u: 28, v: 52, w: 4, h: 12 },
    },
  },
]

export const TEXTURE_SIZE = 64
export const DEFAULT_SKIN_URL = 'https://crafatar.com/skins/8667ba71-b85a-4004-af54-457a9734eed7' // Steve
