// Keys and notes (spec section 4).
import { R, bytesToBig, concat, sha256, utf8, type Bytes } from './field.ts'
import { poseidon } from './poseidon.ts'

const SHIELD_TAG = utf8('unlinked/shield')

export type ShieldKeys = { shieldSk: bigint; shieldPk: bigint }

/** shieldSk = int_be(sha256("unlinked/shield" | spendPriv)) mod r, shieldPk = Poseidon(shieldSk). */
export async function shieldKeys(spendPriv: Bytes): Promise<ShieldKeys> {
  if (spendPriv.length !== 32) throw new Error('spendPriv must be 32 bytes')
  const shieldSk = bytesToBig(await sha256(concat(SHIELD_TAG, spendPriv))) % R
  return { shieldSk, shieldPk: poseidon([shieldSk]) }
}

export const shieldPkOf = (shieldSk: bigint): bigint => poseidon([shieldSk])

/** C = Poseidon(amount, pk, blinding) */
export const commitment = (amount: bigint, pk: bigint, blinding: bigint): bigint => poseidon([amount, pk, blinding])

/** N = Poseidon(shieldSk, C, leafIndex) */
export const nullifier = (shieldSk: bigint, C: bigint, leafIndex: number | bigint): bigint =>
  poseidon([shieldSk, C, BigInt(leafIndex)])
