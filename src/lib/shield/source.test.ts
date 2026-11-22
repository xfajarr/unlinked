import { describe, expect, test } from 'bun:test'
import chain from '../../../shield/fixtures/chain.json'
import { keysFromMnemonic } from '../stealth'
import pool from './fixtures/pool-txs.json'
import { deriveShieldKeys } from './keys'
import { fulcrumPoolSource, poolLockOf, scripthashOf, type PoolRpc } from './source'
import { NoteWallet, PoolCursorLost } from './wallet'

// Real ShieldPool transactions (VM-verified by the contract harness, scripts/shield-pool-fixture.mjs)
const config = { address: pool.pool.tokenAddress, genesis: pool.pool.genesis }
const byId = new Map(pool.txs.map((t) => [t.txid, t.hex]))
const SH = scripthashOf(poolLockOf(config.address))

function rpc(txids: string[]): PoolRpc & { calls: number } {
  const r = {
    calls: 0,
    async history(sh: string) {
      if (sh !== SH) throw new Error('wrong scripthash')
      return txids.map((tx_hash, i) => ({ tx_hash, height: 100 + i }))
    },
    async transaction(txid: string) {
      r.calls++
      const hex = byId.get(txid)
      if (!hex) throw new Error('unknown tx')
      return hex
    },
  }
  return r
}
const ids = pool.txs.map((t) => t.txid)

describe('Fulcrum pool source', () => {
  test('the pool address is the fixture lock', () => {
    expect(Buffer.from(poolLockOf(config.address)).toString('hex')).toBe(pool.pool.lockingBytecode)
  })

  test('parses every pool transaction into the fixture pieces, in spend order', async () => {
    // history order is not trusted: shuffled, the chain is still followed from genesis
    const src = fulcrumPoolSource(config, rpc([ids[2]!, ids[0]!, ids[3]!, ids[1]!]))
    const evs = await src.events()
    expect(evs.map((e) => e.txid)).toEqual(ids.slice(1))
    evs.forEach((e, i) => {
      const p = chain.steps[i]!.pieces
      expect(e).toMatchObject({ S1: p.S1, C0: p.C0, C1: p.C1, N0: p.N0, N1: p.N1, extData: p.extData })
    })
  })

  test('cursor by state: only newer events, lost cursor throws', async () => {
    const src = fulcrumPoolSource(config, rpc(ids))
    expect((await src.events(chain.steps[0]!.pieces.S1)).map((e) => e.S1)).toEqual([chain.steps[1]!.pieces.S1, chain.steps[2]!.pieces.S1])
    expect(await src.events(chain.steps[2]!.pieces.S1)).toEqual([])
    const short = fulcrumPoolSource(config, rpc(ids.slice(0, 2)))
    await expect(short.events(chain.steps[2]!.pieces.S1)).rejects.toBeInstanceOf(PoolCursorLost)
  })

  test('nothing before genesis is seen, and the chain stops at a gap', async () => {
    expect(await fulcrumPoolSource(config, rpc([])).events()).toEqual([])
    // transfer missing: withdraw spends a pool coin we never saw, so only the deposit follows
    expect((await fulcrumPoolSource(config, rpc([ids[0]!, ids[1]!, ids[3]!])).events()).length).toBe(1)
  })

  test('fetches each transaction once', async () => {
    const r = rpc(ids)
    const src = fulcrumPoolSource(config, r)
    await src.events()
    await src.events()
    expect(r.calls).toBe(4)
  })

  test('rejects a genesis that is not S_genesis', async () => {
    const src = fulcrumPoolSource({ ...config, genesis: { txid: ids[1]!, vout: 0 } }, rpc(ids))
    await expect(src.events()).rejects.toThrow('genesis state')
  })

  test('tip: the coins the next pool transaction spends', async () => {
    const g = fulcrumPoolSource(config, rpc([ids[0]!]))
    await g.events()
    expect(g.tip()!.pool).toMatchObject({ txid: ids[0], vout: 0, value: 1000n, S: chain.genesis.S })
    expect(g.tip()!.verifiers.map((v) => [v.txid, v.vout])).toEqual([1, 2, 3].map((v) => [ids[0], v]))
    const src = fulcrumPoolSource(config, rpc(ids))
    await src.events()
    // the withdraw pays out, so its verifier coins are outputs 2..4
    expect(src.tip()!.pool).toMatchObject({ txid: ids[3], vout: 0, value: BigInt(chain.steps[2]!.newPoolValue), S: chain.steps[2]!.pieces.S1 })
    expect(src.tip()!.verifiers.map((v) => v.vout)).toEqual([2, 3, 4])
  })

  test('raw transactions to balances: both fixture keys', async () => {
    const src = fulcrumPoolSource(config, rpc(ids))
    const got: Record<string, bigint> = {}
    for (const name of ['alice', 'bob'] as const) {
      const k = keysFromMnemonic(chain.parties[name].mnemonic)
      const sk = await deriveShieldKeys(k.spendPriv)
      const w = await NoteWallet.create({ scanPriv: k.scanPriv, ...sk })
      await w.sync(src)
      got[name] = w.balance
    }
    expect(got).toEqual({ alice: 348_000n, bob: 247_000n })
  })
})
