// Shield keys (spec section 4), derived from the vault's spend key so the 12 words recover them.
// Poseidon is circomlibjs WebAssembly: load this module lazily, never from server code.
import { feBytes, ready, shieldKeys, toHex, type ShieldKeys } from '../../../shield/lib/src/index.ts'

export type { ShieldKeys }

/** shieldSk = int_be(sha256("unlinked/shield" | spendPriv)) mod r, shieldPk = Poseidon(shieldSk). */
export async function deriveShieldKeys(spendPriv: Uint8Array): Promise<ShieldKeys> {
  await ready()
  return shieldKeys(spendPriv)
}

/** The profile form: 32 bytes big-endian as 64 lowercase hex chars. */
export const shieldPkHex = (pk: bigint): string => toHex(feBytes(pk))
