// Constants and byte encodings (spec section 3). Wire format: field elements 32 B big-endian,
// u64 8 B big-endian, i64 8 B big-endian two's complement.

export type Bytes = Uint8Array

export const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
export const TREE_DEPTH = 20
export const NULL_DEPTH = 40
export const MAX_FEE = 50000n
export const TWO64 = 1n << 64n
const I64_MIN = -(1n << 63n)
const I64_MAX = (1n << 63n) - 1n

const enc = new TextEncoder()
export const utf8 = (s: string): Bytes => enc.encode(s)

export function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export const toHex = (b: Bytes): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

export function fromHex(h: string): Bytes {
  const s = h.startsWith('0x') ? h.slice(2) : h
  if (s.length % 2 || /[^0-9a-f]/i.test(s)) throw new Error(`bad hex: ${h.slice(0, 16)}`)
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16)
  return out
}

export const bytesToBig = (b: Bytes): bigint => (b.length ? BigInt('0x' + toHex(b)) : 0n)

function uintBE(x: bigint, len: number): Bytes {
  if (x < 0n || x >= 1n << BigInt(8 * len)) throw new Error(`value out of range for ${len} bytes`)
  return fromHex(x.toString(16).padStart(2 * len, '0'))
}

export function feBytes(x: bigint): Bytes {
  if (x < 0n || x >= R) throw new Error('not a field element')
  return uintBE(x, 32)
}

export const u64Bytes = (x: bigint): Bytes => uintBE(x, 8)

/** i64 -> its u64 two's-complement value (the circuit's `publicAmount` input). */
export function i64ToU64(x: bigint): bigint {
  if (x < I64_MIN || x > I64_MAX) throw new Error('i64 out of range')
  return x < 0n ? x + TWO64 : x
}

export const i64Bytes = (x: bigint): Bytes => u64Bytes(i64ToU64(x))

export function i64FromBytes(b: Bytes): bigint {
  if (b.length !== 8) throw new Error('i64 needs 8 bytes')
  const u = bytesToBig(b)
  return u >= 1n << 63n ? u - TWO64 : u
}

export async function sha256(data: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>))
}
