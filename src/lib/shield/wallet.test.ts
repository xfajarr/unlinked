import { describe, expect, test } from 'bun:test'
import chain from '../../../shield/fixtures/chain.json'
import * as S from '../../../shield/lib/src/index.ts'
import { keysFromMnemonic } from '../stealth'
import { deriveShieldKeys, shieldPkHex } from './keys'
import { NoteWallet, PoolCursorLost, memorySource, noteFor, type PoolEvent } from './wallet'

const events: PoolEvent[] = chain.steps.map((s) => ({
  txid: `fixture/${s.name}`,
  S1: s.pieces.S1,
  C0: s.pieces.C0,
  C1: s.pieces.C1,
  N0: s.pieces.N0,
  N1: s.pieces.N1,
  extData: s.pieces.extData,
}))

async function party(name: 'alice' | 'bob') {
  const k = keysFromMnemonic(chain.parties[name].mnemonic)
  const sk = await deriveShieldKeys(k.spendPriv)
  return { ...k, ...sk }
}
const walletOf = async (p: Awaited<ReturnType<typeof party>>) => NoteWallet.create({ scanPriv: p.scanPriv, shieldSk: p.shieldSk, shieldPk: p.shieldPk })
const amounts = (w: NoteWallet) => w.notes.map((n) => [n.leafIndex, n.amount])

describe('shield keys', () => {
  test('fixture keys are reproducible from the 12 words', async () => {
    for (const name of ['alice', 'bob'] as const) {
      const p = await party(name)
      expect(shieldPkHex(p.shieldPk)).toBe(chain.parties[name].shieldPk)
      expect(Buffer.from(p.scanPub).toString('hex')).toBe(chain.parties[name].scanPub)
    }
  })
})

describe('note wallet on the fixture chain', () => {
  test('each step: trees match the pool state, notes and balances match the fixture', async () => {
    const alice = await walletOf(await party('alice'))
    const bob = await walletOf(await party('bob'))
    const expected = [
      { alice: [[1, 300_000n], [0, 700_000n]], bob: [] },
      { alice: [[3, 348_000n]], bob: [[2, 650_000n]] },
      // bob's 0-sat note at leaf 5 is not counted
      { alice: [[3, 348_000n]], bob: [[4, 247_000n]] },
    ]
    for (const [i, e] of events.entries()) {
      await alice.apply(e)
      await bob.apply(e)
      const post = chain.steps[i]!.post
      for (const w of [alice, bob]) {
        expect(S.toHex(S.feBytes(w.state.S))).toBe(post.S1)
        expect(S.toHex(S.feBytes(w.state.Rc))).toBe(post.Rc)
        expect(S.toHex(S.feBytes(w.state.Rn))).toBe(post.Rn)
        expect(w.state.n).toBe(post.n)
      }
      expect(amounts(alice)).toEqual(expected[i]!.alice as [number, bigint][])
      expect(amounts(bob)).toEqual(expected[i]!.bob as [number, bigint][])
    }
    expect(alice.balance).toBe(348_000n)
    expect(bob.balance).toBe(247_000n)
    expect(alice.allNotes.filter((n) => n.spent).map((n) => n.leafIndex)).toEqual([0, 1])
    expect(bob.allNotes.filter((n) => n.spent).map((n) => n.leafIndex)).toEqual([2])
    expect(alice.allNotes.find((n) => n.leafIndex === 0)!.nullifier).toBe(BigInt('0x' + chain.steps[1]!.pieces.N0))
  })

  test('incremental sync with a cursor gives the same result, and a lost cursor resyncs', async () => {
    const bob = await walletOf(await party('bob'))
    expect(await bob.sync(memorySource(events.slice(0, 1)))).toBe(1)
    expect(bob.cursor).toBe(events[0]!.S1)
    expect(await bob.sync(memorySource(events))).toBe(2)
    expect(bob.balance).toBe(247_000n)
    expect(await bob.sync(memorySource(events))).toBe(0)

    // a source that no longer has our cursor (reorg): full replay from genesis
    const forked = memorySource(events.slice(0, 2))
    await expect(forked.events(events[2]!.S1)).rejects.toBeInstanceOf(PoolCursorLost)
    expect(await bob.sync(forked)).toBe(2)
    expect(bob.balance).toBe(650_000n)
  })

  test('a stranger keeps the trees in sync but finds nothing', async () => {
    const k = keysFromMnemonic('zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong')
    const sk = await deriveShieldKeys(k.spendPriv)
    const w = await NoteWallet.create({ scanPriv: k.scanPriv, shieldSk: sk.shieldSk, shieldPk: sk.shieldPk })
    await w.sync(memorySource(events))
    expect(w.allNotes).toEqual([])
    expect(S.toHex(S.feBytes(w.state.S))).toBe(chain.steps[2]!.post.S1)
  })

  test('rejects an event whose state does not follow, then starts over', async () => {
    const w = await walletOf(await party('alice'))
    await w.apply(events[0]!)
    const bad = { ...events[1]!, S1: events[2]!.S1 }
    await expect(w.apply(bad)).rejects.toThrow('state does not match')
    expect(w.cursor).toBeUndefined()
    expect(w.state.n).toBe(0)
  })

  test('rejects a replayed nullifier without touching the trees', async () => {
    const w = await walletOf(await party('alice'))
    await w.sync(memorySource(events.slice(0, 2)))
    const before = w.state
    await expect(w.apply({ ...events[1]!, txid: 'replay' })).rejects.toThrow('nullifier already spent')
    expect(w.state).toEqual(before)
  })

  test('noteFor encrypts an output that only the recipient finds', async () => {
    const a = await party('alice'), b = await party('bob')
    const alice = await walletOf(a), bob = await walletOf(b)
    await alice.sync(memorySource(events))
    await bob.sync(memorySource(events))
    const out0 = await noteFor({ scanPub: b.scanPub, shieldPk: b.shieldPk }, 12_345n)
    const out1 = await noteFor({ scanPub: a.scanPub, shieldPk: a.shieldPk }, 0n)
    const C0 = S.commitment(out0.note.amount, out0.note.pk, out0.note.blinding)
    const C1 = S.commitment(out1.note.amount, out1.note.pk, out1.note.blinding)
    const t = alice.tree.clone()
    t.appendPair(C0, C1)
    const fe = (x: bigint) => S.toHex(S.feBytes(x))
    const ext = S.encodeExtData({ recipientLock: new Uint8Array(), payout: 0n, fee: 0n, ct0: out0.ct, ct1: out1.ct })
    const e: PoolEvent = { txid: 'new', S1: fe(S.stateHash(t.root, t.n, alice.nulls.root)), C0: fe(C0), C1: fe(C1), N0: fe(0n), N1: fe(0n), extData: S.toHex(ext) }
    await alice.apply(e)
    await bob.apply(e)
    expect(bob.notes[0]).toMatchObject({ amount: 12_345n, leafIndex: 6, txid: 'new' })
    expect(bob.balance).toBe(247_000n + 12_345n)
    expect(alice.balance).toBe(348_000n)
  })
})
