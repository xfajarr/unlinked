# Unlinked Shield contracts (CP2b)

These notes cover the pool covenant (`ShieldPool.scash`, SolidCash 0.51.1), the verifier coins (a vendored
`bn-native-sound` with one GRAPH change, `verifier/PATCH.md`), the genesis builder, and a whole-transaction VM test
harness. Everything is local: no chain, no funds, nothing committed.

## Commands

```sh
cd shield/contracts
# deps: copied from the CP1 / spike installs. A fresh install would be:
#   npm install                       (root: SolidCash, about 5 min; bun cannot resolve its git libauth fork)
#   (cd verifier && npm install)      (libauth 3.1.0-next.8 + noble 2.2.0; postinstall applies the OP_DEFINE patch)
#   (cd standin && npm install)       (snarkjs 0.7.5, circomlib 2.0.5)
npm run build                                   # solidc ShieldPool.scash -> build/ShieldPool.json (470 B code)
sh standin/setup.sh <circom 2.2.2> <ppot_0080_12.ptau>   # TEST-ONLY stand-in key (already done, standin/build/)
node verifier/build.mjs <verification_key.json> <categoryHex> <out.build.json>   # verifier for a key + pool category, about 5 s
node --test --test-concurrency=1 test/standin.test.mjs     # 37 tests, stand-in key, about 30 s -> build/standin.report.json
node --test --test-concurrency=1 test/real-chain.test.mjs  # 15 tests, real CP2a key + fixtures/chain.json -> build/real.report.json
npm run test:solidhat                           # SolidHat suite, 20 tests on the strict mock, about 4 s (see "SolidHat suite")
FUNDING_KEY=<hex> node genesis.mjs <build.json> <fundingTxid> <sats> <S_genesis hex>   # offline: prints a signed genesis tx
```

## Transaction layout (fixed)

| index | inputs | outputs |
|---|---|---|
| 0, 1, 2 | verifier coins (roles 0..2; the role is the input index, forced by the verifier's dispatch) | 0: pool coin (same lock, same category, mutable, commitment S1, value old + publicAmount) |
| 3 | pool coin (mutable NFT, commitment S) | 1: payout to `recipientLock`, **only if payout > 0** |
| 4.. | depositor's P2PKH funding (deposit only) | v..v+2: verifier coins recreated (same lock, same value), where v = 2 with a payout, else 1 |
| | | v+3..: change. Allowed only when publicAmount ≥ 0; when the pool pays, the output count must be exactly v + 3 |

Pool unlocking (`ShieldPool.transact`), as pushed: `extData`, `N1`, `N0`, `C'1`, `C'0`, then the redeem (540 B = 470 B
code plus 70 B of constructor pushes). SolidCash pushes the last argument first. A syncing client parses these pushes
from input 3.

## STMT layout and byte orders

- The verifier's statement sits in **input 2's** unlocking. Its layout is
  `[push DG 96 B][push STMT 642 B][S_2][HAND_2][DS_2][FILL_2][WQ][R]`.
  - The DG push header is `4c 60` (2 B) and the STMT push header is `4d 82 02` (3 B), so STMT data starts at byte **101**.
  - `STMT_LAYOUT = {n0: 256, n1: 288, N0: 320, N1: 385, sc: 450}` (`bn-native-sound/protocol.mjs`).
  - So `n0` is at unlocking bytes **[357, 389)** and `n1` at **[389, 421)**.
  - Both are **32-byte little-endian** words, decoded unsigned (`BIN2NUM(w ‖ 0x00)`), and every role requires them `< r`.
  - Role 2 pins its own layout (DEPTH, every item size, the raw unlocking size, minimal pushes), so these offsets are
    exact whenever the verifier accepts. `verifier.mjs` asserts the offsets against the build layout.
- The pool reads `slice(357, 421)` and **reverses each word** to compare it with the spec's 32-byte big-endian values:
  `rev(n0) == inputs[3].nftCommitment` (S0), and `rev(n1) == H`.
- Token category: libauth keeps `token.category` and `outpointTransactionHash` in UI (txid) order.
  `OP_UTXOTOKENCATEGORY` pushes the category **reversed** (internal order), followed by `0x01` for mutable.
  - So `poolToken = reverse(genesisTxid) ‖ 0x01`. It is a constructor argument of the pool and a constant in the
    verifier GRAPH.
  - Gotcha: libauth runs `category.slice().reverse()`. On a Node `Buffer`, `slice` is a view, so this reverses the
    caller's bytes in place. `pool.mjs` copies every token into plain `Uint8Array`s.
- `publicAmount` is computed on chain as `out0.value − in3.value`. It enters the payload as i64 big-endian two's
  complement: `NUM2BIN(pa < 0 ? pa + 2^64 : pa, 9)`, keep the 8 low bytes, reverse.
- `payout` and `fee` are read from extData u64 BE as `BIN2NUM(reverse(b8) ‖ 0x00)`, which is unsigned. The extData
  length prefix is one raw byte (≤ 201) and the total length must be `len + 101`.
- H matches `shield/fixtures/chain.json` and `shield/lib/src/payload.ts` byte for byte. The real-chain test asserts
  payload, H and `publicSignals[1]` for every step.

## Pool rules (`ShieldPool.scash`, in this order)

1. Graph: `activeInputIndex == 3`, `inputs[3].tokenCategory == poolToken`, and inputs 0..2 on `verifierLock`.
2. Statement: `rev(n0) == inputs[3].nftCommitment`.
3. Output 0: same lock, `tokenCategory == poolToken` (category and mutable capability), FT amount 0, and a 32 B
   commitment S1. `publicAmount = out0.value − in3.value`.
4. extData parse: lock length ≤ 201 and exact total length.
5. If publicAmount > 0: payout = 0 and fee = 0. Otherwise: `−publicAmount == payout + fee` and `fee ≤ 50,000`.
6. If payout > 0: output 1 pays exactly `payout` to `recipientLock`. The three verifier outputs are then recreated
   (same lock, same value as inputs 0..2).
7. If publicAmount < 0: `outputs.length == v + 3`, so no output can skim the pool-paid fee.
8. `rev(n1) == (sha256(S1 ‖ i64(pa) ‖ C'0 ‖ C'1 ‖ N0 ‖ N1 ‖ sha256(extData))` with `[0] &= 0x1f`).

