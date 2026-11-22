// Pool state trees (spec section 5): Poseidon(l, r) nodes, Z0 = 0, Z(i+1) = Poseidon(Zi, Zi).
import { NULL_DEPTH, TREE_DEPTH } from './field.ts'
import { poseidon } from './poseidon.ts'

const zeroCache: bigint[] = []
export function zeros(depth = NULL_DEPTH): bigint[] {
  if (!zeroCache.length) zeroCache.push(0n)
  while (zeroCache.length <= depth) {
    const z = zeroCache[zeroCache.length - 1]!
    zeroCache.push(poseidon([z, z]))
  }
  return zeroCache.slice(0, depth + 1)
}

class SparseTree {
  readonly depth: number
  private readonly z: bigint[]
  private levels: Map<bigint, bigint>[]

  constructor(depth: number, levels?: Map<bigint, bigint>[]) {
    this.depth = depth
    this.z = zeros(depth)
    this.levels = levels ?? Array.from({ length: depth + 1 }, () => new Map())
  }

  node(level: number, index: bigint): bigint {
    return this.levels[level]!.get(index) ?? this.z[level]!
  }

  get root(): bigint {
    return this.node(this.depth, 0n)
  }

  set(index: bigint, leaf: bigint): void {
    let i = index
    this.levels[0]!.set(i, leaf)
    for (let l = 0; l < this.depth; l++) {
      const p = i >> 1n
      this.levels[l + 1]!.set(p, poseidon([this.node(l, p << 1n), this.node(l, (p << 1n) | 1n)]))
      i = p
    }
  }

  path(index: bigint): bigint[] {
    const out: bigint[] = []
    for (let l = 0; l < this.depth; l++) out.push(this.node(l, (index >> BigInt(l)) ^ 1n))
    return out
  }

  clone(): SparseTree {
    return new SparseTree(this.depth, this.levels.map((m) => new Map(m)))
  }
}

/** Incremental commitment tree, depth 20, appended in pairs at n and n+1 (n always even). */
export class CommitmentTree {
  n: number
  private t: SparseTree

  constructor(t?: SparseTree, n = 0) {
    this.t = t ?? new SparseTree(TREE_DEPTH)
    this.n = n
  }

  get root(): bigint {
    return this.t.root
  }

  leaf(index: number): bigint {
    return this.t.node(0, BigInt(index))
  }

  path(index: number): bigint[] {
    return this.t.path(BigInt(index))
  }

  /** Siblings of the level-1 pair slot n/2 (levels 1..19), for the next appendPair. */
  appendPath(): bigint[] {
    return this.t.path(BigInt(this.n)).slice(1)
  }

  appendPair(c0: bigint, c1: bigint): [number, number] {
    if (this.n % 2 !== 0 || this.n + 2 > 2 ** TREE_DEPTH) throw new Error('commitment tree: bad or full nextIndex')
    const i = this.n
    this.t.set(BigInt(i), c0)
    this.t.set(BigInt(i + 1), c1)
    this.n += 2
    return [i, i + 1]
  }

  clone(): CommitmentTree {
    return new CommitmentTree(this.t.clone(), this.n)
  }
}

const SLOT_MASK = (1n << BigInt(NULL_DEPTH)) - 1n

/** Nullifier set: sparse Merkle tree, depth 40, slot = N mod 2^40, leaf = N (0 = empty). */
export class NullifierTree {
  private t: SparseTree

  constructor(t?: SparseTree) {
    this.t = t ?? new SparseTree(NULL_DEPTH)
  }

  static slot(N: bigint): bigint {
    return N & SLOT_MASK
  }

  get root(): bigint {
    return this.t.root
  }

  at(N: bigint): bigint {
    return this.t.node(0, NullifierTree.slot(N))
  }

  has(N: bigint): boolean {
    return this.at(N) === N
  }

  isFree(N: bigint): boolean {
    return this.at(N) === 0n
  }

  /** 40 siblings for N's slot. They do not depend on the slot's own value. */
  path(N: bigint): bigint[] {
    return this.t.path(NullifierTree.slot(N))
  }

  insert(N: bigint): void {
    if (N === 0n) throw new Error('nullifier tree: N = 0')
    if (!this.isFree(N)) throw new Error('nullifier tree: slot occupied (spent or slot collision)')
    this.t.set(NullifierTree.slot(N), N)
  }

  /** Writes N without the emptiness check (tests only). */
  forceSet(N: bigint): void {
    this.t.set(NullifierTree.slot(N), N)
  }

  clone(): NullifierTree {
    return new NullifierTree(this.t.clone())
  }
}

export function rootFrom(leaf: bigint, index: bigint, siblings: bigint[]): bigint {
  let cur = leaf
  siblings.forEach((s, l) => {
    cur = (index >> BigInt(l)) & 1n ? poseidon([s, cur]) : poseidon([cur, s])
  })
  return cur
}
