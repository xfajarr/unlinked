// The pool's history from Fulcrum (spec 9.1, shield/contracts/NOTES.md "Transaction layout").
// Inputs: verifiers 0..2, pool coin 3, funding 4... Output 0 is the new pool coin, whose NFT commitment is S1.
// Input 3's unlocking pushes, in order: extData, N1, N0, C'1, C'0, then the redeem script.
// libauth is WebAssembly: load this module lazily, never from server code.
import { binToHex, cashAddressToLockingBytecode, decodeAuthenticationInstructions, decodeTransaction, hexToBin, sha256 } from '@bitauth/libauth'
import { decodeExtData, feBytes, genesisState, ready, toHex } from '../../../shield/lib/src/index.ts'
import { PoolCursorLost, type PoolEvent, type PoolSource } from './wallet'

export const POOL_INPUT = 3
const REDEEM_LEN = 540

export type Outpoint = { txid: string; vout: number }
export type Coin = Outpoint & { value: bigint }
export type PoolTip = { pool: Coin & { S: string }; verifiers: Coin[] }
export type TipSource = PoolSource & { tip(): PoolTip | null }
export type PoolConfig = { address: string; genesis: Outpoint }
export type PoolRpc = {
  history(scripthash: string): Promise<{ tx_hash: string; height: number }[]>
  transaction(txid: string): Promise<string>
}

const key = (o: Outpoint) => `${o.txid}:${o.vout}`

/** Electrum scripthash: sha256(lockingBytecode), byte-reversed, as hex. */
export const scripthashOf = (lockingBytecode: Uint8Array) => binToHex(sha256.hash(lockingBytecode).reverse())

export function poolLockOf(address: string): Uint8Array {
  const r = cashAddressToLockingBytecode(address.trim())
  if (typeof r === 'string') throw new Error(`Shield pool address: ${r}`)
  return r.bytecode
}

type Decoded = NonNullable<ReturnType<typeof decode>>
function decode(txHex: string) {
  const tx = decodeTransaction(hexToBin(txHex))
  return typeof tx === 'string' ? null : tx
}

const sameBytes = (a: Uint8Array | undefined, b: Uint8Array | undefined) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i])

function poolCoin(tx: Decoded, vout: number) {
  const o = tx.outputs[vout]
  const nft = o?.token?.nft
  if (!o || !o.token || !nft || nft.capability !== 'mutable' || nft.commitment.length !== 32) return null
  return { lock: o.lockingBytecode, category: binToHex(o.token.category), S: binToHex(nft.commitment) }
}

/** The event of a pool tx spending `prev` at input 3, or null. Throws when it spends the pool coin without the pool's shape (a parser bug; the contract forbids it). */
export function parsePoolTx(txid: string, tx: Decoded, prev: { outpoint: Outpoint; lock: Uint8Array; category: string }): PoolEvent | null {
  const inp = tx.inputs[POOL_INPUT]
  if (!inp || binToHex(inp.outpointTransactionHash) !== prev.outpoint.txid || inp.outpointIndex !== prev.outpoint.vout) return null
  const ins = decodeAuthenticationInstructions(inp.unlockingBytecode)
  const pushes = ins.map((i) => ('malformed' in i && i.malformed) || !('data' in i) ? null : i.data)
  if (pushes.length !== 6 || pushes.some((p) => p === null)) throw new Error(`pool tx ${txid}: input 3 is not 6 pushes`)
  const [extData, N1, N0, C1, C0, redeem] = pushes as Uint8Array[]
  if ([N1, N0, C1, C0].some((p) => p!.length !== 32) || redeem!.length !== REDEEM_LEN) throw new Error(`pool tx ${txid}: unexpected push sizes`)
  const out = poolCoin(tx, 0)
  if (!out || !sameBytes(out.lock, prev.lock) || out.category !== prev.category) throw new Error(`pool tx ${txid}: output 0 is not the pool coin`)
  return { txid, S1: out.S, C0: binToHex(C0!), C1: binToHex(C1!), N0: binToHex(N0!), N1: binToHex(N1!), extData: binToHex(extData!) }
}

