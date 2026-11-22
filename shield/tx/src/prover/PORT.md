# Prover port

These files are a browser port of the upstream verifier witness code: mr-zwets/groth16_cashscript @ 4571af9 (ISC;
credit mr-zwets / verifier.cash), taken from the copy vendored in `shield/contracts/verifier/upstream/`.

| here | upstream |
|---|---|
| `math.mjs` | `chunked/bn254/sound-si-gls/math.mjs` |
| `si-protocol.mjs` | `chunked/bn254/sound-si-gls/protocol.mjs` |
| `protocol.mjs` | `chunked/bn254/bn-native-sound/protocol.mjs` |
| `unlock.mjs` | `unlockingsFor` from `chunked/bn254/bn-native-sound/transaction.mjs`, plus `capFills` (new) |

The changes are mechanical, and the logic is unchanged:

- `node:assert/strict` becomes `./assert.mjs`.
- `node:crypto` sha256 becomes `@noble/hashes/sha2.js`.
- libauth's `encodeDataPush` becomes `../bytes.mjs` `pushData`, which is byte-identical.
- `Buffer.from(str)`, `Buffer.alloc`, `Buffer.concat` and `Buffer.from(bytes)` become `utf8`, `new Uint8Array`, `cat`
  and `Uint8Array.from`.
- `math.mjs` no longer reads `BN_VK_FIXTURES` from disk. It reads `VK_SOURCE.get()`, which `index.mjs` `loadProver(vk)`
  sets before the first dynamic import. That allows one verification key per page.

## The fillers are new

Upstream sizes each filler by running the VM, aiming for a 6% op-cost margin. Here every unlocking is padded to the
10,000 B cap instead. Upstream's cap rule shows the worst-case op cost of every input is at most
0.94 × 8,032,800, the budget at 10,000 B. This has three effects:

- No BCH 2026 VM is needed in the browser.
- The transaction size does not depend on the proof (`shieldTxSize`).
- Each transaction gains about 2.7 kB (about 31.3 kB against about 28.6 kB). Measured margins are about 12%, 12.5% and
  16–18% per input.

`shield/tx/test/identical.test.mjs` checks the port against the vendored node code. With the same fillers, the
transactions are byte-identical for every `chain.json` step, and the BCH 2026 VM accepts the builder's transactions.
