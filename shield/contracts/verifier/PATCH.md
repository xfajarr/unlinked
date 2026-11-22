# Verifier patch: pool GRAPH

`upstream/` vendors these files from mr-zwets/groth16_cashscript @ 4571af9 (ISC; credit mr-zwets / verifier.cash):
`chunked/bn254/bn-native-sound/{asm,kernels,protocol,script,transaction,vm}.mjs`,
`chunked/bn254/sound-si-gls/{math,protocol,asm}.mjs` and `patches/@bitauth__libauth@3.1.0-next.8.patch`.

Only `bn-native-sound/script.mjs` changes, and only by the hook in `PATCH.diff`: `setGraph(fn)` replaces the body of the
shared `GRAPH` function. With no hook set, the build is byte-identical to upstream. The real key gives code sha256
`aa790c2d…2009` (7,309 B) from both this copy and the CP1 clone.

## Why the change is needed

Upstream GRAPH requires `OP_TXINPUTCOUNT == 3`, with all three inputs on the verifier lock. So no pool input can sit
in the same transaction. Spec section 9 cannot be built on the unmodified verifier.

## What `poolGraph(poolToken)` (verifier.mjs) emits instead

```
OP_INPUTINDEX OP_UTXOBYTECODE                         -> mine
<j> OP_UTXOBYTECODE mine OP_EQUALVERIFY               for j = 0, 1, 2   (unchanged)
<3> OP_UTXOTOKENCATEGORY <category ‖ 0x01> OP_EQUALVERIFY                (new: input 3 holds the pool's mutable NFT)
```

- The input-count rule is dropped. Input 3 must exist, because `OP_UTXOTOKENCATEGORY(3)` fails otherwise. Depositors'
  funding inputs come after it.
- Soundness of the proof check is unchanged. Roles are still dispatched by `OP_INPUTINDEX + 22`, so only inputs 0, 1
  and 2 run a role. A verifier-locked coin at index 3 or higher has no role function and fails. The sibling-lock check
  still pins all three roles to the same authenticated code.
- **The verifier coins are bound to the pool.** They can only be spent in a transaction that also spends the pool's
  mutable NFT, and the pool covenant then forces them to be recreated. Without this binding, anyone could replay an
  old proof from the chain and take the verifier coins. The test `verifier coins spent without the pool` covers this.
- Cost: +34 B of code (7,343 / 7,344 B against 7,309). Op cost is unchanged within noise: the fillers are re-sized to
  the same 6% margin.
- Consequence: each build binds one pool category. The order is: genesis outpoint, then verifier, then pool lock (see
  `genesis.mjs`).
