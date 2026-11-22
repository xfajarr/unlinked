// State hash and the 200-byte binding payload (spec sections 5 and 7). Byte for byte with the contract.
import { MAX_FEE, bytesToBig, concat, feBytes, i64Bytes, sha256, u64Bytes, type Bytes } from './field.ts'
import { poseidon } from './poseidon.ts'

export const CT_LEN = 42
export const MAX_LOCK_LEN = 201
export const PAYLOAD_LEN = 200

export const stateHash = (Rc: bigint, n: number | bigint, Rn: bigint): bigint => poseidon([Rc, BigInt(n), Rn])

export type ExtData = {
  /** output locking bytecode for the payout; empty when payout = 0 */
  recipientLock: Bytes
  payout: bigint
  fee: bigint
  ct0: Bytes
  ct1: Bytes
}

/** extData = len(recipientLock) (1 B) | recipientLock | payout u64 | fee u64 | ct0 (42) | ct1 (42) */
export function encodeExtData(e: ExtData): Bytes {
  if (e.recipientLock.length > MAX_LOCK_LEN) throw new Error('recipientLock too long')
  if (e.ct0.length !== CT_LEN || e.ct1.length !== CT_LEN) throw new Error('ct must be 42 bytes')
  return concat(Uint8Array.of(e.recipientLock.length), e.recipientLock, u64Bytes(e.payout), u64Bytes(e.fee), e.ct0, e.ct1)
}

export function decodeExtData(b: Bytes): ExtData {
  const len = b[0]
  if (len === undefined || len > MAX_LOCK_LEN || b.length !== 1 + len + 16 + 2 * CT_LEN) throw new Error('bad extData')
  const at = 1 + len
  return {
    recipientLock: b.slice(1, at),
    payout: bytesToBig(b.slice(at, at + 8)),
    fee: bytesToBig(b.slice(at + 8, at + 16)),
    ct0: b.slice(at + 16, at + 16 + CT_LEN),
    ct1: b.slice(at + 16 + CT_LEN),
  }
}

export const extDataHash = (e: ExtData | Bytes): Promise<Bytes> =>
  sha256(e instanceof Uint8Array ? e : encodeExtData(e))

/** The contract's extData rules (spec section 9), so a client never builds a proof the pool rejects. */
export function checkExtData(publicAmount: bigint, e: ExtData): void {
  if (e.payout > 0n && e.recipientLock.length === 0) throw new Error('payout needs a recipientLock')
  if (publicAmount > 0n && (e.payout !== 0n || e.fee !== 0n)) throw new Error('deposit: payout and fee must be 0')
  if (publicAmount < 0n) {
    if (-publicAmount !== e.payout + e.fee) throw new Error('-publicAmount must equal payout + fee')
    if (e.fee > MAX_FEE) throw new Error('fee above MAX_FEE')
  }
  if (publicAmount === 0n && (e.payout !== 0n || e.fee !== 0n)) throw new Error('publicAmount 0: payout and fee must be 0')
}

export type PayloadPieces = {
  S1: bigint
  publicAmount: bigint
  C0: bigint
  C1: bigint
  N0: bigint
  N1: bigint
  extDataHash: Bytes
}

/** payload = S1 | publicAmount (i64) | C'0 | C'1 | N0 | N1 | extDataHash = 200 bytes */
export function bindingPayload(p: PayloadPieces): Bytes {
  if (p.extDataHash.length !== 32) throw new Error('extDataHash must be 32 bytes')
  const out = concat(feBytes(p.S1), i64Bytes(p.publicAmount), feBytes(p.C0), feBytes(p.C1), feBytes(p.N0), feBytes(p.N1), p.extDataHash)
  if (out.length !== PAYLOAD_LEN) throw new Error('payload length')
  return out
}

/** H = sha256(payload) with H[0] &= 0x1f, big-endian (< 2^253 < r). */
export async function bindingHash(payload: Bytes): Promise<bigint> {
  if (payload.length !== PAYLOAD_LEN) throw new Error('payload must be 200 bytes')
  const h = await sha256(payload)
  h[0]! &= 0x1f
  return bytesToBig(h)
}