The verifier (all 3 roles) adds: the proof is valid for (n0, n1), and input 3 holds the pool NFT.

## Harness choice

It uses raw libauth transactions and `vm.verify` from the vendored **libauth 3.1.0-next.8 with the OP_DEFINE patch**
(`createVirtualMachineBch2026(false/true)`), not SolidCash's `MockNetworkProvider`, for three reasons:

1. SolidCash's libauth fork lacks the patch, so it would under-charge `OP_DEFINE` against BCHN. The verifier runs at a
   6% op margin, so that matters.
2. The 3 verifier unlockings (about 9.3 kB each, fillers prover-sized inside the real transaction) need byte-level
   control.
3. `verify()` checks the whole transaction: every input, token rules, value, dust and standardness.

SolidCash is used only to compile the contract and encode `transact`'s unlocking. Every accept or reject verdict in
the reports is `vm.verify` in both consensus and standard mode. The harness then locates the failing input and maps
its instruction pointer to the `require` line through the artifact's `debug.requires`. Each reject asserts the
**exact** guard it expects.

## Results

### Stand-in key (TEST ONLY), `build/standin.report.json`: 37/37 pass

| tx | bytes | miner fee | inputs: unlocking B / op std / margin |
|---|--:|--:|---|
| genesis | 428 | 1,000 | P2PKH 100 B |
| deposit +100,000 | 28,655 | 30,000 | 9,333 / 7.05M / 6.02%; 9,272 / 7.00M / 6.01%; 8,672 / 6.55M / 6.01%; **pool 778 / 79,815 / 87.8%**; P2PKH 100 |
| transfer (fee 30,000) | 28,548 | 30,000 | 9,358 / 7.07M; 9,256 / 6.99M; 8,731 / 6.60M (all about 6.0%); pool 778 / 83,892 / 87.2% |
| withdraw 40,000 + fee 30,000 | 28,615 | 30,000 | 9,334 / 7.05M; 9,256 / 6.99M; 8,763 / 6.62M; pool 803 / 85,493 / 87.3% |
| control: fee = 50,000 | 28,619 | 50,000 | accepted |

32 rejects, each rejected in consensus AND standard, at the expected guard:

