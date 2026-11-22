// Unlinked Shield reference model (spec 2026-11-21-unlinked-shield-design.md). Call `await ready()` first.
export * from './field.ts'
export { ready, poseidon } from './poseidon.ts'
export * from './keys.ts'
export * from './trees.ts'
export * from './payload.ts'
export * from './ct.ts'
export * from './witness.ts'

import { CommitmentTree, NullifierTree } from './trees.ts'
import { stateHash } from './payload.ts'

export const genesisState = (): bigint => stateHash(new CommitmentTree().root, 0, new NullifierTree().root)
