// Stablecoin bridge: stables on other chains <-> PUSD on BCH. NEAR Intents moves stables <-> BCH, Cauldron pools swap BCH <-> PUSD.
// Each bridge run gets a fresh key kept in this browser; it receives the funds, swaps them and pays out in one BCH transaction.
import { CASHADDR_PREFIX, PUSD_CATEGORY, PUSD_DECIMALS } from './config'
import { broadcast, listUnspent, type Utxo } from './fulcrum'
import { BCH_ASSET, xchainQuote, type XQuote } from './api'

export { PUSD_CATEGORY, PUSD_DECIMALS }
const INDEXER = 'https://indexer.cauldron.quest/cauldron'
const FEE_PER_BYTE = 1n
// left out of a BCH -> PUSD trade to pay the tx fee and the token output's dust
const BUY_RESERVE = 4000n
// kept back from the NEAR deposit in a PUSD -> BCH run, in case the pools move between quote and broadcast
const SELL_MARGIN = 1500n

const libs = () => Promise.all([import('@bitauth/libauth'), import('@cashlab/cauldron'), import('@cashlab/common')])

export const toUnits = (s: string, decimals: number): bigint => {
  const m = s.trim().match(/^(\d*)(?:\.(\d*))?$/)
  if (!m || (!m[1] && !m[2])) return 0n
  return BigInt((m[1] || '0') + (m[2] ?? '').padEnd(decimals, '0').slice(0, decimals))
}
export const fromUnits = (n: bigint, decimals: number): string => {
  const s = n.toString().padStart(decimals + 1, '0')
  const f = s.slice(-decimals).replace(/0+$/, '')
  return decimals ? `${s.slice(0, -decimals)}${f ? '.' + f : ''}` : s
}

export type BridgeKey = { keyHex: string; address: string; tokenAddress: string; lockHex: string }

export async function newKey(): Promise<BridgeKey> {
  const [L] = await libs()
  for (;;) {
    const key = crypto.getRandomValues(new Uint8Array(32))
    if (L.validateSecp256k1PrivateKey(key)) return keyInfo(L.binToHex(key))
  }
}

export async function keyInfo(keyHex: string): Promise<BridgeKey> {
  const [L] = await libs()
  const pub = L.secp256k1.derivePublicKeyCompressed(L.hexToBin(keyHex))
  if (typeof pub === 'string') throw new Error(pub)
  const lock = L.encodeLockingBytecodeP2pkh(L.hash160(pub))
  const enc = (tokenSupport: boolean) => {
    const r = L.lockingBytecodeToCashAddress({ bytecode: lock, prefix: CASHADDR_PREFIX, tokenSupport })
    if (typeof r === 'string') throw new Error(r)
    return r.address
  }
  return { keyHex, address: enc(false), tokenAddress: enc(true), lockHex: L.binToHex(lock) }
}

export async function recoveryWif(keyHex: string): Promise<string> {
  const [L] = await libs()
  return L.encodePrivateKeyWif(L.hexToBin(keyHex), 'mainnet')
}

/** Locking bytecode for a user's BCH address; the plain (q) form of it for NEAR refunds. */
export async function parseBchAddress(address: string): Promise<{ lock: Uint8Array; plain: string } | null> {
  const [L] = await libs()
  const r = L.cashAddressToLockingBytecode(address.trim())
  if (typeof r === 'string' || r.prefix !== CASHADDR_PREFIX) return null
  const plain = L.lockingBytecodeToCashAddress({ bytecode: r.bytecode, prefix: CASHADDR_PREFIX, tokenSupport: false })
  return typeof plain === 'string' ? null : { lock: r.bytecode, plain: plain.address }
}

type Pool = Awaited<ReturnType<typeof fetchPools>>[number]

async function fetchPools() {
  const [L, C] = await libs()
  const lab = new C.ExchangeLab()
  const r = await fetch(`${INDEXER}/pool/active?token=${PUSD_CATEGORY}`)
  if (!r.ok) throw new Error('Could not load Cauldron pools. Try again.')
  const { active } = (await r.json()) as { active: { owner_pkh: string; txid: string; tx_pos: number; sats: number; tokens: number }[] }
  return active.map((p) => {
    const parameters = { withdraw_pubkey_hash: L.hexToBin(p.owner_pkh) }
    return {
      version: '0' as const,
      parameters,
      outpoint: { txhash: L.hexToBin(p.txid), index: p.tx_pos },
      output: { locking_bytecode: lab.generatePoolV0LockingBytecode(parameters), amount: BigInt(p.sats), token: { amount: BigInt(p.tokens), token_id: PUSD_CATEGORY } },
    }
  })
}

/** PUSD units (cents) a BCH amount buys right now, after the trade's fee reserve. */
export async function estimateBuy(sats: bigint): Promise<bigint> {
  const [, C] = await libs()
  const supply = sats - BUY_RESERVE
  if (supply <= 0n) return 0n
  return new C.ExchangeLab().constructTradeBestRateForTargetSupply('BCH', PUSD_CATEGORY, supply, await fetchPools(), FEE_PER_BYTE).summary.demand
}

/** Satoshis a PUSD amount (cents) sells for right now, before the tx fee. */
export async function estimateSell(units: bigint): Promise<bigint> {
  const [, C] = await libs()
  if (units <= 0n) return 0n
  return new C.ExchangeLab().constructTradeBestRateForTargetSupply(PUSD_CATEGORY, 'BCH', units, await fetchPools(), FEE_PER_BYTE).summary.demand
}

export type Holdings = { utxos: Utxo[]; sats: bigint; pusd: bigint }

