# Unlinked — Design Spec

> Working name. Rename freely; nothing below depends on it.

**One-liner:** Get paid in BCH or dollars (PUSD) without exposing your wallet. One private link, a fresh address for every payment, payable from any wallet.

**Context:** BCH BLAZE 2026 entry (Mainnet track + Community Choice; Build with XO bounty is a stretch). Submission deadline **Sun 22 Nov 2026, 14:00 UTC (21:00 WIB)**. Spec written Fri 20 Nov, 22:40 WIB.

---

## 1. Problem

On Bitcoin Cash every address is public. Sharing one (bio link, shop QR, donation page, invoice) lets any stranger see your balance, every payment you received, and who paid you. Freelancers leak client income, creators leak earnings, shops leak revenue to competitors.

Proven demand elsewhere: Fluidkey (EVM, $900M+ transfers claimed), PIVY (Sui, 1st place Payments + community vote at Sui Overflow 2025), WAYS.cash (Solana, Solrift 2025 Grand Champion). Nothing comparable exists as a consumer product on BCH.

## 2. Goals and non-goals

**Goals**
- A receiver gets a shareable link (`/@handle`) and a QR in under a minute, no seed-phrase ceremony up front.
- Every payment lands on a fresh one-time address that nobody but the receiver can link to them.
- Payers need nothing new: scan a QR with any BCH wallet, or pay in one tap via WizardConnect.
- Support BCH and PUSD (ParyonUSD CashToken).
- Payments show up in the receiver's inbox within seconds (0-conf).
- Meets every BLAZE eligibility rule (section 10).

**Non-goals (for this hackathon)**
- Hiding amounts or the payer's own wallet history (that is shielded-pool territory, see Nito Cash).
- Custody, KYC, fiat off-ramps.
- Mobile native apps.
- Compatibility with Electron Cash RPA or 00-Protocol's BIP352-style scheme (both need the payer's input private keys, which WizardConnect never exposes).

## 3. Positioning

| | Unlinked | Nito Cash (BLAZE) | 00-Protocol / 0penw0rld | ~15 BLAZE payment-link apps |
|---|---|---|---|---|
| Job | Get paid privately | Hold and send PUSD privately | Privacy toolkit + wallet | Get paid |
| Payer needs | Any BCH wallet | Nito wallet, funds inside pool | Supporting wallet | Any wallet |
| Privacy | Receiver unlinkable | Strongest (ZK pool) | Stealth + CoinJoin | None (reused or watch-only addresses) |
| UX | Consumer (link, QR, inbox) | Developer-grade panel | Power-user | Varies |

Pitch line for judges: *"Nito protects what you hold. Unlinked protects how you get paid."*

## 4. Users and flows

### 4.1 Receiver onboarding
1. Landing: "Get paid on Bitcoin Cash. Stay private." with a handle input.
2. Claim handle (`[a-z0-9_]{3,20}`, unique). The app generates a BIP39 seed in the browser, derives keys (section 5.1), encrypts the seed (section 6), and registers `{handle, scanPub, spendPub, authPub}` with the API.
3. Optional profile: display name, avatar URL, one-line bio.
4. Lands on the Inbox with the share card (link + QR + copy button).

Backup: the 12 words are shown at onboarding with "Save later" allowed. Once the inbox holds funds, a persistent banner blocks withdrawals until the user confirms the backup.

### 4.2 Payer (BCH via QR, any wallet)
1. Opens `/@handle`: profile, amount field (optional), currency toggle BCH / PUSD, optional message.
2. Page derives a one-time address (section 5.2), **posts the announcement to the API first**, and only after a 2xx shows the QR (`bitcoincash:` BIP21 URI with amount).
3. Page subscribes to that address and flips to "Paid ✓" on 0-conf.

PUSD via QR is not supported (no reliable CashTokens payment-URI support across wallets). When the payer picks PUSD, the QR is hidden and only "Pay with wallet" (WizardConnect) is offered.

### 4.3 Payer (BCH or PUSD via WizardConnect)
1. "Pay with wallet" opens the WizardConnect QR dialog (`@wizardconnect/react`).
2. The app derives payer addresses from the xpubs WizardConnect returns, fetches their UTXOs from Fulcrum, and builds the tx with libauth:
   - output 0: payment to the one-time address (BCH, or a token output carrying PUSD to the token-aware form of the address),
   - output 1: `OP_RETURN` announcement (section 5.3),
   - change.
3. `manager.signTransaction({ transaction: { transaction, sourceOutputs, broadcast: true }, inputPaths })`.
4. The announcement is also posted to the API (same record as 4.2).

