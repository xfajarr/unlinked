// Encrypted outputs (spec section 8): ct = E (33) | viewTag (1) | encAmount (8).
// S is the ECDH shared secret as bytes (compressed point e*scanPub = scanPriv*E, as in src/lib/stealth.ts),
// so this module needs no curve library.
import { R, bytesToBig, concat, sha256, u64Bytes, utf8, type Bytes } from './field.ts'
import { commitment } from './keys.ts'

const VIEWTAG_TAG = utf8('unlinked/viewtag')
const BLIND_TAG = utf8('unlinked/blind')
const AMOUNT_TAG = utf8('unlinked/amount')

export type CtSecrets = { viewTag: number; blinding: bigint; mask: Bytes }

export async function ctDerive(S: Bytes): Promise<CtSecrets> {
  const [v, b, a] = await Promise.all([sha256(concat(VIEWTAG_TAG, S)), sha256(concat(BLIND_TAG, S)), sha256(concat(AMOUNT_TAG, S))])
  return { viewTag: v[0]!, blinding: bytesToBig(b) % R, mask: a.slice(0, 8) }
}

const xor8 = (a: Bytes, b: Bytes): Bytes => Uint8Array.from(a.slice(0, 8), (x, i) => x ^ b[i]!)

export async function ctEncrypt({ S, E, amount }: { S: Bytes; E: Bytes; amount: bigint }): Promise<Bytes> {
  if (E.length !== 33) throw new Error('E must be a 33-byte compressed point')
  const d = await ctDerive(S)
  return concat(E, Uint8Array.of(d.viewTag), xor8(u64Bytes(amount), d.mask))
}

export function ctParse(ct: Bytes): { E: Bytes; viewTag: number; encAmount: Bytes } {
  if (ct.length !== 42) throw new Error('ct must be 42 bytes')
  return { E: ct.slice(0, 33), viewTag: ct[33]!, encAmount: ct.slice(34) }
}

/** Recipient side. null when the view tag mismatches, or when pk and commitment are given and Poseidon(amount, pk, blinding) != commitment (this also authenticates the ct). */
export async function ctOpen({ ct, S, pk, commitment: C }: { ct: Bytes; S: Bytes; pk?: bigint; commitment?: bigint }): Promise<{ amount: bigint; blinding: bigint } | null> {
  const { viewTag, encAmount } = ctParse(ct)
  const d = await ctDerive(S)
  if (d.viewTag !== viewTag) return null
  const amount = bytesToBig(xor8(encAmount, d.mask))
  if (pk !== undefined && C !== undefined && commitment(amount, pk, d.blinding) !== C) return null
  return { amount, blinding: d.blinding }
}
