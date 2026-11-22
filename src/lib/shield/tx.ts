// Pool transactions for the three client flows (spec 6, 7, 9.1, 10): witness (shield/lib) -> Groth16 proof -> verifier unlockings -> signed tx, via shield/tx.
// libauth, circomlibjs and shield/tx are WebAssembly or heavy: load this module lazily, never from server code.
import { binToHex, cashAddressToLockingBytecode, encodeDataPush, generateSigningSerializationBCH, hash256, hexToBin, secp256k1 } from '@bitauth/libauth'
import { buildTransactWitness, feBytes, toHex, type CircuitInput, type InputNote, type OutputNote } from '../../../shield/lib/src/index.ts'
import type { Profile } from '../api'
import { CASHADDR_PREFIX } from '../config'
import type { Utxo } from '../fulcrum'
import { spendKey, type Match, type ReceiverKeys } from '../stealth'
import type { Deployment } from './deployment'
import type { ShieldKeys } from './keys'
import type { ShieldTxProgress } from './progress'
import type { PoolTip } from './source'
import { noteFor, type NoteWallet, type OwnNote } from './wallet'

/** sat/B. The relay minimum is 1.0; the margin covers rounding in node fee checks. */
export const FEE_RATE = 1.02
const DUST = 546n
const EXT_BASE = 101 // extData with an empty lock: len (1) + payout (8) + fee (8) + 2 cts (84)

export type ShieldTxRequest =
  /** Shield by default: one stealth coin pays into the pool, publicAmount = value - fee, note 0 to self, note 1 a 0-sat dummy. */
  | { kind: 'deposit'; coin: { utxo: Utxo; match: Match } }
  /** From the private balance: note 0 to the recipient (their shieldPk, ct under their scanPub), note 1 change to self. */
  | { kind: 'send'; to: Pick<Profile, 'handle' | 'scanPub' | 'shieldPk'>; sats: bigint }
  /** From the private balance: payout to any address, note 0 change to self, note 1 a 0-sat dummy. */
  | { kind: 'withdraw'; address: string; sats: bigint }

export type Prover = (input: CircuitInput, onProgress?: (p: ShieldTxProgress) => void) => Promise<{ proof: unknown; publicSignals: string[] }>

export type ShieldTxContext = {
  /** synced to the pool's latest state; `tip` must be that same state */
  wallet: NoteWallet
  tip: PoolTip
  keys: ReceiverKeys & ShieldKeys
  deployment: Deployment
  onProgress?: (p: ShieldTxProgress) => void
  /** default: the browser worker (./prover) */
  prove?: Prover
}

/** `S1` is the pool state the transaction creates. */
export type ShieldTx = { hex: string; txid: string; fee: bigint; size: number; S1: string }

// shield/tx is plain ESM without types: the slice of its API used here
type BuiltTx = { txHex: string; txid: string; size: number; fee: bigint; transaction: unknown; sourceOutputs: unknown }
type TxLib = {
  buildShieldTx(a: Record<string, unknown>): Promise<BuiltTx>
  shieldTxSize(a: { deployment: Deployment; extDataLength?: number; payoutLockLength?: number; fundingCount?: number; change?: boolean }): number
}
// @ts-expect-error untyped ESM (shield/tx/src/index.mjs)
const txLib = (): Promise<TxLib> => import('../../../shield/tx/src/index.mjs')

const feeOf = (size: number) => BigInt(Math.ceil(size * FEE_RATE))

export type ShieldFees = { deposit: bigint; send: bigint; withdraw: (lockLength?: number) => bigint }

/** Exact fees from shieldTxSize (the verifier unlockings are cap-filled, so the size is known before proving). */
export async function shieldFees(deployment: Deployment): Promise<ShieldFees> {
  const T = await txLib()
  return {
    deposit: feeOf(T.shieldTxSize({ deployment, extDataLength: EXT_BASE, fundingCount: 1, change: false })),
    send: feeOf(T.shieldTxSize({ deployment, extDataLength: EXT_BASE })),
    withdraw: (lockLength = 25) => feeOf(T.shieldTxSize({ deployment, extDataLength: EXT_BASE + lockLength, payoutLockLength: lockLength })),
  }
}

