// circomlib Poseidon (circomlibjs). Call `ready()` once before any Poseidon-based function.
import { buildPoseidon } from 'circomlibjs'

type PoseidonFn = ((xs: bigint[]) => Uint8Array) & { F: { toObject(x: Uint8Array): bigint } }
let P: PoseidonFn | null = null
let loading: Promise<void> | null = null

export function ready(): Promise<void> {
  loading ??= buildPoseidon().then((p: PoseidonFn) => {
    P = p
  })
  return loading
}

export function poseidon(xs: bigint[]): bigint {
  if (!P) throw new Error('shield lib: await ready() first')
  return P.F.toObject(P(xs))
}
