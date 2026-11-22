// Stealth payments (spec section 5): ephemeral-key ECDH on secp256k1, same shape as ERC-5564.
// Pure functions, no I/O. Runs in the browser (and in bun for tests).
import {
  binToHex,
  deriveHdPath,
  deriveHdPrivateNodeFromSeed,
  deriveSeedFromBip39Mnemonic,
  encodeCashAddress,
  generateBip39Mnemonic,
  hash160,
  hexToBin,
  secp256k1,
  sha256,
} from '@bitauth/libauth'
import { CASHADDR_PREFIX } from './config'

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const enc = new TextEncoder()
const TWEAK_TAG = enc.encode('unlinked/tweak')
const VIEWTAG_TAG = enc.encode('unlinked/viewtag')

export type Bytes = Uint8Array

export type ReceiverKeys = {
  scanPriv: Bytes
  scanPub: Bytes
  spendPriv: Bytes
  spendPub: Bytes
  authPriv: Bytes
  authPub: Bytes
}

export type OneTime = {
  address: string
  /** token-aware cashaddr (CashTokens, e.g. PUSD) for the same key */
  tokenAddress: string
  ephemeralPub: string
  viewTag: number
  publicKey: string
}

const ok = <T>(v: T | string, what: string): T => {
  if (typeof v === 'string') throw new Error(`${what}: ${v}`)
  return v
}
const cat = (a: Bytes, b: Bytes) => {
  const o = new Uint8Array(a.length + b.length)
  o.set(a)
  o.set(b, a.length)
  return o
}
const toBig = (b: Bytes) => BigInt('0x' + binToHex(b))

export const newMnemonic = (): string => generateBip39Mnemonic()

/** Scan, spend and auth keys at m/7777'/0'/{0,1,2}' (spec 5.1). */
export function keysFromMnemonic(mnemonic: string): ReceiverKeys {
  const root = deriveHdPrivateNodeFromSeed(deriveSeedFromBip39Mnemonic(mnemonic.trim()))
  const key = (i: number) => deriveHdPath(root, `m/7777'/0'/${i}'`).privateKey
  const pub = (k: Bytes) => ok(secp256k1.derivePublicKeyCompressed(k), 'derive public key')
  const scanPriv = key(0), spendPriv = key(1), authPriv = key(2)
  return { scanPriv, scanPub: pub(scanPriv), spendPriv, spendPub: pub(spendPriv), authPriv, authPub: pub(authPriv) }
}

function fromShared(S: Bytes): { t: Bytes; viewTag: number } | null {
  const t = sha256.hash(cat(TWEAK_TAG, S))
  const tn = toBig(t)
  // ponytail: probability ~2^-128, caller redraws e
  if (tn === 0n || tn >= N) return null
  return { t, viewTag: sha256.hash(cat(VIEWTAG_TAG, S))[0]! }
}

export function addressesFor(publicKey: Bytes) {
  const payload = hash160(publicKey)
  return {
    address: encodeCashAddress({ prefix: CASHADDR_PREFIX, type: 'p2pkh', payload }).address,
    tokenAddress: encodeCashAddress({ prefix: CASHADDR_PREFIX, type: 'p2pkhWithTokens', payload }).address,
  }
}

export function deriveOneTime(scanPubHex: string, spendPubHex: string): OneTime {
  const V = hexToBin(scanPubHex), B = hexToBin(spendPubHex)
  for (;;) {
    const e = crypto.getRandomValues(new Uint8Array(32))
    if (!secp256k1.validatePrivateKey(e)) continue
    const E = ok(secp256k1.derivePublicKeyCompressed(e), 'ephemeral key')
    const S = ok(secp256k1.mulTweakPublicKeyCompressed(V, e), 'shared secret')
    const d = fromShared(S)
    if (!d) continue
    const P = ok(secp256k1.addTweakPublicKeyCompressed(B, d.t), 'one-time key')
    return { ...addressesFor(P), ephemeralPub: binToHex(E), viewTag: d.viewTag, publicKey: binToHex(P) }
  }
}

export type Match = { publicKey: Bytes; tweak: Bytes; address: string; tokenAddress: string }

export function scanAnnouncement(keys: Pick<ReceiverKeys, 'scanPriv' | 'spendPub'>, ephemeralPubHex: string, viewTag: number): Match | null {
  const S = secp256k1.mulTweakPublicKeyCompressed(hexToBin(ephemeralPubHex), keys.scanPriv)
  if (typeof S === 'string') return null
  const d = fromShared(S)
  if (!d || d.viewTag !== viewTag) return null
  const P = ok(secp256k1.addTweakPublicKeyCompressed(keys.spendPub, d.t), 'one-time key')
  return { publicKey: P, tweak: d.t, ...addressesFor(P) }
}

/** Private key for a found output: p = b + t, checked against P before use. */
export function spendKey(spendPriv: Bytes, m: Match): Bytes {
  const p = ok(secp256k1.addTweakPrivateKey(spendPriv, m.tweak), 'spend key')
  const P = ok(secp256k1.derivePublicKeyCompressed(p), 'spend pubkey')
  if (binToHex(P) !== binToHex(m.publicKey)) throw new Error('derived key does not match the one-time address')
  return p
}

/** OP_RETURN payload pushes: "UNLK", version 0, E (33 bytes), viewTag (1 byte). */
export function announcementPushes(ephemeralPubHex: string, viewTag: number): Bytes[] {
  return [enc.encode('UNLK'), Uint8Array.of(0), hexToBin(ephemeralPubHex), Uint8Array.of(viewTag)]
}
