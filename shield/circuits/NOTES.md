# CP2a notes: transact circuit, reference model, setup, fixtures

This is a running log. `$B` = `shield/circuits/build` (local, gitignored).
`$B` holds the build output, ptau and zkey, and is not in the repo. Everything ran locally: no chain transactions, no
funds. Nothing is committed.

Tooling is from CP1: circom 2.2.2 at `zk-cp1/tools/bin/circom`, snarkjs 0.7.5, circomlib 2.0.5, circomlibjs 0.1.7,
node 24.22.1, bun 1.3.11.

The machine has 8 cores. Load average was 22-45 from unrelated processes, and the disk was 99 % full (5-6 GB free).

## Layout

- `shield/circuits/transact.circom`: the join-split (spec section 6). Its helpers are `templates/merkle.circom`
  (`MerkleRoot`) and `templates/payload.circom` (`FieldBytesBE`, `BitsBE`).
- `shield/circuits/scripts/compile.sh`, `scripts/setup.sh`: compile with `--O2`, and run phase 2.
- `shield/circuits/build/verification_key.json` and `transact_final.zkey.sha256`. The zkey and wasm stay in `$B`.
- `shield/lib/src/*.ts`: the reference model. Its only dep is circomlibjs; sha256 comes from WebCrypto.
- `shield/lib/test/*.test.ts`: bun tests. `shield/lib/scripts/gen-fixtures.ts` writes `shield/fixtures/chain.json`.

## Commands

```sh
# ptau: PSE perpetual powers of tau, 2^18 (download took about 1 min)
curl -o $B/ptau/ppot_0080_18.ptau https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_18.ptau
#   302,083,218 B, blake2b-512 6355b8e57582568e...bf95450450fd964142d70 (full hash below)

# deps
cd shield/circuits && npm install --ignore-scripts      # circomlib 2.0.5, snarkjs 0.7.5
cd shield/lib && bun install                            # circomlibjs 0.1.7 (+ snarkjs 0.7.5 dev)
# fixtures are reproducible: a second run (SHIELD_FIXTURE_OUT=...) matched chain.json except proof and timingMs

# compile (--O2): 16 s wall
shield/circuits/scripts/compile.sh
#   non-linear constraints 183,095, linear 0, public inputs 2 [S0, H], private inputs 188, wires 181,980
#   (Sha256(1600) alone compiles to 119,998, so the join-split part is about 63,100)
#   wasm 3,434,086 B, sha256 a17a77081a0625194cfda68af398bee085f70b9360f231c137dc718425c0f38a

# phase 2: beacon = BCH mainnet block 978294 hash (api.blockchair.com, 2026-11-21 ~10:00 UTC), 2^10 iterations
shield/circuits/scripts/setup.sh 0000000000000000023ff39e7939e6f4d5d4df7110f6ca43d71409ce7579ed66
#   groth16 setup 186 s, contribute 44 s, beacon 47 s, zkey verify 303 s ("ZKey Ok!"), total 581 s wall
#   (1,935 s CPU). The contribution entropy is `openssl rand -hex 64`, passed inline and never printed or kept.
#   The intermediate zkeys were deleted.
#   transact_final.zkey: 108,121,195 B, sha256 f867fd0ab34d6f99d586f5c808d630f73a28f674f18af230628333e2e72abbe7
#   circuit hash  bca8e57a dd0a7313 60f219b7 259f8242 70279094 c7402ab2 a017b3ee 17572854 ...
#   contribution #1 hash c53615d7 4ba099c8 102ecfcc 2326346a ... (full hashes in $B/zkey-verify.log)

# tests (bun)
cd shield/lib && bun test

# fixtures: 3 real proofs, each verified and checked against the lib (97 s wall in node)
node shield/lib/scripts/gen-fixtures.ts
#   deposit  witness 5,712 ms (includes wasm compile)  prove 37,813 ms
#   transfer witness   508 ms                          prove 14,399 ms
#   withdraw witness 1,548 ms                          prove 35,715 ms
#   second run (load ~20): witness 531-562 ms, prove 10.9-11.3 s per proof
```

ptau blake2b-512 (node crypto), in full:
`6355b8e57582568e1b11efb56719bf20193ce92154c52edb3825e89d47e4c32364134020bca8232671ede0722635e59f528fddfeb24bf95450450fd964142d70`.
I did not run `powersoftau verify`: at 2^12 it did not finish in 2 h 47 min here during CP1. `zkey verify`, which
checks r1cs, ptau and the final zkey, passed.

