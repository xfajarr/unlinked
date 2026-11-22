import { describe, expect, test } from 'bun:test'
import { binToHex, cashAddressToLockingBytecode, createVirtualMachineBCH, decodeTransaction, hexToBin, lockingBytecodeToCashAddress } from '@bitauth/libauth'
import { PUSD_CATEGORY } from './config'
import type { Received } from './payments'
import { buildWithdrawTxs } from './spend'
import { deriveOneTime, keysFromMnemonic, newMnemonic, scanAnnouncement } from './stealth'

const keys = keysFromMnemonic(newMnemonic())
const rnd = () => binToHex(crypto.getRandomValues(new Uint8Array(32)))

function payment(sats: number, pusd?: number): Received {
  const ot = deriveOneTime(binToHex(keys.scanPub), binToHex(keys.spendPub))
  const match = scanAnnouncement(keys, ot.ephemeralPub, ot.viewTag)!
  const utxos = [{ tx_hash: rnd(), tx_pos: 0, value: sats, height: 0, ...(pusd ? { token_data: { category: PUSD_CATEGORY, amount: String(pusd) } } : {}) }]
  return { address: match.address, tokenAddress: match.tokenAddress, match, utxos, sats, pusd: (pusd ?? 0) / 100, pending: true, createdAt: Date.now() }
}

/** Runs every input through the BCH VM with the right source outputs: proves signatures, values and token rules. */
function verify(hex: string, items: Received[]) {
  const tx = decodeTransaction(hexToBin(hex))
  if (typeof tx === 'string') throw new Error(tx)
  const sourceOutputs = items.flatMap((i) =>
    i.utxos.map((u) => {
      const lock = cashAddressToLockingBytecode(i.address)
      if (typeof lock === 'string') throw new Error(lock)
      return { lockingBytecode: lock.bytecode, valueSatoshis: BigInt(u.value), ...(u.token_data ? { token: { amount: BigInt(u.token_data.amount), category: hexToBin(u.token_data.category) } } : {}) }
    }),
  )
  const result = createVirtualMachineBCH().verify({ sourceOutputs, transaction: tx })
  if (result !== true) throw new Error(String(result))
  return tx
}

const DEST = 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a'
const destLock = cashAddressToLockingBytecode(DEST) as { bytecode: Uint8Array }
const DEST_TOKENS = (lockingBytecodeToCashAddress({ bytecode: destLock.bytecode, prefix: 'bitcoincash', tokenSupport: true }) as { address: string }).address

describe('withdraw', () => {
  test('private withdraw: one valid tx per payment', async () => {
    const items = [payment(50_000), payment(120_000)]
    const txs = await buildWithdrawTxs(items, DEST, { private: true }, keys.spendPriv)
    expect(txs.length).toBe(2)
    txs.forEach((hex, i) => {
      const tx = verify(hex, [items[i]!])
      expect(tx.inputs.length).toBe(1)
      expect(Number(tx.outputs[0]!.valueSatoshis)).toBeGreaterThan(items[i]!.sats - 400)
    })
  })

  test('merged withdraw links inputs in one tx (opt-in only)', async () => {
    const items = [payment(50_000), payment(70_000)]
    const [hex] = await buildWithdrawTxs(items, DEST, { private: false }, keys.spendPriv)
    expect(verify(hex!, items).inputs.length).toBe(2)
  })

  test('PUSD needs a token-aware address and is carried over', async () => {
    const item = payment(3_000, 2_500)
    await expect(buildWithdrawTxs([item], DEST, { private: true }, keys.spendPriv)).rejects.toThrow(/token-aware/)
    const [hex] = await buildWithdrawTxs([item], DEST_TOKENS, { private: true }, keys.spendPriv)
    const tx = verify(hex!, [item])
    expect(tx.outputs[0]!.token?.amount).toBe(2_500n)
  })

  test('dust payments are refused', async () => {
    await expect(buildWithdrawTxs([payment(600)], DEST, { private: true }, keys.spendPriv)).rejects.toThrow(/too small/)
  })
})
