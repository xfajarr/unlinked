// Restore and reveal for the vault in src/lib/vault.ts, which has no API for either. Same storage key and
// format (PBKDF2-SHA256 600k, AES-256-GCM); restore finishes with vault.unlock(), so a format drift fails loudly.
import { getProfile } from '../lib/api'
import { toHex } from '../lib/hex'
import { unlock } from '../lib/vault'

const KEY = 'unlinked.vault.v1'
const enc = new TextEncoder(), dec = new TextDecoder()
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function aesKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function restoreVault(handle: string, mnemonic: string, password: string) {
  const { keysFromMnemonic } = await import('../lib/stealth')
  const keys = keysFromMnemonic(mnemonic)
  const scanPub = toHex(keys.scanPub), spendPub = toHex(keys.spendPub)
  const profile = await getProfile({ data: { handle } })
  if (!profile) throw new Error(`No one has the name @${handle}.`)
  if (profile.scanPub !== scanPub || profile.spendPub !== spendPub) throw new Error(`These words don't belong to @${handle}.`)
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(password, salt), enc.encode(mnemonic))
  localStorage.setItem(KEY, JSON.stringify({ handle, salt: b64(salt), iv: b64(iv), data: b64(data), backedUp: true, scanPub, spendPub }))
  await unlock(password)
}

/** The 12 words, only with the right password. Doesn't touch the unlocked session. */
export async function revealWords(password: string): Promise<string> {
  const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { salt: string; iv: string; data: string } | null
  if (!s) throw new Error('No account on this device')
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, await aesKey(password, unb64(s.salt)), unb64(s.data))
    return dec.decode(plain)
  } catch {
    throw new Error('Wrong password')
  }
}