## Circuit decisions within the spec

- Public signals are inputs `S0, H`, constrained with `===`. A wrong `H` or `S0` therefore yields no witness.
- Every field element in the payload (`S1, C'0, C'1, N0, N1`) goes through `Num2Bits_strict`, so its 32-byte
  encoding is canonical (`< r`). Without this a prover could write `x + r` into the payload, and that would brick
  the pool on `S1`.
- The SMT slot bits are the low 40 bits of the same strict decomposition of `N`. Old and new roots share the siblings.
- `n` is even and `n + 2 <= 2^20` because `m <-- n \ 2`, `n === 2m` and `Num2Bits(19)(m)`.
- `publicAmount` is its u64 two's-complement value, and `pubVal = publicAmount - bit63 * 2^64`.
- `extDataHash` is 32 bytes, and each byte is range-checked by its `Num2Bits(8)`.
- The `recipientLock` length prefix is one raw byte. For `<= 201` that equals CompactSize. It is not a Script push
  opcode, although for locks under 76 B the two are the same byte.

## Test results

`cd shield/lib && bun test` (or `bun test shield/lib` from the repo root) gives **36 pass, 0 fail**, with 188 expects,
in about 12-17 s.

- `lib.test.ts` (12): constants and zeros (`Z1` equals the circuit constant), i64 and field encodings, extData layout,
  hash and contract rules, payload order and H masking, `shieldKeys` against node sha256, Poseidon commitment and
  nullifier, tree paths and roots, the SMT slot and double insert, and the ciphertext tags, roundtrip and authentication.
- `circuit.test.ts`, happy paths (5): the wasm witness computes, and witness `[1]`, `[2]` equal the lib's `S0` and `H`.
  The cases are deposit (2 dummies), transfer (2 real inputs), withdraw (negative `publicAmount`, P2PKH, 1 dummy),
  dummy-first, and the last pair slot `n = 2^20 - 2`.
- `circuit.test.ts`, reject suite (17). Each case has no witness, and each fails at the exact `transact.circom` line it
  targets:
  - double-spend from the set, and the same note twice in one tx: SMT old-leaf check;
  - wrong balance;
  - output `>= 2^64` (field-balanced), output `= 2^64`, `publicAmount` encoding `>= 2^64`, and input `>= 2^64`;
  - note not in the tree, wrong `Rc`, wrong `Rn`, and `S0` not matching the state;
  - wrong `shieldSk`;
  - 9 tampered payload bytes, and tampered extData (H);
  - odd `n`, full tree `n = 2^20`, and a non-empty append slot.
- `circuit.test.ts`, fixtures (2):
  - every `chain.json` proof verifies with snarkjs in node, and tampered `H`, `S0 + 1` and swapped signals fail;
  - every piece, the payload and H in `chain.json` are rebuilt byte for byte from the lib, and the `S0` chain links
    from genesis.
- Without `$SHIELD_BUILD` the circuit suites skip and 14 tests still run.

snarkjs worker threads crash under bun 1.3.11 (`web-worker` `dispatchEvent`). Prove and verify therefore run in node
(`scripts/gen-fixtures.ts`, `scripts/verify-fixtures.ts`). Witness calculation in bun works, at about 0.5 s.

## BCH VM check (outside the repo, CP1 bridge, unmodified upstream verifier)

```sh
# $B/bch-check holds the vk plus the transfer proof (proof.json) and the withdraw proof (proof2.json) from chain.json
node zk-cp1/bridge/snarkjs2fixtures.mjs $B/bch-check $B/bch-check/shield.fixtures.json shield
node zk-cp1/bridge/cp1-run.mjs $B/bch-check/shield.fixtures.json $B/bch-check/shield.report.json   # 10.5 s
```

Both proofs are ACCEPTED (consensus and standard) in libauth BCH 2026:
- unlocking 9,355 / 9,292 / 8,917 B and 9,339 / 9,256 / 8,735 B;
- op cost about 7.07M / 7.02M / 6.70M (margin 6.0 % or more);
- tx 27,713 B and 27,479 B.

All 11 tampers are rejected, and the prover refuses a false statement. Report: `$B/bch-check/shield.report.json`.

## Open items

- circomlibjs `main.js` re-exports its ethers-based contract generators. Check the app's bundle size when CP3 imports
  `shield/lib`.
- The zkey is 108 MB, so it must be chunked for Workers assets (25 MiB per file): at least 5 parts.
