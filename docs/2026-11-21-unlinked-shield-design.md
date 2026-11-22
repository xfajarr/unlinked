# Unlinked Shield: design (v0, 2026-11-21)

Unlinked's own shielded pool on Bitcoin Cash. Payments land on stealth addresses as today and are shielded by default.
Inside the pool, balances are notes, and moving them hides the sender, the receiver and the amount.

**Status:** CP1 passed. A proof from our own circom circuit and our own phase-2 setup verifies in the BCH 2026 VM on
the unmodified upstream verifier. This document fixes the interface the circuit, the
contract and the client must share. Nothing here is deployed.

## 1. Goals and non-goals

- The payer cannot learn where the receiver's money goes. The receiver cannot learn the payer's wallet when the payer
  pays from a shielded balance.
- Amounts may stay visible at the pool's edge (deposit and withdraw). Transfers inside the pool hide them.
- Amounts are variable: no fixed denominations. A 2-in-2-out join-split.
- Non-goals for the hackathon: a relayer, a multi-party ceremony (chipnet uses our own phase-2 contribution plus a
  beacon; this is disclosed), and concurrency beyond one transaction per pool state.

## 2. What we reuse (credited)

| Piece | Source | Licence |
|---|---|---|
| BN254 Groth16 verifier in BCH Script, `chunked/bn254/bn-native-sound`, rebuilt for our key via `real-keys` (`BN_VK_FIXTURES`) | mr-zwets/groth16_cashscript (verifier.cash) | ISC (package.json) |
| Poseidon, Sha256, comparators, Merkle helpers | iden3 circomlib / circomlibjs | GPL-3.0 |
| circom 2.2.2, snarkjs 0.7.5 | iden3 | GPL-3.0 |
| Phase-1 powers of tau | PSE perpetual powers of tau (`ppot_0080_*`) | public |

Everything else is ours: the circuit, phase 2, the pool contract (SolidCash), the client and the UX. No SolidPool code.

## 3. Constants

- `r` = 21888242871839275222246405745257275088548364400416034343698204186575808495617 (BN254 scalar field).
- `Poseidon` = circomlib Poseidon (circomlibjs `buildPoseidon` in JS), with arity as written.
- `TREE_DEPTH = 20` (commitment tree). `NULL_DEPTH = 40` (nullifier sparse Merkle tree).
- `MAX_FEE = 50000` sat (the pool pays the miner fee on transfers and withdrawals).
- Field elements on the wire: **32 bytes, big-endian**. `u64`: 8 bytes, big-endian. `i64`: 8 bytes, big-endian two's complement.

## 4. Keys and notes

- `shieldSk = int_be(sha256("unlinked/shield" ‖ spendPriv)) mod r`, where `spendPriv` is the existing key at
  `m/7777'/0'/1'`. It is recoverable from the 12 words.
- `shieldPk = Poseidon(shieldSk)`. It is published in the profile beside `scanPub` and `spendPub` (D1 `users.shield_pk`).
- A note is `{ amount: u64 sat, pk, blinding }`, with commitment `C = Poseidon(amount, pk, blinding)`.
- A spent note's nullifier is `N = Poseidon(shieldSk, C, leafIndex)`.

## 5. Pool state

- **Commitment tree.** Incremental Merkle tree, depth 20, `Poseidon(l, r)`.
  - Zero leaf is `Z0 = 0`, and `Z(i+1) = Poseidon(Zi, Zi)`.
  - Leaves are appended in pairs at `n` and `n+1`, where `n` (`nextIndex`) is always even. Each transaction appends
    exactly 2 leaves.
- **Nullifier set.** Sparse Merkle tree, depth 40.
  - The slot is `key = N mod 2^40` (the low 40 bits). The leaf value is `N` when occupied and `0` when empty.
  - Internal nodes and zeros are as above.
  - Two nullifiers that share a slot would leave the second note unspendable. This is a DoS, not a theft, with
    probability about `k²/2^41` for k notes. Accepted for v0.
