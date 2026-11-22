# Unlinked

Private payment links on Bitcoin Cash. Share one link (`/@you`). Every payment lands on a fresh stealth address that only you can find, and is then shielded by default in our own zero-knowledge pool, verified on-chain in BCH Script.

- The payer can't see where your money goes next.
- You can't see the payer's wallet when they pay from a shielded balance.
- Our server never learns who got paid. It stores public keys and handle-less announcements, nothing else.

Built for BCH BLAZE 2026. Live app: https://getunlinked.pages.dev. Demo video (real mainnet transactions): https://getunlinked.pages.dev/demo.mp4. Pitch deck: https://getunlinked.pages.dev/deck.pdf.

## How it works

**Stealth payments** (`src/lib/stealth.ts`)
- Each profile publishes a scan key and a spend key.
- The payer picks an ephemeral key, derives a one-time address with ECDH on secp256k1 (the ERC-5564 shape), and posts only `(ephemeral pubkey, view tag)` to a public board.
- The receiver scans the board with their scan key and spends with their spend key.
- Payers pay with any wallet through **WizardConnect**, a QR code, or **cross-chain via NEAR Intents** (USDC, ETH, SOL and more, settling to the stealth BCH address).

**Unlinked Shield** (`shield/`, spec in `docs/2026-11-21-unlinked-shield-design.md`)
- **Proof system:** a Groth16 (BN254) 2-in-2-out join-split.
  - Poseidon note commitments.
  - A depth-20 commitment tree.
  - A depth-40 sparse Merkle tree of nullifiers.
  - The pool state `S = Poseidon(Rc, n, Rn)` lives in the commitment of the pool's mutable NFT.
- **Circuit:** `shield/circuits/transact.circom`, 183,095 constraints. Public inputs are `[S_old, H]`, where `H` binds the new state, the commitments, the nullifiers, the public amount and the recipient data byte for byte.
- **Pool covenant:** `shield/contracts/ShieldPool.scash`, written in SolidCash. It checks the verifier statement, recreates the pool with the new state and enforces payout and fee.
- **Proof verifier in BCH Script:** three verifier inputs per transaction, built from mr-zwets' `groth16_cashscript` (`chunked/bn254/bn-native-sound`). We added a 34-byte patch that binds the verifier coins to one pool (`shield/contracts/verifier/PATCH.md`).
- **Cost:** a pool transaction is about 31 kB, so the fee is about 32,000 sat.
- **Client:** proofs are made in the browser (`src/lib/shield/`, Web Worker), in 8 to 23 s. Incoming payments are shielded automatically. Sending to `@handle` and withdrawing both spend from the shielded balance.

**Live on BCH mainnet:** BCHN mainnet nodes accepted the pool and its first three Groth16-verified transactions. Each verifier input uses 82% to 88% of its standard op-cost budget.
- **Pool:** `bitcoincash:pwtm4nmlq66z9sxftgrjnanhku97ctyfxhrnccf0eqqalymceqhk624p0ztws`
- **Genesis:** [`560fb1eb…526453c`](https://blockchair.com/bitcoin-cash/transaction/560fb1eb7318f0695ee2a7aa96d2d1ee973c7b0292743c07a973e0e88526453c)
- **Deposit** of 200,000 sat: [`4f66907e…9d50214`](https://blockchair.com/bitcoin-cash/transaction/4f66907e464bde42ba8a266cb0b4b82e3b76f20ab3d435fadad5a5e309d50214), 31,378 B.
- **Private transfer:** [`20cbbbf2…faccc51`](https://blockchair.com/bitcoin-cash/transaction/20cbbbf2fd2479292831a60755196ef852c5f1df1ebc35e9aedc9f260faccc51), 31,203 B.
- **Withdraw** of 100,000 sat: [`57fb44fd…97be5a2`](https://blockchair.com/bitcoin-cash/transaction/57fb44fd370bdc08f5532d176f7cb307bcc0165c51d279044e5844bd897be5a2), 31,262 B.

**WizardConnect payment on mainnet:** a Cashonize wallet paid `@xfajarr` 0.001 BCH through WizardConnect: [`06b28d53…3b8ba1`](https://blockchair.com/bitcoin-cash/transaction/06b28d53caebd13bb26a1ee6ef6c6d9fcb5ca40598385387c94410b0003b8ba1). It has one output to the one-time address, an `UNLK` OP_RETURN announcement with the ephemeral key, and the wallet's change.

**Trusted setup (disclosure):**
- Phase 1 is the PSE perpetual powers of tau (`ppot_0080_18`).
- Phase 2 is a single contribution plus a random beacon (`shield/circuits/scripts/setup.sh`). That is fine for a demo and not for real value: a multi-party ceremony is required before it holds meaningful funds.

## Repo layout

| Path | What |
|---|---|
| `src/` | The app: a Vite and React SPA. Screens are in `src/screens/`, the wallet, stealth and Shield client in `src/lib/`. |
| `api/` | The API: a Cloudflare Worker and D1. It holds profiles (public keys), the announcement board and a NEAR Intents proxy. |
| `shield/circuits/` | The circom circuit and the setup scripts. `build/` holds the verification key and the zkey hash. |
| `shield/contracts/` | The SolidCash pool, the verifier build and patch, VM test suites, and the deploy and end-to-end scripts. |
| `shield/contracts/test/solidhat/` | The SolidHat suite (`npm run test:solidhat`): the pool's genesis, deposit, transfer and withdraw with real proofs on SolidHat's mock network, plus 11 rejects at the exact `require`. |
| `shield/lib/`, `shield/tx/` | Witness generation, the trees and payload encoding (shared by the circuit tests and the app), and the browser transaction builder. |
| `shield/deployments/` | Deployed pool parameters per network. |

## Run locally

```sh
npm install && (cd api && npm install)
npm run dev:api        # API on :8790 with a local D1
npm run shield:assets  # prover files into public/shield (needs shield/circuits/build/transact_final.zkey)
npm run dev            # app on :3700 (mainnet); dev:chipnet for chipnet on :3702
```

Deploy with `npm run deploy:api`, then `npm run deploy` (Cloudflare Pages project `getunlinked`). `.env.production` holds `VITE_API_URL`.

## Credits

- The Groth16 verifier in BCH Script is mr-zwets/groth16_cashscript (verifier.cash), ISC.
- circom, snarkjs, circomlib and circomlibjs are by iden3, GPL-3.0.
- The powers of tau are PSE's perpetual powers of tau.
- The UI design is by zakariyyaaa.