| attack | guard that fires |
|---|---|
| S1, C'0, C'1, N0, N1, extData (ct byte; recipient swapped with output 1 following), commitment not updated, deposit pool value − 1, proof binding publicAmount + 1 | `rev(n1) == hm` (H) |
| wrong S0 (valid proof for another state), stale proof replayed | `rev(n0) == nftCommitment` |
| pool value + 1 on a withdraw; payout + fee ≠ −publicAmount | `0 − publicAmount == payout + fee` |
| fee 50,001 (honest binding) | `fee <= 50000` |
| deposit with payout 5,000 / with fee 1,000 | `payout == 0` / `fee == 0` |
| payout to another lock / 1 sat short / 1,000 over | output 1 lock / value |
| extra output (withdraw, transfer) | `outputs.length == v + 3` |
| verifier output to another lock / 1 sat short / all dropped | verifier output lock / value / output index out of range |
| category swapped (fresh genesis from the pool outpoint), downgraded to immutable | `outputs[0].tokenCategory == poolToken` |
| NFT moved to another lock | `outputs[0].lockingBytecode == inputs[3].lockingBytecode` |
| verifier inputs at the wrong lock (drop-all P2SH32 carrying the same STMT bytes) | `inputs[0].lockingBytecode == verifierLock` |
| verifier inputs missing (pool at input 0) | `activeInputIndex == 3` |
| fake pool coin without the NFT | `inputs[3].tokenCategory == poolToken` |
| verifier coins spent without the pool | verifier input 0, GRAPH (input 3 has no pool NFT) |

### Real CP2a key + `fixtures/chain.json` (real proofs), `build/real.report.json`: 15/15 pass

- genesis (S_genesis = `chain.genesis.S`, pool 1,000 sat), deposit, transfer and withdraw: all accepted, consensus and
  standard.
  - Sizes: 28,659 / 28,767 / 28,593 B.
  - Verifier inputs: about 7.05M / 7.00M / 6.55–6.70M op, 6.0–6.5% margin.
  - Pool input: 778–803 B, about 85k op, 87% margin.
- 11 rejects on real proofs (extData ct / recipient byte, S1, C'0, N0, payout lock and amount, pool value, extra
  output, deposit short, stale replay) all fire at the expected guard.
- **Fee warning:** the fixtures pay 2,000 and 3,000 sat on transactions of about 28.7 kB, i.e. 0.07–0.10 sat/B. That
  is fine for the contract (libauth does not check fee rate), but a BCHN mempool at the 1 sat/B relay minimum rejects
  it. Clients must set `fee ≥ txBytes` (about 29,000 sat), which is within `MAX_FEE`.

## SolidHat suite (`npm run test:solidhat`)

```sh
cd shield/contracts
npm run test:solidhat    # solidhat compile (artifacts/solidcash/), then Vitest with vitest.solidhat.config.js
```

- **Setup:** `@solidcash/solidhat` 0.51.1 and `vitest` 5 as npm dev dependencies, initialized with
  `solidhat --init --template javascript`. `solidcash.config.js` sets contracts `.`, tests `test/solidhat/` and plain
  `solidc` options, so the artifact is byte-identical to `build/ShieldPool.json`. Only mock networks are configured.
- **Network:** the default `strict` mock has BCH limits (input and stack item 10,000 B, transaction 100,000 B,
  commitment 128 B, op budget 800 per byte) with dust and standardness on. The full transactions fit.
- **Covered** (`test/solidhat/ShieldPool.test.mjs`, 20 tests):
  - Artifact: SolidHat's compile matches the deployed bytecode. With the deployed parameters it reproduces the
    mainnet pool redeem and lock and the verifier lock (`deployments/mainnet.json`).
  - Lifecycle: genesis from a mock coin at the mainnet funding outpoint, so the category is the mainnet one. Then
    deposit, transfer and withdraw with the real proofs of `fixtures/chain.json`, as full transactions (3 verifier
    inputs, pool, funding). The mock accepts each one. The tests then read its UTXO set: pool value, category,
    mutable NFT, commitment S1, old pool coin spent, verifier coins recreated, payout.
  - 11 rejects, each refused by the mock at input 3 and asserted with `toBeRevertedWith` on the
    `ShieldPool.scash:<line>` require: stale proof (wrong S0), payout lock, payout 1 sat short, fee 50,001, pool value
    skimmed, extra output on a transfer and on a withdraw, NFT moved, NFT downgraded, verifier coin not recreated,
    extData tampered (H).
  - A statement the proof does not prove is refused by the verifier coins (input 2). The unmodified withdraw is
    accepted on the same pre-state.