### 4.4 Receiver inbox
- Totals (BCH, PUSD, USD estimate), list of payments (amount, time, decrypted message, status pending/confirmed).
- Detection runs client-side (section 7.3); the server never learns the one-time addresses.

### 4.5 Withdraw
- Pick payments, enter a destination address (token-aware if PUSD is included), confirm.
- Builds and signs locally with per-output spend keys, broadcasts via Fulcrum.
- Privacy warning when more than one payment is selected: "Withdrawing these together links them on-chain." Default selection is one payment.

### 4.6 Pay from another chain (P1)
1. On `/@handle`, "Other chain": payer picks chain + token (any of the 232 assets / 39 chains NEAR Intents 1Click lists) and an amount, and enters a refund address on that chain (1Click requires it for non-NEAR origins).
2. The page derives a fresh one-time BCH address (section 5.2), posts the announcement, then asks the Worker to proxy `POST https://1click.chaindefuser.com/v0/quote` with `destinationAsset: nep141:bch.omft.near`, `recipient: <one-time address>`, `refundTo: <payer refund address>`.
3. Show the returned `depositAddress` (QR + copy), exact amount, estimated BCH out and ETA. Poll `GET /v0/status?depositAddress=` until `SUCCESS`; the inbox picks the payment up like any other.
4. Verified 2026-11-20: dry quote 10 USDC (Base) → 0.05238869 BCH, `timeEstimate` 152 s, no API key. Output is native BCH only (not PUSD).

### 4.7 Send to @handle (P1)
From the inbox, send BCH or PUSD to another handle: spend **one** one-time UTXO, pay the recipient's freshly derived one-time address, send change to a fresh self-stealth address (announced on the same board). Both sides stay unlinkable.

### 4.8 Withdraw to another chain (P2)
Quote with `originAsset: nep141:bch.omft.near`, `refundTo: <fresh self-stealth BCH address>`, pay the 1Click `depositAddress` from one one-time UTXO per payment.

### 4.9 Privacy X-ray (P2)
- Landing-page hook: paste a BCH address (or connect via WizardConnect) and see what a stranger sees: balance, total received, number of payers, address reuse. CTA: "Get your private link."
- Read-only, own-address framing; no "look up anyone" marketing.

## 5. Stealth scheme

Ephemeral-key ECDH on secp256k1, same shape as Ethereum's ERC-5564. All hashes are SHA-256 with an ASCII domain tag prefix.

### 5.1 Receiver keys
From the BIP39 seed, BIP32 hardened paths under a private purpose:
- scan key `v` at `m/7777'/0'/0'`, `V = v·G`
- spend key `b` at `m/7777'/0'/1'`, `B = b·G`
- auth key `a` at `m/7777'/0'/2'`, `A = a·G` (profile edits only)

`V` and `B` are published in the profile. `v`, `b`, `a` never leave the device.

### 5.2 One-time address (payer side)
1. Random 32-byte `e`; `E = e·G` (compressed, 33 bytes).
2. `S = e·V` via `secp256k1.mulTweakPublicKeyCompressed(V, e)`.
3. `t = SHA256("unlinked/tweak" ‖ S)` read as a 256-bit integer; if `t = 0` or `t ≥ n`, redraw `e` (probability ~2⁻¹²⁸, but the check is cheap).
4. `viewTag = SHA256("unlinked/viewtag" ‖ S)[0]`.
5. `P = B + t·G` via `secp256k1.addTweakPublicKeyCompressed(B, t)`.
6. Address: P2PKH of `hash160(P)`, encoded as cashaddr (token-aware variant for PUSD).

### 5.3 Announcement (global board, server-blind)
- API record: `{ ephemeralPub: E, viewTag, noteCiphertext?, createdAt }` on **one board shared by all users**. No handle, no address, no channel. The board is publicly readable: it is meaningless without a scan key.
- Contrast: Fluidkey shares a BIP-32 node of the user's private viewing key with its backend to generate addresses (per its technical walkthrough), so its server can link payments to users. Ours never receives `v`.
- On-chain (WizardConnect payments only): `OP_RETURN <"UNLK"> <0x00 version> <E 33B> <viewTag 1B>`. Gives a chain-only recovery path later (P2).
- Optional payer message: encrypted to `V` (ECIES: ECDH with a fresh key, AES-256-GCM), stored as `noteCiphertext`.

### 5.4 Detection and spending (receiver side)
For each announcement: `S = v·E`; skip if `viewTag` mismatches; else compute `t`, `P`, address; query Fulcrum. Spend key for a found output: `p = b + t mod n` via `secp256k1.addTweakPrivateKey(b, t)`, and `p·G` must equal `P` (assert before signing).