/** Follows the pool coin from genesis through the address history (confirmed and mempool), ordered by the spend chain and keyed by state, not txid (pool txs are malleable). */
export function fulcrumPoolSource(config: PoolConfig, rpc: PoolRpc): TipSource {
  const txCache = new Map<string, Decoded>()
  let lastTip: PoolTip | null = null
  const coinAt = (txid: string, t: Decoded, vout: number): Coin => {
    const o = t.outputs[vout]
    if (!o) throw new Error(`pool tx ${txid}: missing output ${vout}`)
    return { txid, vout, value: o.valueSatoshis }
  }

  async function tx(txid: string): Promise<Decoded> {
    const hit = txCache.get(txid)
    if (hit) return hit
    const t = decode(await rpc.transaction(txid))
    if (!t) throw new Error(`Could not decode transaction ${txid}`)
    txCache.set(txid, t)
    return t
  }

  async function history(): Promise<PoolEvent[]> {
    if (!config.address || !config.genesis.txid) throw new Error('Shield pool is not configured')
    await ready()
    const lock = poolLockOf(config.address)
    const hist = await rpc.history(scripthashOf(lock))
    const txs = await Promise.all(hist.map(async (h) => ({ txid: h.tx_hash, height: h.height, tx: await tx(h.tx_hash) })))

    const g = txs.find((t) => t.txid === config.genesis.txid)
    if (!g) return []
    const coin = poolCoin(g.tx, config.genesis.vout)
    if (!coin || !sameBytes(coin.lock, lock)) throw new Error('Shield pool genesis does not create the pool coin')
    if (coin.S !== toHex(feBytes(genesisState()))) throw new Error('Shield pool genesis state is not S_genesis')

    const bySpent = new Map<string, (typeof txs)[number]>()
    for (const t of txs) {
      const i = t.tx.inputs[POOL_INPUT]
      if (i) bySpent.set(key({ txid: binToHex(i.outpointTransactionHash), vout: i.outpointIndex }), t)
    }
    const out: PoolEvent[] = []
    let prev: Outpoint = config.genesis
    // genesis layout: pool coin, then the 3 verifier coins (shield/contracts/genesis.mjs)
    let tip: PoolTip = { pool: { ...coinAt(g.txid, g.tx, config.genesis.vout), S: coin.S }, verifiers: [1, 2, 3].map((v) => coinAt(g.txid, g.tx, config.genesis.vout + v)) }
    for (let t = bySpent.get(key(prev)); t; t = bySpent.get(key(prev))) {
      const e = parsePoolTx(t.txid, t.tx, { outpoint: prev, lock, category: coin.category })
      if (!e) break
      out.push({ ...e, height: t.height })
      prev = { txid: t.txid, vout: 0 }
      // pool tx layout: pool coin 0, payout 1 only when payout > 0, then the 3 verifier coins
      const v = decodeExtData(hexToBin(e.extData)).payout > 0n ? 2 : 1
      tip = { pool: { ...coinAt(t.txid, t.tx, 0), S: e.S1 }, verifiers: [v, v + 1, v + 2].map((i) => coinAt(t.txid, t.tx, i)) }
    }
    lastTip = tip
    return out
  }

  return {
    tip: () => lastTip,
    async events(afterS1) {
      const all = await history()
      if (afterS1 === undefined) return all
      const i = all.findIndex((e) => e.S1 === afterS1)
      if (i < 0) throw new PoolCursorLost()
      return all.slice(i + 1)
    },
  }
}

const fulcrum = () => import('../fulcrum')

export const defaultPoolSource = (d: { pool: { address: string; outpoint: Outpoint } }): TipSource =>
  fulcrumPoolSource({ address: d.pool.address, genesis: d.pool.outpoint }, {
    history: async (sh) => (await fulcrum()).scripthashHistory(sh),
    transaction: async (txid) => (await fulcrum()).getTransaction(txid),
  })
