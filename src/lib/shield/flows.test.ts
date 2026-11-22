// The three client flows end to end: real Groth16 proofs, the shield/tx builder and the BCH 2026 VM (consensus + standard).
// BCH 2026 VM (consensus + standard). Opt-in, about 2 minutes (three single-threaded proofs):
//   SHIELD_E2E=1 bun test src/lib/shield/flows.test.ts        (zkey + wasm from $SHIELD_BUILD)
import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as S from '../../../shield/lib/src/index.ts'
import { deriveOneTime, keysFromMnemonic, newMnemonic, scanAnnouncement } from '../stealth'
import type { Deployment } from './deployment'
import { deriveShieldKeys, shieldPkHex } from './keys'
import { fulcrumPoolSource } from './source'
import { buildShieldTx, shieldFees, type Prover } from './tx'
import { NoteWallet } from './wallet'

const BUILD = process.env.SHIELD_BUILD ?? new URL('../../../shield/circuits/build', import.meta.url).pathname
const ZKEY = `${BUILD}/transact_final.zkey`, WASM = `${BUILD}/transact_js/transact.wasm`
const RUN = !!process.env.SHIELD_E2E && existsSync(ZKEY)
const SHIELD = new URL('../../../shield/', import.meta.url).pathname

describe.skipIf(!RUN)('Shield flows: real proofs, shield/tx, BCH 2026 VM', () => {
  test('deposit a stealth coin, send to another handle, withdraw to an address', async () => {
    const h = await import(SHIELD + 'contracts/test/harness.mjs')
    const P = await import(SHIELD + 'contracts/pool.mjs')
    const L = P.libauth
    const snarkjs = await import('snarkjs')
    const vk = JSON.parse(await Bun.file(SHIELD + 'circuits/build/verification_key.json').text())

    const category = h.sha256(Buffer.from('unlinked app flows test genesis')).toString('hex')
    const D = await h.deployment({ vkPath: SHIELD + 'circuits/build/verification_key.json', buildPath: `${tmpdir()}/unlinked-flows.build.json`, genesisTxid: category, prover: null })
    await S.ready()
    const sGenesis = S.toHex(S.feBytes(S.genesisState()))
    const G = h.genesisTx({ funding: { txid: Buffer.from(category, 'hex'), vout: 0, value: 3_000_000n, lock: h.locks.alice }, sGenesis: Buffer.from(sGenesis, 'hex'), verifierLock: D.verifierLock, poolValue: 1000n, changeLock: h.locks.alice, fee: 1000n })
    h.signP2pkh(G.transaction, G.sourceOutputs, 0, h.keys.alice)
    const genesisTxid = L.hashTransaction(L.encodeTransaction(G.transaction))
    const address = L.lockingBytecodeToCashAddress({ bytecode: Uint8Array.from(D.pool.lock), prefix: 'bchtest', tokenSupport: true }).address
    const deployment: Deployment = {
      network: 'test', category, genesisTxid,
      pool: { address, lockHex: D.pool.lock.toString('hex'), redeemHex: D.pool.redeem.toString('hex'), outpoint: { txid: genesisTxid, vout: 0 }, initialValue: 1000, sGenesis },
      verifier: { lockHex: D.verifierLock.toString('hex'), redeemHex: D.prog.json.redeemHex, codePiecesHex: D.prog.json.codePiecesHex, outpoints: [1, 2, 3].map((vout) => ({ txid: genesisTxid, vout, value: 1000 })), vk },
      zkeySha256: '',
    }

    const chain = new Map<string, string>()
    const outputs = new Map<string, unknown>()
    const add = (hex: string) => {
      const tx = L.decodeTransaction(L.hexToBin(hex))
      const id = L.hashTransaction(L.hexToBin(hex))
      chain.set(id, hex)
      tx.outputs.forEach((o: unknown, i: number) => outputs.set(`${id}:${i}`, o))
      return tx
    }
    add(L.binToHex(L.encodeTransaction(G.transaction)))
    const sh = (await import('./source')).scripthashOf(Uint8Array.from(D.pool.lock))
    const source = fulcrumPoolSource({ address, genesis: { txid: genesisTxid, vout: 0 } }, {
      history: async (s) => { expect(s).toBe(sh); return [...chain.keys()].map((tx_hash) => ({ tx_hash, height: 0 })) },
      transaction: async (txid) => chain.get(txid)!,
    })
    const vmAccepts = (hex: string) => {
      const transaction = L.decodeTransaction(L.hexToBin(hex))
      const sourceOutputs = transaction.inputs.map((i: { outpointTransactionHash: Uint8Array; outpointIndex: number }) => outputs.get(`${L.binToHex(i.outpointTransactionHash)}:${i.outpointIndex}`))
      const v = P.verifyTx({ transaction, sourceOutputs })
      expect(v.verdict).toEqual({ consensus: true, standard: true })
      return transaction
    }

    const prove: Prover = async (input) => {
      const wtns = { type: 'mem' }
      await snarkjs.wtns.calculate(input, WASM, wtns)
      // bun: snarkjs' worker threads crash, single-threaded works
      return (snarkjs.groth16.prove as (...a: unknown[]) => Promise<{ proof: unknown; publicSignals: string[] }>)(ZKEY, wtns, undefined, { singleThread: true })
    }
    const user = async () => {
      const k = keysFromMnemonic(newMnemonic())
      const keys = { ...k, ...(await deriveShieldKeys(k.spendPriv)) }
      return { keys, wallet: await NoteWallet.create(keys) }
    }
    const alice = await user(), bob = await user()
    const fees = await shieldFees(deployment)
    const ctx = async (u: typeof alice) => {
      await u.wallet.sync(source)
      return { wallet: u.wallet, tip: source.tip()!, keys: u.keys, deployment, prove }
    }

    const ot = deriveOneTime(L.binToHex(alice.keys.scanPub), L.binToHex(alice.keys.spendPub))
    const match = scanAnnouncement(alice.keys, ot.ephemeralPub, ot.viewTag)!
    const coin = { tx_hash: 'ab'.repeat(32), tx_pos: 0, value: 300_000, height: 1 }
    outputs.set(`${coin.tx_hash}:0`, { lockingBytecode: L.cashAddressToLockingBytecode(match.address).bytecode, valueSatoshis: 300_000n })
    const t1 = await buildShieldTx({ kind: 'deposit', coin: { utxo: coin, match } }, await ctx(alice))
    const tx1 = vmAccepts(t1.hex)
    add(t1.hex)
    expect(t1.fee).toBe(fees.deposit)
    expect(tx1.outputs.length).toBe(4) // pool + 3 verifiers, no change
    await alice.wallet.sync(source)
    expect(alice.wallet.balance).toBe(300_000n - fees.deposit)

    const toBob = { handle: 'bob', scanPub: L.binToHex(bob.keys.scanPub), shieldPk: shieldPkHex(bob.keys.shieldPk) }
    const t2 = await buildShieldTx({ kind: 'send', to: toBob, sats: 100_000n }, await ctx(alice))
    vmAccepts(t2.hex)
    add(t2.hex)
    expect(t2.fee).toBe(fees.send)
    await Promise.all([alice.wallet.sync(source), bob.wallet.sync(source)])
    expect(bob.wallet.balance).toBe(100_000n)
    expect(alice.wallet.balance).toBe(300_000n - fees.deposit - 100_000n - fees.send)

    const dest = 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a'
    const t3 = await buildShieldTx({ kind: 'withdraw', address: dest, sats: 30_000n }, await ctx(bob))
    const tx3 = vmAccepts(t3.hex)
    add(t3.hex)
    expect(t3.fee).toBe(fees.withdraw(25))
    expect(L.binToHex(tx3.outputs[1].lockingBytecode)).toBe(L.binToHex(L.cashAddressToLockingBytecode(dest).bytecode))
    expect(tx3.outputs[1].valueSatoshis).toBe(30_000n)
    await bob.wallet.sync(source)
    expect(bob.wallet.balance).toBe(100_000n - 30_000n - fees.withdraw(25))

    // every pool tx pays at least 1 sat/B, and the source's tip is the withdrawal's coins
    for (const t of [t1, t2, t3]) expect(Number(t.fee) / t.size).toBeGreaterThanOrEqual(1)
    expect(source.tip()!.pool.txid).toBe(t3.txid)
    expect(source.tip()!.verifiers.map((v) => v.vout)).toEqual([2, 3, 4])
    console.log('flows:', [t1, t2, t3].map((t) => `${t.size} B fee ${t.fee}`).join(', '))
  }, 900_000)
})