### 5.5 Spending rules (no re-linking)
- "Private withdraw" is on by default: one transaction per received payment, never consolidated. Turning it off with more than one payment selected shows a linking warning.
- Every transaction that needs change sends it to a fresh self-stealth address (new `e`, own `V`/`B`), announced on the board.
- Send to @handle spends a single one-time UTXO when it covers the amount; otherwise it splits into several single-input transactions.
- Fulcrum lookups for one-time addresses are spread across 2–3 servers (shuffled) so no single server sees the whole set.

### 5.6 Library choice
`@bitauth/libauth` 3.x for secp256k1 tweak ops, hashing, cashaddr, tx building and signing (Schnorr). Confirmed present in libauth 3.0.0: `addTweakPrivateKey`, `addTweakPublicKeyCompressed`, `mulTweakPublicKeyCompressed`, `derivePublicKeyCompressed`, `signMessageHashSchnorr`.

## 6. Key storage and auth

- **P0:** seed encrypted with AES-256-GCM, key from PBKDF2-SHA256 (600k iterations) over a user password; ciphertext in IndexedDB.
- **P1:** passkey unlock via the WebAuthn PRF extension where supported; password stays as fallback.
- Profile edits: server issues a nonce; client returns a Schnorr signature by `a` over `SHA256(nonce ‖ handle ‖ payload)`; server checks against stored `A`.
- Announcements carry no handle, so reads need no auth and reveal nothing per user.

## 7. Architecture

### 7.1 Components
- **Web app:** Vite + React + TypeScript SPA. Libraries: libauth, `@wizardconnect/react` + `@wizardconnect/dapp`, `@scure/bip39`, `@electrum-cash/network`.
- **API:** one Cloudflare Worker (Hono) serving the SPA assets and `/api/*`, backed by D1.
- **Chain access:** Fulcrum over WebSocket from the browser, 2+ public servers with failover. No chain access from the Worker.
- **Price:** BCH/USD from a public price API, client-side, display only.

### 7.2 Data model (D1)
```sql
CREATE TABLE users (
  handle TEXT PRIMARY KEY,
  scan_pub TEXT NOT NULL, spend_pub TEXT NOT NULL, auth_pub TEXT NOT NULL,
  display_name TEXT, avatar_url TEXT, bio TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ephemeral_pub TEXT NOT NULL UNIQUE, view_tag INTEGER NOT NULL,
  note_ciphertext TEXT,
  created_at INTEGER NOT NULL
);
```

