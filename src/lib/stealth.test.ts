import { describe, expect, test } from 'bun:test'
import { binToHex, secp256k1 } from '@bitauth/libauth'
import { fingerprint } from './fingerprint'
import { deriveOneTime, keysFromMnemonic, newMnemonic, scanAnnouncement, spendKey } from './stealth'

const hex = binToHex

describe('stealth', () => {
  const keys = keysFromMnemonic(newMnemonic())
  const other = keysFromMnemonic(newMnemonic())

  test('payer and receiver derive the same address, and the spend key matches', () => {
    for (let i = 0; i < 200; i++) {
      const ot = deriveOneTime(hex(keys.scanPub), hex(keys.spendPub))
      const m = scanAnnouncement(keys, ot.ephemeralPub, ot.viewTag)
      expect(m).not.toBeNull()
      expect(m!.address).toBe(ot.address)
      expect(m!.tokenAddress).toBe(ot.tokenAddress)
      const p = spendKey(keys.spendPriv, m!)
      expect(hex(secp256k1.derivePublicKeyCompressed(p) as Uint8Array)).toBe(ot.publicKey)
    }
  })

  test('every payment gets a different address', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(deriveOneTime(hex(keys.scanPub), hex(keys.spendPub)).address)
    expect(seen.size).toBe(200)
  })

  test("someone else's keys never match", () => {
    let hits = 0
    for (let i = 0; i < 500; i++) {
      const ot = deriveOneTime(hex(keys.scanPub), hex(keys.spendPub))
      const m = scanAnnouncement(other, ot.ephemeralPub, ot.viewTag)
      if (m && m.address === ot.address) throw new Error('foreign key matched')
      if (m) hits++ // view-tag collisions are expected (~1/256) but must not produce the same address
    }
    expect(hits).toBeLessThan(15)
  })

  test('addresses are cashaddr, token-aware variant starts with z', () => {
    const ot = deriveOneTime(hex(keys.scanPub), hex(keys.spendPub))
    expect(ot.address.startsWith('bitcoincash:q')).toBe(true)
    expect(ot.tokenAddress.startsWith('bitcoincash:z')).toBe(true)
  })

  test('same mnemonic, same keys; fingerprint is stable', async () => {
    const m = newMnemonic()
    expect(hex(keysFromMnemonic(m).scanPub)).toBe(hex(keysFromMnemonic(m).scanPub))
    expect(await fingerprint(hex(keys.scanPub), hex(keys.spendPub))).toMatch(/^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$/)
  })
})