- **State hash.** `S = Poseidon(Rc, n, Rn)`.
  - The pool keeps `S` as the 32-byte commitment of its mutable NFT.
  - Genesis: `S_genesis = Poseidon(Rc_empty, 0, Rn_empty)`.

## 6. The transaction circuit (`transact`, 2 in, 2 out)

Public inputs, in order, are **exactly 2**, because the upstream verifier binds 2 runtime inputs:

1. `n0 = S0`: the state before.
2. `n1 = H`: the binding hash of everything else (section 7).

Private witness: `Rc, n, Rn` (old), the two input notes (`amount, blinding, leafIndex, 20 siblings`), `shieldSk`,
the two output notes (`amount, pk, blinding`), both nullifier insertion paths (40 siblings each, the second taken
against the root after the first), the pair-append path (19 siblings), `publicAmount` (as i64), and `extDataHash` (32 bytes).

Constraints:

- **State.** `S0 = Poseidon(Rc, n, Rn)`.
- **Inputs.** For each input i with `amount_i ≠ 0`:
  - `C_i = Poseidon(amount_i, Poseidon(shieldSk), blinding_i)` is a leaf at `leafIndex_i` under `Rc`.
  - `N_i = Poseidon(shieldSk, C_i, leafIndex_i)`.
  - Slot `N_i mod 2^40` is `0` under the current nullifier root. It is then set to `N_i`, which gives the next root.
  - When `amount_i = 0`, membership and insertion are skipped and the published `N_i` is `0`.
- **Outputs.** `C'_j = Poseidon(amount'_j, pk_j, blinding'_j)`, with `amount'_j < 2^64`.
- **Append.** Under `Rc` the pair slot `n/2` (level 1) holds `Z1`. `Rc' ` is the root with `Poseidon(C'_0, C'_1)` there.
  Also `n + 2 ≤ 2^20`.
- **Balance.** All amounts are `< 2^64`, and `publicAmount` is decoded from its i64 bits. Then
  `amount_0 + amount_1 + publicAmount = amount'_0 + amount'_1` in the field. There is no wraparound, because every
  term is below 2^65.
- **New state.** `S1 = Poseidon(Rc', n + 2, Rn')`.
- **Binding.** `H = sha256(payload)` with its top 3 bits cleared (section 7).

Expected size is about 50k constraints for the join-split plus about 4 × 29k for Sha256 over 200 bytes, so roughly
165k in all. That needs ptau `ppot_0080_18`. The zkey is about 100 MB, so the client loads it in chunks (Workers
assets cap each file at 25 MiB).

## 7. Binding payload (the contract and the circuit must agree byte for byte)

```
payload (200 bytes) = S1 (32) ‖ publicAmount (i64, 8) ‖ C'_0 (32) ‖ C'_1 (32) ‖ N_0 (32) ‖ N_1 (32) ‖ extDataHash (32)
H = sha256(payload), then H[0] &= 0x1f, read as a 256-bit big-endian integer (< 2^253 < r)
extData = recipientLock (len-prefixed, ≤ 201 B) ‖ payout (u64) ‖ fee (u64) ‖ ct0 (42) ‖ ct1 (42)
extDataHash = sha256(extData)
```

- `S1` is the pool's new NFT commitment, so the contract reads it from output 0.
- `publicAmount = newPoolValue − oldPoolValue`. It is positive for a deposit, and equals `−(payout + fee)` for a
  transfer or withdrawal.
- `C'_0, C'_1, N_0, N_1` and `extData` are pushed in the pool input's unlocking bytecode. That makes them public and
  permanent, so anyone can rebuild both trees from the chain.

## 8. Encrypted outputs (`ct`, 42 bytes each)

`ct = E (33) ‖ viewTag (1) ‖ encAmount (8)` uses the existing stealth ECDH (`src/lib/stealth.ts`):