export async function holdings(address: string): Promise<Holdings> {
  const utxos = (await listUnspent(address)).filter((u) => !u.token_data || (u.token_data.category === PUSD_CATEGORY && !u.token_data.nft))
  return {
    utxos,
    sats: utxos.reduce((a, u) => a + BigInt(u.value), 0n),
    pusd: utxos.reduce((a, u) => a + BigInt(u.token_data?.amount ?? 0), 0n),
  }
}

async function coins(key: BridgeKey, utxos: Utxo[]) {
  const [L, , K] = await libs()
  return utxos.map((u) => ({
    type: K.SpendableCoinType.P2PKH as typeof K.SpendableCoinType.P2PKH,
    key: L.hexToBin(key.keyHex),
    outpoint: { txhash: L.hexToBin(u.tx_hash), index: u.tx_pos },
    output: {
      locking_bytecode: L.hexToBin(key.lockHex),
      amount: BigInt(u.value),
      ...(u.token_data ? { token: { amount: BigInt(u.token_data.amount), token_id: u.token_data.category } } : {}),
    },
  }))
}

async function send(tx: { txbin: Uint8Array }) {
  const [L] = await libs()
  return broadcast(L.binToHex(tx.txbin))
}

/** Swaps all BCH held by the bridge key into PUSD and pays it, plus leftover BCH, to the user. Returns the txid and PUSD units. */
export async function buyAndPay(key: BridgeKey, userLock: Uint8Array): Promise<{ txid: string; pusd: bigint }> {
  const [, C, K] = await libs()
  const h = await holdings(key.address)
  const bch = h.utxos.filter((u) => !u.token_data)
  const sats = bch.reduce((a, u) => a + BigInt(u.value), 0n)
  if (sats <= BUY_RESERVE) throw new Error('No BCH has arrived yet.')
  const lab = new C.ExchangeLab()
  const trade = lab.constructTradeBestRateForTargetSupply('BCH', PUSD_CATEGORY, sats - BUY_RESERVE, await fetchPools(), FEE_PER_BYTE)
  const tx = lab.createTradeTx(trade.entries, await coins(key, bch), [
    { type: K.PayoutAmountRuleType.FIXED, locking_bytecode: userLock, token: { amount: trade.summary.demand, token_id: PUSD_CATEGORY }, amount: -1n },
    { type: K.PayoutAmountRuleType.CHANGE, locking_bytecode: userLock, add_change_to_txfee_when_bch_change_is_dust: true },
  ], null, FEE_PER_BYTE)
  lab.verifyTradeTx(tx)
  return { txid: await send(tx), pusd: trade.summary.demand }
}

export type SellPlan = { pools: Pool[]; units: bigint; maxDeposit: bigint }

/** Most BCH the PUSD held by the bridge key can deliver to one output after the trade and the tx fee. */
export async function planSell(key: BridgeKey): Promise<SellPlan> {
  const [L, C, K] = await libs()
  const h = await holdings(key.address)
  if (h.pusd <= 0n) throw new Error('No PUSD has arrived yet.')
  const pools = await fetchPools()
  const lab = new C.ExchangeLab()
  const trade = lab.constructTradeBestRateForTargetSupply(PUSD_CATEGORY, 'BCH', h.pusd, pools, FEE_PER_BYTE)
  const probe = lab.createTradeTx(trade.entries, await coins(key, h.utxos), [
    { type: K.PayoutAmountRuleType.CHANGE, locking_bytecode: L.hexToBin(key.lockHex) },
  ], null, FEE_PER_BYTE)
  const maxDeposit = probe.payouts_info.reduce((a, p) => a + (p.output.token ? 0n : p.output.amount), 0n)
  return { pools, units: h.pusd, maxDeposit }
}

/** Quotes NEAR for the BCH a sell delivers, keeping a small margin. */
export async function quoteSell(plan: SellPlan, destinationAsset: string, recipient: string, refundTo: string): Promise<XQuote & { sats: bigint }> {
  const sats = plan.maxDeposit - SELL_MARGIN
  if (sats <= 0n) throw new Error('That PUSD amount is too small to bridge.')
  const q = await xchainQuote({ data: { originAsset: BCH_ASSET, destinationAsset, amount: sats.toString(), recipient, refundTo } })
  if ('error' in q) throw new Error(q.error)
  return { ...q, sats }
}

/** Sells the key's PUSD on Cauldron and pays the NEAR deposit address in the same transaction; leftover BCH goes to the user. */
export async function sellAndDeposit(key: BridgeKey, depositAddress: string, sats: bigint, userLock: Uint8Array): Promise<string> {
  const [L, C, K] = await libs()
  const dep = L.cashAddressToLockingBytecode(depositAddress)
  if (typeof dep === 'string') throw new Error('NEAR returned a deposit address this app cannot read.')
  const h = await holdings(key.address)
  const lab = new C.ExchangeLab()
  const trade = lab.constructTradeBestRateForTargetSupply(PUSD_CATEGORY, 'BCH', h.pusd, await fetchPools(), FEE_PER_BYTE)
  const tx = lab.createTradeTx(trade.entries, await coins(key, h.utxos), [
    { type: K.PayoutAmountRuleType.FIXED, locking_bytecode: dep.bytecode, amount: sats },
    { type: K.PayoutAmountRuleType.CHANGE, locking_bytecode: userLock, add_change_to_txfee_when_bch_change_is_dust: true },
  ], null, FEE_PER_BYTE)
  lab.verifyTradeTx(tx)
  return send(tx)
}