- **How:**
  - The preset resets the mock before every test, so each step is a named `loadFixture` (`depositReady`,
    `depositSent`, ...) on top of the previous one.
  - The mock reports only the failing input. The suite finds the failing instruction with `pool.mjs`'s VM and maps
    it through the artifact's `debug.requires` into SolidCash's `FailedRequireError`.
- **Sponsor input:** the fixtures' pool-paid fees (2,000 and 3,000 sat) are under the mock's 1 sat/B relay floor.
  Transfer and withdraw therefore carry one extra 30,000 sat P2PKH input and no change. The pool and the verifier
  GRAPH allow extra inputs, so the covenant rules are the same.
- **Fee 50,001** uses the real withdraw proof, so its binding would fail too. `fee <= 50000` is simply the first guard
  that fires. The honestly bound case is in the stand-in suite.
- **Op-cost caveat:** SolidCash's pinned libauth under-counts `OP_DEFINE` against BCHN (solidcash/solidcash#20,
  bitauth/libauth#166), so this mock can be more permissive on op cost than mainnet. Its hash-iteration limit also
  stays relaxed. `test/real-chain.test.mjs`, on the patched libauth, stays the authority on op-cost margins.

## Design notes and residual risks

- **Statement binding** is complete: n0 = S0 (pool NFT), and n1 = H over every value the pool's next state and payout
  depend on (S1 from output 0, publicAmount from values, the pushed C', N and extData).
- **Malleability:**
  - A pool transaction without funding inputs carries no signature. A third party can rebroadcast it and resize the
    verifier fillers FILL_0 and FILL_1, which changes the txid (upstream owner note).
  - Outputs are fully pinned when the pool pays, so no value can be redirected.
  - Deposits are signed SIGHASH_ALL by the depositor.
  - Track pool state by the pool coin, not by txid.
- **Concurrency:** one transaction per state (S0 changes every time). This is a non-goal in the spec.
- **Stuck coins:**
  - BCH sent to the pool address without the NFT can never be spent: it fails at `activeInputIndex` or the category
    check.
  - The genesis pool value (1,000 sat) is an unowned permanent reserve that keeps the token output above dust.
- **The verifier coins** (1,000 sat each) live forever beside the pool. The pool GRAPH binding keeps them from being
  replay-spent.
- **Not run on BCHN:** this verifier GRAPH change and the pool were checked with libauth (BCHN accounting patch) only.
  Upstream proved libauth/BCHN parity for the unmodified verifier. Before mainnet, run `testmempoolaccept` on
  BCHN regtest or do a chipnet dry run.

## For chipnet (not done here)

1. Fund a chipnet coin at output index **0**. Its txid becomes the category.
2. `node verifier/build.mjs ../circuits/build/verification_key.json <txid> build/chipnet.build.json`
3. `FUNDING_KEY=… node genesis.mjs build/chipnet.build.json <txid> <sats> <chain.genesis.S>`, then broadcast.
4. The client ports `planTransact` / `finalize` / `prove` (test/harness.mjs) and `pool.mjs` (encoding, unlocking). The
   verifier fillers are prover-sized by `loadVerifier().unlockings`. The fee must be ≥ 1 sat/B, about 29k sat.
5. Sync: parse input 3's pushes (order above) and output 0's commitment.

## Files

- `ShieldPool.scash`: the covenant. `build/ShieldPool.json`: its compiled artifact.
- `pool.mjs`: encoding, H, contract wrapper, P2PKH signing, tx helpers, VM verdicts.
- `genesis.mjs`: the genesis builder and offline CLI.
- `verifier/verifier.mjs`: vendored verifier loader, pool GRAPH, prover-sized unlockings in context.
- `verifier/build.mjs`, `verifier/PATCH.md`, `verifier/PATCH.diff`, `verifier/upstream/` (vendored, ISC).
- `standin/`: **TEST ONLY** free-statement circuit, key and prover. Never deploy it.
- `test/harness.mjs`, `test/standin.test.mjs`, `test/real-chain.test.mjs`.
- `test/solidhat/ShieldPool.test.mjs`, `solidcash.config.js`, `vitest.solidhat.config.js`: the SolidHat suite.
- `build/*.build.json` (verifier builds), `build/*.report.json` (results).

## CP3b: browser builder and chipnet

### `shield/tx` (browser-portable, ESM, no node APIs)

API (`shield/tx/src/index.mjs`):

| call | does |
|---|---|
| `buildShieldTx({deployment, poolUtxo, verifierUtxos, proof, publicSignals, pieces, fundingUtxos?, signFunding?, changeLock?, feeRate})` | returns `{txHex, txid, size, fee}` |
| `shieldTxSize({deployment, extDataLength, payoutLockLength, fundingCount, change})` | exact size before proving |
| `poolFromTx(txHex)` | parses input 3's pushes (extData, N1, N0, C'1, C'0, redeem), output 0's commitment and value, S0 and H from input 2, and the payout and verifier outpoints |
| `encodeExtData`, `decodeExtData`, `bindingHash`, `poolUnlocking`, `planShieldTx`, `verifierUnlockings` | the building blocks |

- `deployment` is `shield/deployments/chipnet.json` as written. It carries the verifier redeem, code pieces and vk, and
  the pool redeem.
- Dependencies: `@bitauth/libauth` 3.0.0 is enough (encode, decode and txid only; no VM), plus `@noble/curves` and
  `@noble/hashes` 2.x. libauth 3.1.0-next.8 with the OP_DEFINE patch is needed only for the VM checks in tests and
  scripts.
- The verifier unlockings are **cap-filled to 10,000 B** (`src/prover/PORT.md`), so no VM is needed in the browser.
  - Transactions are about 31.2–31.4 kB.
  - Op margins are about 12% per input.
  - The fee is `ceil(size × feeRate)`, at feeRate 1.0 or more.
  - For transfers and withdrawals the fee lives in extData. Pick it from `shieldTxSize()` before proving: about
    31.9k sat at 1.02 sat/B.
- Measured in node: prover load 215 ms, witness and unlockings 146 ms. The esbuild browser bundle is 405 kB in
  `index.js` (with libauth) plus a 95 kB lazy prover chunk.
- Test: `node --test shield/tx/test/identical.test.mjs`.
  - With the same fillers, the builder (libauth 3.0.0, noble 2.0.1) and the harness (libauth 3.1.0-next.8) produce
    **byte-identical** transactions for every `chain.json` step.
  - The VM accepts them in consensus and standard mode.
  - `shieldTxSize` is exact, `poolFromTx` round-trips, and the browser bundle has no node built-ins.

### Deploy scripts (`deploy/`)

- `deploy.mjs`:
  - Polls the funding address every 30 s.
  - Makes an output-0 coin if needed, builds the verifier for that category, and runs genesis with S_genesis from
    `shield/lib`.
  - Checks the transaction locally in the VM, broadcasts it, and writes `shield/deployments/chipnet.json`.
  - `DRY_RUN=1` runs the same pipeline against an in-memory chain.
- `e2e.mjs`:
  - Steps: deposit 200,000 to A, transfer 120,000 to B, then withdraw 50,000 to the funding address.
  - Uses real snarkjs proofs and the shield/tx builder, with a local VM check before each broadcast.
  - It is resumable: every run rebuilds both trees and scans A's and B's notes from the pool's on-chain history (the
    client's sync flow).
  - Writes `shield/deployments/chipnet-e2e.json`.
  - The offline `DRY_RUN=1` rehearsal passed: 31,378 / 31,203 / 31,262 B, fees 32,006 / 31,828 / 31,888 sat, final pool
    87,284 sat with A's note 48,172 and B's 38,112.

### Networks and the broadcast gate

- **Network:** `NETWORK=chipnet|mainnet` (default chipnet). The Fulcrum servers are the app's (`src/lib/config.ts`).
  Every address must carry the network's prefix.
- **Keys:** `.keys/<network>-funding.json`, plus `.keys/<network>-e2e-wallets.json` with the A and B mnemonics, so
  leftover notes stay ours. Both are mode 600 and gitignored. `node deploy/keygen.mjs` creates them and prints only the
  address.
- **Gate on mainnet:** a send happens only with `BROADCAST=1`. Without it, the scripts run in plan mode: they read real
  UTXOs, build the exact transactions, check them on the patched BCH 2026 VM, print txids, sizes and fees, and write
  only `build/mainnet*.plan.json`. The e2e plan continues from the planned genesis.
- **Caps:**
  - The fee rate must be within [1, 1.1] sat/B on mainnet.
  - Each transaction's fee is at most 50,000 sat.
  - The funding key may never spend more than it held at start.
  - The deploy waits for `MIN_FUNDS` (400,000 sat).
- **E2E:** deposit 200,000, transfer 150,000 to B, withdraw 100,000 to the funding address.
- **Records:** `shield/deployments/<network>.json` and `<network>-e2e.json` are written only by live runs.