/** Up to 2 notes covering `need`: the smallest single note, else the cheapest pair. */
export function pickNotes(notes: readonly OwnNote[], need: bigint): OwnNote[] {
  const single = [...notes].filter((n) => n.amount >= need).sort((a, b) => (a.amount < b.amount ? -1 : 1))[0]
  if (single) return [single]
  let best: OwnNote[] | null = null
  for (let i = 0; i < notes.length; i++)
    for (let j = i + 1; j < notes.length; j++) {
      const s = notes[i]!.amount + notes[j]!.amount
      if (s >= need && (!best || s < best[0]!.amount + best[1]!.amount)) best = [notes[i]!, notes[j]!]
    }
  if (best) return best
  const total = notes.reduce((s, n) => s + n.amount, 0n)
  throw new Error(total >= need ? 'This needs more than two of your private payments at once. Try a smaller amount.' : 'Not enough in your private balance for this amount and the network fee.')
}

const SIGHASH_ALL_FORKID = 0x41

/** P2PKH unlocking (schnorr, SIGHASH_ALL), 100 bytes: what shield/tx sizes funding inputs for. */
function signP2pkh(priv: Uint8Array) {
  const pub = secp256k1.derivePublicKeyCompressed(priv)
  if (typeof pub === 'string') throw new Error(pub)
  return (transaction: unknown, sourceOutputs: unknown, inputIndex: number): Uint8Array => {
    const ser = generateSigningSerializationBCH(
      { inputIndex, sourceOutputs, transaction } as Parameters<typeof generateSigningSerializationBCH>[0],
      { coveredBytecode: (sourceOutputs as { lockingBytecode: Uint8Array }[])[inputIndex]!.lockingBytecode, signingSerializationType: Uint8Array.of(SIGHASH_ALL_FORKID) },
    )
    const sig = secp256k1.signMessageHashSchnorr(priv, hash256(ser))
    if (typeof sig === 'string') throw new Error(sig)
    const s = new Uint8Array(65)
    s.set(sig)
    s[64] = SIGHASH_ALL_FORKID
    const out = new Uint8Array(100)
    out.set(encodeDataPush(s))
    out.set(encodeDataPush(pub), 66)
    return out
  }
}

const browserProver: Prover = async (input, onProgress) => (await import('./prover')).proveTransact(input, { onProgress })

