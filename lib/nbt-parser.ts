// lib/nbt-parser.ts
// Parser NBT binaire natif Node.js — zéro dépendance externe
// Decode le format NBT Minecraft depuis un Buffer

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NBTValue   = any
export type NBTCompound = Record<string, NBTValue>
export type NBTList     = NBTValue[]

const TAG = {
  END:       0,
  BYTE:      1,
  SHORT:     2,
  INT:       3,
  LONG:      4,
  FLOAT:     5,
  DOUBLE:    6,
  BYTE_ARRAY:7,
  STRING:    8,
  LIST:      9,
  COMPOUND:  10,
  INT_ARRAY: 11,
  LONG_ARRAY:12,
} as const

class NBTReader {
  private buf: Buffer
  private pos: number

  constructor(buf: Buffer) {
    this.buf = buf
    this.pos = 0
  }

  private readByte()   { return this.buf.readInt8(this.pos++) }
  private readUByte()  { return this.buf.readUInt8(this.pos++) }
  private readShort()  { const v = this.buf.readInt16BE(this.pos); this.pos += 2; return v }
  private readInt()    { const v = this.buf.readInt32BE(this.pos); this.pos += 4; return v }
  private readLong()   { const v = this.buf.readBigInt64BE(this.pos); this.pos += 8; return v }
  private readFloat()  { const v = this.buf.readFloatBE(this.pos); this.pos += 4; return v }
  private readDouble() { const v = this.buf.readDoubleBE(this.pos); this.pos += 8; return v }

  private readString(): string {
    const len = this.buf.readUInt16BE(this.pos)
    this.pos += 2
    const str = this.buf.slice(this.pos, this.pos + len).toString('utf8')
    this.pos += len
    return str
  }

  private readPayload(type: number): NBTValue {
    switch (type) {
      case TAG.BYTE:       return this.readByte()
      case TAG.SHORT:      return this.readShort()
      case TAG.INT:        return this.readInt()
      case TAG.LONG:       return this.readLong()
      case TAG.FLOAT:      return this.readFloat()
      case TAG.DOUBLE:     return this.readDouble()
      case TAG.STRING:     return this.readString()
      case TAG.BYTE_ARRAY: {
        const len = this.readInt()
        const arr = Array.from({ length: len }, () => this.readByte())
        return arr
      }
      case TAG.INT_ARRAY: {
        const len = this.readInt()
        return Array.from({ length: len }, () => this.readInt())
      }
      case TAG.LONG_ARRAY: {
        const len = this.readInt()
        return Array.from({ length: len }, () => this.readLong())
      }
      case TAG.LIST: {
        const itemType = this.readUByte()
        const len      = this.readInt()
        return Array.from({ length: Math.max(len, 0) }, () => this.readPayload(itemType))
      }
      case TAG.COMPOUND: {
        const obj: NBTCompound = {}
        while (true) {
          const t = this.readUByte()
          if (t === TAG.END) break
          const name    = this.readString()
          obj[name]     = this.readPayload(t)
        }
        return obj
      }
      default:
        throw new Error(`Unknown NBT tag type: ${type}`)
    }
  }

  parse(): { name: string; value: NBTCompound } {
    const type = this.readUByte()
    const name = this.readString()
    if (type !== TAG.COMPOUND) throw new Error(`Root tag must be COMPOUND, got ${type}`)
    return { name, value: this.readPayload(type) as NBTCompound }
  }
}

// ── Point d'entrée principal ───────────────────────────────────
export function parseNBT(buf: Buffer): NBTCompound {
  const reader = new NBTReader(buf)
  const root   = reader.parse()
  return root.value
}

// ── Helper : navigue dans un NBT imbriqué via path ────────────
export function getNBT(obj: NBTCompound, path: string): any {
  const parts = path.split('.')
  let cur: any = obj
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}