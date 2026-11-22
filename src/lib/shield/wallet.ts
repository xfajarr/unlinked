// Note wallet (spec sections 5, 8 and 10 "Sync"): replays the pool's history into both trees and finds our notes.
// libauth and circomlibjs are WebAssembly: load lazily, never during server rendering.
import { secp256k1 } from '@bitauth/libauth'
import * as S from '../../../shield/lib/src/index.ts'

/** One pool transaction as the chain shows it. Hex is big-endian; field elements are 64 hex chars. */
export type PoolEvent = {
  /** Display only: pool transactions without funding inputs are malleable, so the wallet tracks state, not txids. */
  txid: string
  /** The new pool state (output 0's NFT commitment). It is also the sync cursor. */
  S1: string
  C0: string
  C1: string
  /** 0 for a dummy input */
  N0: string
  N1: string
  extData: string
  /** block height; 0 or below while unconfirmed */
  height?: number
}

export interface PoolSource {
  /**
   * Pool transactions after the one that produced state `afterS1` (whole history when omitted).
   * Throws PoolCursorLost when `afterS1` is gone (reorg or dropped unconfirmed tx).
   */
  events(afterS1?: string): Promise<PoolEvent[]>
}

export class PoolCursorLost extends Error {
  constructor() {
    super('The pool history changed. Resyncing.')
  }
}

export function memorySource(all: PoolEvent[]): PoolSource {
  return {
    async events(afterS1) {
      if (afterS1 === undefined) return all.slice()
      const i = all.findIndex((e) => e.S1 === afterS1)
      if (i < 0) throw new PoolCursorLost()
      return all.slice(i + 1)
    },
  }
}

export type WalletKeys = { scanPriv: Uint8Array; shieldSk: bigint; shieldPk: bigint }

export type OwnNote = {
  amount: bigint
  blinding: bigint
  leafIndex: number
  commitment: bigint
  nullifier: bigint
  txid: string
  spent: boolean
}

const field = (hex: string, what: string): bigint => {
  const b = S.fromHex(hex)
  if (b.length !== 32) throw new Error(`pool event: ${what} must be 32 bytes`)
  const x = S.bytesToBig(b)
  if (x >= S.R) throw new Error(`pool event: ${what} is not a field element`)
  return x
}

/** S = scanPriv * E (the stealth ECDH of src/lib/stealth.ts). null when E is not a valid point. */
function sharedSecret(E: Uint8Array, scanPriv: Uint8Array): Uint8Array | null {
  const Sh = secp256k1.mulTweakPublicKeyCompressed(E, scanPriv)
  return typeof Sh === 'string' ? null : Sh
}

export class NoteWallet {
  tree = new S.CommitmentTree()
  nulls = new S.NullifierTree()
  /** S1 of the last applied event; undefined at genesis */
  cursor: string | undefined
  private own: OwnNote[] = []
  private byNullifier = new Map<bigint, OwnNote>()

  private constructor(private readonly keys: WalletKeys) {}

  static async create(keys: WalletKeys): Promise<NoteWallet> {
    await S.ready()
    return new NoteWallet(keys)
  }

  reset(): void {
    this.tree = new S.CommitmentTree()
    this.nulls = new S.NullifierTree()
    this.cursor = undefined
    this.own = []
    this.byNullifier.clear()
  }

  /** Throws (before touching the trees) when the transaction can't follow from the current state. */
  async apply(e: PoolEvent): Promise<void> {
    const C = [field(e.C0, 'C0'), field(e.C1, 'C1')] as const
    const N = [field(e.N0, 'N0'), field(e.N1, 'N1')].filter((n) => n !== 0n)
    const S1 = field(e.S1, 'S1')
    const ext = S.decodeExtData(S.fromHex(e.extData))
    if (N.length === 2 && N[0] === N[1]) throw new Error('pool event: the same nullifier twice')
    if (N.some((n) => !this.nulls.isFree(n))) throw new Error('pool event: nullifier already spent')
    if (this.tree.n + 2 > 2 ** S.TREE_DEPTH) throw new Error('pool event: commitment tree is full')

    const [i0] = this.tree.appendPair(C[0], C[1])
    for (const n of N) this.nulls.insert(n)
    if (S.stateHash(this.tree.root, this.tree.n, this.nulls.root) !== S1) {
      // our trees no longer match the pool: start over on the next sync
      this.reset()
      throw new Error('pool event: state does not match the pool')
    }
    this.cursor = e.S1

    for (const n of N) {
      const mine = this.byNullifier.get(n)
      if (mine) mine.spent = true
    }
    const cts = [ext.ct0, ext.ct1]
    for (let j = 0; j < 2; j++) {
      const note = await this.open(cts[j]!, C[j]!, i0 + j, e.txid)
      if (note) {
        this.own.push(note)
        this.byNullifier.set(note.nullifier, note)
      }
    }
  }

  /** Our note when the ct decrypts under scanPriv and Poseidon(amount, shieldPk, blinding) == C. 0-sat notes are skipped. */
  private async open(ct: Uint8Array, C: bigint, leafIndex: number, txid: string): Promise<OwnNote | null> {
    const Sh = sharedSecret(ct.slice(0, 33), this.keys.scanPriv)
    if (!Sh) return null
    const got = await S.ctOpen({ ct, S: Sh, pk: this.keys.shieldPk, commitment: C })
    if (!got || got.amount === 0n) return null
    return { ...got, leafIndex, commitment: C, nullifier: S.nullifier(this.keys.shieldSk, C, leafIndex), txid, spent: false }
  }

  async sync(source: PoolSource): Promise<number> {
    let evs: PoolEvent[]
    try {
      evs = await source.events(this.cursor)
    } catch (err) {
      if (!(err instanceof PoolCursorLost)) throw err
      this.reset()
      evs = await source.events()
    }
    for (const e of evs) await this.apply(e)
    return evs.length
  }

  get notes(): OwnNote[] {
    return this.own.filter((n) => !n.spent).sort((a, b) => b.leafIndex - a.leafIndex)
  }

  get allNotes(): readonly OwnNote[] {
    return this.own
  }

  get balance(): bigint {
    return this.notes.reduce((s, n) => s + n.amount, 0n)
  }

  /** The current pool state, what the next witness is built against. */
  get state(): S.StateView {
    return { S: S.stateHash(this.tree.root, this.tree.n, this.nulls.root), Rc: this.tree.root, n: this.tree.n, Rn: this.nulls.root }
  }
}

/** One output note for a recipient (spec 8): fresh e, S = e * scanPub, blinding from S, and its ct. Change to self uses own scanPub and shieldPk. */
export async function noteFor(to: { scanPub: Uint8Array; shieldPk: bigint }, amount: bigint): Promise<{ note: S.OutputNote; ct: Uint8Array }> {
  for (;;) {
    const e = crypto.getRandomValues(new Uint8Array(32))
    if (!secp256k1.validatePrivateKey(e)) continue
    const E = secp256k1.derivePublicKeyCompressed(e)
    const Sh = secp256k1.mulTweakPublicKeyCompressed(to.scanPub, e)
    if (typeof E === 'string' || typeof Sh === 'string') throw new Error('Invalid recipient key')
    const ct = await S.ctEncrypt({ S: Sh, E, amount })
    const { blinding } = await S.ctDerive(Sh)
    return { note: { amount, pk: to.shieldPk, blinding }, ct }
  }
}