export async function buildShieldTx(req: ShieldTxRequest, ctx: ShieldTxContext): Promise<ShieldTx> {
  const { wallet, tip, keys, deployment } = ctx
  const onProgress = ctx.onProgress
  onProgress?.({ stage: 'build' })
  const T = await txLib()
  if (tip.pool.S !== toHex(feBytes(wallet.state.S))) throw new Error('The private pool just moved. Try again in a moment.')
  const self = { scanPub: keys.scanPub, shieldPk: keys.shieldPk }
  const none = new Uint8Array()

  let inputs: InputNote[] = []
  let outputs: [OutputNote, OutputNote]
  let publicAmount: bigint
  let ext: { recipientLock: Uint8Array; payout: bigint; fee: bigint; ct0: Uint8Array; ct1: Uint8Array }
  const funding: Record<string, unknown> = {}

  if (req.kind === 'deposit') {
    const { utxo, match } = req.coin
    if (utxo.token_data) throw new Error('Token coins stay out of the private pool')
    const fee = feeOf(T.shieldTxSize({ deployment, extDataLength: EXT_BASE, fundingCount: 1, change: false }))
    const amount = BigInt(utxo.value) - fee
    if (amount <= 0n) throw new Error('Too small to make private')
    const [o0, o1] = await Promise.all([noteFor(self, amount), noteFor(self, 0n)])
    outputs = [o0.note, o1.note]
    publicAmount = amount
    ext = { recipientLock: none, payout: 0n, fee: 0n, ct0: o0.ct, ct1: o1.ct }
    const lock = cashAddressToLockingBytecode(match.address)
    if (typeof lock === 'string') throw new Error(lock)
    const lockHex = binToHex(lock.bytecode)
    // value - fee leaves nothing for change, so the builder drops the change output; it still wants a lock for it
    Object.assign(funding, {
      fundingUtxos: [{ txid: utxo.tx_hash, vout: utxo.tx_pos, value: BigInt(utxo.value), lockHex }],
      signFunding: signP2pkh(spendKey(keys.spendPriv, match)),
      changeLock: lockHex,
    })
  } else if (req.kind === 'send') {
    if (!req.to.shieldPk) throw new Error(`@${req.to.handle} hasn't set up a private balance yet`)
    const fee = feeOf(T.shieldTxSize({ deployment, extDataLength: EXT_BASE }))
    inputs = pickNotes(wallet.notes, req.sats + fee)
    const change = inputs.reduce((s, n) => s + n.amount, 0n) - req.sats - fee
    const [o0, o1] = await Promise.all([noteFor({ scanPub: hexToBin(req.to.scanPub), shieldPk: BigInt('0x' + req.to.shieldPk) }, req.sats), noteFor(self, change)])
    outputs = [o0.note, o1.note]
    publicAmount = -fee
    ext = { recipientLock: none, payout: 0n, fee, ct0: o0.ct, ct1: o1.ct }
  } else {
    const r = cashAddressToLockingBytecode(req.address.trim())
    if (typeof r === 'string') throw new Error("That doesn't look like a Bitcoin Cash address.")
    if (r.prefix !== CASHADDR_PREFIX) throw new Error(`Use a ${CASHADDR_PREFIX}: address on this network.`)
    if (req.sats < DUST) throw new Error(`Withdraw at least ${DUST} sats.`)
    const lock = r.bytecode
    const fee = feeOf(T.shieldTxSize({ deployment, extDataLength: EXT_BASE + lock.length, payoutLockLength: lock.length }))
    inputs = pickNotes(wallet.notes, req.sats + fee)
    const change = inputs.reduce((s, n) => s + n.amount, 0n) - req.sats - fee
    const [o0, o1] = await Promise.all([noteFor(self, change), noteFor(self, 0n)])
    outputs = [o0.note, o1.note]
    publicAmount = -(req.sats + fee)
    ext = { recipientLock: lock, payout: req.sats, fee, ct0: o0.ct, ct1: o1.ct }
  }

  const w = await buildTransactWitness({ tree: wallet.tree, nulls: wallet.nulls, shieldSk: keys.shieldSk, inputs, outputs, publicAmount, extData: ext })
  const { proof, publicSignals } = await (ctx.prove ?? browserProver)(w.input, onProgress)
  if (publicSignals[0] !== w.publicSignals[0] || publicSignals[1] !== w.publicSignals[1]) throw new Error('The proof is for another statement')

  onProgress?.({ stage: 'build' })
  const built = await T.buildShieldTx({
    deployment,
    poolUtxo: { txid: tip.pool.txid, vout: tip.pool.vout, value: tip.pool.value, lockHex: deployment.pool.lockHex, token: { category: deployment.category, nft: { capability: 'mutable', commitment: tip.pool.S } } },
    verifierUtxos: tip.verifiers.map((v) => ({ txid: v.txid, vout: v.vout, value: v.value })),
    proof,
    publicSignals,
    pieces: { S1: feBytes(w.post.S), publicAmount, C0: feBytes(w.commitments[0]), C1: feBytes(w.commitments[1]), N0: feBytes(w.nullifiers[0]), N1: feBytes(w.nullifiers[1]), extData: w.extData },
    feeRate: FEE_RATE,
    ...funding,
  })
  return { hex: built.txHex, txid: built.txid, fee: built.fee, size: built.size, S1: toHex(feBytes(w.post.S)) }
}