- The sender picks `e` and the recipient's `scanPub`. Then `S = e·scanPub`, and `viewTag = sha256("unlinked/viewtag" ‖ S)[0]`.
- `blinding = int_be(sha256("unlinked/blind" ‖ S)) mod r`.
- `encAmount = amount_be8 XOR sha256("unlinked/amount" ‖ S)[0..8]`.

The recipient checks the view tag, decrypts, and accepts only if `Poseidon(amount, shieldPk, blinding) = C'_j`. That
check also authenticates the ciphertext. Change goes to yourself the same way, so a wallet restored from the 12 words
finds everything by scanning the pool's transactions.

## 9. The pool contract (`ShieldPool.scash`, SolidCash)

- **One pool coin** (P2SH32) holds all BCH plus a mutable NFT of the pool's category with commitment `S`.
- **Verifier coins.** Three verifier inputs (`bn-native-sound`, P2SH32) sit in the same transaction. The pool
  recreates them at the same lock and value, so they persist and nobody funds them per transaction.
- **`transact` checks:**
  - Verifier inputs are present at the agreed indices, with the verifier's lock.
  - The verifier's statement says `n0 = old commitment` and `n1 = H`.
  - Output 0 is the pool coin: same lock, same category, mutable NFT, commitment `S1`, and value `old + publicAmount`.
  - If `payout > 0`, output 1 pays exactly `payout` to `recipientLock`.
  - If `publicAmount < 0`, then `−publicAmount = payout + fee` and `fee ≤ MAX_FEE`.
  - If `publicAmount > 0`, then `payout = 0` and `fee = 0` in extData (the depositor pays the miner from their own inputs).
  - `H` is recomputed exactly as in section 7.
- **Transaction size:** about 27.5 kB for the verifier plus a few kB for the pool input, so roughly $0.06 at 1 sat/B.
  Measure it, don't trust this estimate.

### 9.1 As built (CP2b, 2026-11-21)

- **The verifier graph is patched** (34 B; the proof check is unchanged). Upstream required exactly 3 inputs. Now
  inputs 0–2 must share the verifier lock and input 3 must hold the pool's mutable NFT. This binds the verifier coins
  to one pool. Genesis order is: funding coin at output 0 (its txid is the category), then the verifier built for that
  category, then the pool. See `shield/contracts/verifier/PATCH.md`.
- **Fixed layout.**
  - Inputs: verifiers 0–2, pool 3, depositor funding 4 onward.
  - Outputs: pool 0, payout 1 (only if `payout > 0`), the 3 verifier coins recreated, then change. Change is allowed
    only when `publicAmount ≥ 0`.
- **Pool unlocking pushes**, in order: `extData, N1, N0, C'1, C'0`, then the redeem (540 B).
- **Statement:** the verifier exposes n0/n1 at input 2, unlocking bytes [357,389) and [389,421), as 32-byte
  little-endian words.
- **Fee:** a pool transaction is about 28.6 kB, so the fee must be at least about 29k sat to relay at 1 sat/B
  (`MAX_FEE` 50k).
- **Verified** only in libauth 3.1.0-next.8 with the BCHN OP_DEFINE accounting patch, on 37 stand-in and 15 real-key
  cases. The chipnet dry run is the BCHN check.

## 10. Client flows

- **Shield (default).** A stealth UTXO pays into the pool: `publicAmount = value − minerFee`, with output notes to self.
- **Pay from shielded balance.** Output 0 goes to the recipient (their `shieldPk`, and `ct` under their `scanPub`).
  Output 1 is change to self. The receiver sees only the pool.
- **Withdraw.** `payout` to any address, with change to self.
- **Sync.** Read the pool's history from Fulcrum, parse the pool input's pushes, rebuild both trees, and scan the `ct`s.

## 11. Checkpoints

- **CP2:** the circuit and the contract pass deposit, transfer and withdraw on the mock VM with real proofs, plus a
  reject suite.
- **CP3:** shield-by-default and pay or withdraw from the shielded balance work in the app on chipnet.
- **Fallback:** if CP2 slips past Sat 22:00 WIB, the submission ships without Shield.
