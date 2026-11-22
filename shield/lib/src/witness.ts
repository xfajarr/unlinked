// Witness builder for transact.circom (spec section 6). Pure: reads the trees, never mutates them.
import { NULL_DEPTH, TREE_DEPTH, TWO64, i64ToU64, sha256, type Bytes } from './field.ts'
import { commitment, nullifier, shieldPkOf } from './keys.ts'
import { bindingHash, bindingPayload, checkExtData, encodeExtData, stateHash, type ExtData } from './payload.ts'
import { poseidon, ready } from './poseidon.ts'
import { CommitmentTree, NullifierTree, rootFrom } from './trees.ts'

export type InputNote = { amount: bigint; blinding: bigint; leafIndex: number }
export type OutputNote = { amount: bigint; pk: bigint; blinding: bigint }

export type TransactArgs = {
  tree: CommitmentTree
  nulls: NullifierTree
  /** Owner key of the real inputs. Any value when both inputs are dummies. */
  shieldSk: bigint
  inputs: InputNote[]
  outputs: [OutputNote, OutputNote]
  /** i64, newPoolValue - oldPoolValue */
  publicAmount: bigint
  extData: ExtData
  /** Skip the JS-side checks, so tests can hand the circuit an invalid statement. */
  unchecked?: boolean
}

export type StateView = { S: bigint; Rc: bigint; n: number; Rn: bigint }

export type CircuitInput = Record<string, string | string[] | string[][]>

export type TransactWitness = {
  input: CircuitInput
  publicSignals: [string, string]
  pre: StateView
  post: StateView
  publicAmount: bigint
  commitments: [bigint, bigint]
  /** published nullifiers; 0 for a dummy input */
  nullifiers: [bigint, bigint]
  extData: Bytes
  extDataHash: Bytes
  payload: Bytes
  H: bigint
}

const DUMMY: InputNote = { amount: 0n, blinding: 0n, leafIndex: 0 }
const dec = (x: bigint | number) => x.toString()
const zerosOf = (n: number) => Array<bigint>(n).fill(0n)

export async function buildTransactWitness(a: TransactArgs): Promise<TransactWitness> {
  await ready()
  if (a.inputs.length > 2) throw new Error('at most 2 inputs')
  const check = (ok: boolean, msg: string) => {
    if (!a.unchecked && !ok) throw new Error(msg)
  }
  const ins = [...a.inputs, DUMMY, DUMMY].slice(0, 2)
  const outs = a.outputs
  const { tree } = a
  const pk = shieldPkOf(a.shieldSk)

  const Rc = tree.root, n = tree.n, Rn = a.nulls.root
  check(Number.isInteger(n) && n % 2 === 0 && n + 2 <= 2 ** TREE_DEPTH, 'commitment tree nextIndex must be even and below 2^20 - 1')

  const nulls = a.nulls.clone()
  const inPath: bigint[][] = [], nullPath: bigint[][] = [], N: bigint[] = []
  for (const x of ins) {
    check(x.amount >= 0n && x.amount < TWO64, 'input amount out of u64 range')
    check(Number.isInteger(x.leafIndex) && x.leafIndex >= 0 && x.leafIndex < 2 ** TREE_DEPTH, 'leafIndex out of range')
    if (x.amount === 0n) {
      inPath.push(zerosOf(TREE_DEPTH))
      nullPath.push(zerosOf(NULL_DEPTH))
      N.push(0n)
      continue
    }
    const C = commitment(x.amount, pk, x.blinding)
    check(tree.leaf(x.leafIndex) === C, `input note is not in the tree at ${x.leafIndex} (or not owned by shieldSk)`)
    inPath.push(tree.path(x.leafIndex))
    const Ni = nullifier(a.shieldSk, C, x.leafIndex)
    check(nulls.isFree(Ni), 'nullifier already spent (or its slot is taken)')
    nullPath.push(nulls.path(Ni))
    nulls.forceSet(Ni)
    N.push(Ni)
  }

  for (const o of outs) check(o.amount >= 0n && o.amount < TWO64, 'output amount out of u64 range')
  const C0 = commitment(outs[0].amount, outs[0].pk, outs[0].blinding)
  const C1 = commitment(outs[1].amount, outs[1].pk, outs[1].blinding)
  check(ins[0]!.amount + ins[1]!.amount + a.publicAmount === outs[0].amount + outs[1].amount, 'balance: inputs + publicAmount != outputs')
  if (!a.unchecked) checkExtData(a.publicAmount, a.extData)

  const appendPath = tree.appendPath()
  const RcNext = rootFrom(poseidon([C0, C1]), BigInt(n) >> 1n, appendPath)
  const RnNext = nulls.root
  const S0 = stateHash(Rc, n, Rn)
  const S1 = stateHash(RcNext, n + 2, RnNext)

  const extData = encodeExtData(a.extData)
  const edh = await sha256(extData)
  const payload = bindingPayload({ S1, publicAmount: a.publicAmount, C0, C1, N0: N[0]!, N1: N[1]!, extDataHash: edh })
  const H = await bindingHash(payload)

  const input: CircuitInput = {
    S0: dec(S0),
    H: dec(H),
    Rc: dec(Rc),
    n: dec(n),
    Rn: dec(Rn),
    shieldSk: dec(a.shieldSk),
    inAmount: ins.map((x) => dec(x.amount)),
    inBlinding: ins.map((x) => dec(x.blinding)),
    inLeafIndex: ins.map((x) => dec(x.leafIndex)),
    inPath: inPath.map((p) => p.map(dec)),
    nullPath: nullPath.map((p) => p.map(dec)),
    outAmount: outs.map((o) => dec(o.amount)),
    outPk: outs.map((o) => dec(o.pk)),
    outBlinding: outs.map((o) => dec(o.blinding)),
    appendPath: appendPath.map(dec),
    publicAmount: dec(i64ToU64(a.publicAmount)),
    extDataHash: Array.from(edh, dec),
  }

  return {
    input,
    publicSignals: [dec(S0), dec(H)],
    pre: { S: S0, Rc, n, Rn },
    post: { S: S1, Rc: RcNext, n: n + 2, Rn: RnNext },
    publicAmount: a.publicAmount,
    commitments: [C0, C1],
    nullifiers: [N[0]!, N[1]!],
    extData,
    extDataHash: edh,
    payload,
    H,
  }
}

/** Apply a built transaction to the trees (what every client does when it sees it on chain). */
export function applyTransact(tree: CommitmentTree, nulls: NullifierTree, w: TransactWitness): void {
  if (tree.root !== w.pre.Rc || tree.n !== w.pre.n || nulls.root !== w.pre.Rn) throw new Error('state moved since the witness was built')
  tree.appendPair(w.commitments[0], w.commitments[1])
  for (const N of w.nullifiers) if (N !== 0n) nulls.insert(N)
  if (tree.root !== w.post.Rc || nulls.root !== w.post.Rn) throw new Error('applied state does not match the witness')
}