### 7.3 API
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/users` | none (rate-limited) | Claim handle, register `V`, `B`, `A` |
| GET | `/api/users/:handle` | none | Public profile + `V`, `B` |
| PATCH | `/api/users/:handle` | auth sig | Edit profile |
| POST | `/api/announcements` | none (rate-limited) | Store announcement (no handle) |
| GET | `/api/announcements?after=id` | none | Anyone pulls the board; inboxes filter locally |
| POST | `/api/xchain/quote` | none (rate-limited) | Proxy to 1Click `/v0/quote`, stores nothing |
| GET | `/api/xchain/status?depositAddress=` | none | Proxy to 1Click `/v0/status` |
| GET | `/api/nonce` | none | Nonce for auth signatures |

Rate limits: per-IP on handle claims and announcements (Workers rate-limit binding or a D1 counter).

### 7.4 Detection loop (client)
1. Poll `GET /api/announcements?after=cursor` every 5 s while the inbox is open.
2. For each new record: `S = v·E`; drop if the view tag mismatches (~255/256 of other users' records); else derive `P` (section 5.4), subscribe its scripthash on a shuffled Fulcrum server, fetch UTXOs.
3. Persist found payments in IndexedDB; advance the cursor.

## 8. Privacy properties (honest)

**Provides (four layers):**
1. Stealth receiving: observers cannot link one-time addresses to each other or to the handle.
2. Server-blind: one global announcement board with no handles; the server never holds `v`, so it cannot tell who was paid, which addresses, or amounts. Payer messages are encrypted to `V`.
3. No re-linking on spend: one transaction per payment by default, fresh self-stealth change.
4. Private @handle-to-@handle sends: one-time input to one-time output.

**Does not provide:**
- Amount privacy, or privacy of the payer's own wallet. (Roadmap: shield into a ZK pool via verifier.cash / SolidPool.)
- Protection if the user turns Private withdraw off and merges payments (warned in UI).
- Protection from a compromised frontend that serves a swapped `V`/`B`. Mitigation: open source, key fingerprint on the share card.
- Network metadata: IP and timing at our API; Fulcrum servers see which addresses one client checks (spread across servers, not eliminated).
- Cross-chain: NEAR Intents sees the payer's origin address and the one-time destination (not the handle).

Fund-loss risk: a QR payment whose announcement never reached the API is unrecoverable. Mitigation: announce-first (QR shown only after a 2xx), and WizardConnect payments also carry the OP_RETURN copy.

## 9. Error handling

| Case | Behavior |
|---|---|
| Announcement POST fails | Do not show the QR; retry with backoff; show "Couldn't prepare a private address, try again". |
| Fulcrum disconnect | Failover to next server, resubscribe all tracked scripthashes. |
| WizardConnect rejected/cancelled | Back to pay screen, nothing posted on-chain; announcement stays harmless. |
| Payer wallet has no PUSD / insufficient funds | Pre-check UTXOs before building; explain in one line. |
| Wrong password / PRF unavailable | Retry; fall back to password. |
| Withdraw to non-token-aware address with PUSD selected | Block with "This address can't receive tokens". |
| Derived `p·G ≠ P` | Abort signing, log, show error (never sign with a wrong key). |

## 10. BLAZE compliance checklist
- [ ] Submitted on DoraHacks before Sun 22 Nov 14:00 UTC.
- [ ] Live demo URL, usable without explanation.
- [ ] A judge can make a BCH **mainnet** tx through the app (pay any handle via WizardConnect or QR).
- [ ] WizardConnect integration (payer flow).
- [ ] Top-of-home-page banner: Widget Factory deck link, GitHub repo, CashTokens donation address.
- [ ] No pre-existing work (started Fri 20 Nov), so no before/after links needed; say so in the deck.
- [ ] Introduced in the BLAZE Telegram group. (Roll call was missed: low-priority queue, so traction and posts matter.)

## 11. Testing
- **Unit (vitest):** payer-derived address equals receiver-derived address over 1,000 random key pairs; `p·G == P`; view-tag mismatch skips; OP_RETURN encode/decode round trip; ECIES note round trip.
- **Chipnet E2E (script):** pay via raw tx → detect → withdraw, using faucet funds (tbch.googol.cash, chipnet.bch.ninja).
- **Mainnet smoke:** BCH via QR, BCH via WizardConnect (Selene, Cashonize), PUSD via WizardConnect, withdraw. Amounts under $1.
- **Fresh-eyes test:** two BLAZE participants complete pay + receive without guidance before submission.

## 12. Scope and schedule (WIB)

**P0, must ship, done by Sat 15:00**
Onboarding + handle claim, public `/@handle` page, QR pay (BCH), WizardConnect pay (BCH + PUSD) with OP_RETURN, global announcement board, inbox detection (0-conf), private withdraw (one tx per payment), deployed on mainnet with the banner.

**P1, Sat 15:00 to Sun 09:00**
Pay from another chain (1Click proxy + deposit screen + status), send to @handle, encrypted payer messages, UI polish pass, Widget Factory deck, X launch thread, Telegram intro, invite testers.

**P2, only if P0 and P1 are solid**
Withdraw to another chain, passkey unlock, any-CashToken display (BCMR metadata), Fulcrum query spreading, Nostr mirror of the board, Privacy X-ray, XO template (Build with XO bounty), OP_RETURN chain-scan recovery.

**Explicitly out:** social login (needs third-party custody), cards, bank off-ramp, yield.

| When (WIB) | Work |
|---|---|
| Fri 23:00 – Sat 03:00 | Repo, Worker + D1, stealth lib + unit tests, key gen/encrypt |
| Sat 08:00 – 12:00 | `/@handle` page, QR flow, announcements, inbox detection |
| Sat 12:00 – 15:00 | WizardConnect pay (BCH, PUSD), withdraw, mainnet deploy |
| Sat 15:00 – 22:00 | P1 polish, X-ray, deck, launch post, testers |
| Sun 08:00 – 14:00 | Bug fixes from testers, P2 only if green |
| Sun 14:00 – 18:00 | Freeze features, final mainnet smoke, banner/deck check |
| Sun 18:00 – 20:00 | Submit on DoraHacks (1 h buffer before 21:00) |

## 13. Constants
- PUSD category: `2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544`, 2 decimals (per paryonusd.com).
- OP_RETURN prefix: ASCII `UNLK`, version `0x00`.
- Key purpose path: `m/7777'/0'/{0,1,2}'`.

## 14. Open questions
1. Final product name and domain.
2. Which public Fulcrum servers to use (pick 2–3 with WebSocket, verify on Saturday morning).
3. Whether to ship the Privacy X-ray as the landing hero or a secondary page (decide after P0 works).
