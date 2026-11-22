// Receiver keys live only on this device (spec 6): the mnemonic is encrypted with a password-derived key
// (PBKDF2-SHA256, 600k iterations, AES-256-GCM) and kept in localStorage. Unlocked keys stay in memory, and
// session.ts can carry them across a reload until the auto-lock window runs out.
import { useSyncExternalStore } from 'react'
import { toHex as binToHex } from './hex'
import { clearActivity, clearSession, getAutoLock, loadSession, saveAutoLock, saveSession, stillFresh, touch, watchIdle } from './session'
import type { ReceiverKeys } from './stealth'

// libauth and circomlibjs (WebAssembly) load only in the browser, on first use
const stealth = () => import('./stealth')
// the SSR guard keeps circomlibjs out of the Worker bundle (it only ever runs in the browser)
const shieldKeys = () => (import.meta.env.SSR ? Promise.reject(new Error('browser only')) : import('./shield/keys'))

/** Best effort: a claim without a Shield key still works, that handle just can't be paid from a private balance. */
async function shieldPkFor(spendPriv: Uint8Array): Promise<string | undefined> {
  try {
    const s = await shieldKeys()
    return s.shieldPkHex((await s.deriveShieldKeys(spendPriv)).shieldPk)
  } catch {
    return undefined
  }
}

const KEY = 'unlinked.vault.v1'
/** kind: older vaults have no kind and were locked with a free-form password */
type Stored = { handle: string; salt: string; iv: string; data: string; backedUp: boolean; scanPub: string; spendPub: string; kind?: 'pin' | 'password' }
export type VaultKind = 'pin' | 'password'
export const vaultKind = (s: { kind?: VaultKind } | null | undefined): VaultKind => (s?.kind === 'pin' ? 'pin' : 'password')
export const wrongSecret = (kind: VaultKind) => (kind === 'pin' ? 'Wrong PIN' : 'Wrong password')

const enc = new TextEncoder(), dec = new TextDecoder()
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function aesKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function read(): Stored | null {
  try {
    const s = localStorage.getItem(KEY)
    return s ? (JSON.parse(s) as Stored) : null
  } catch {
    return null
  }
}
function write(s: Stored | null) {
  try {
    s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: the session still works until reload */
  }
  emit()
}

/** restoring: a reload is decrypting the saved session, so the Unlock screen shouldn't flash */
type State = { stored: Stored | null; keys: ReceiverKeys | null; mnemonic: string | null; restoring: boolean }
let state: State = { stored: null, keys: null, mnemonic: null, restoring: false }
const subs = new Set<() => void>()
function emit() {
  state = { ...state, stored: read() }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => (subs.add(f), () => subs.delete(f))
let hydrated = false
const getSnapshot = () => {
  if (!hydrated && typeof window !== 'undefined') {
    hydrated = true
    state = { ...state, stored: read() }
  }
  return state
}
const serverSnapshot: State = { stored: null, keys: null, mnemonic: null, restoring: false }
export const useVault = () => useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot)

let stopIdle: (() => void) | null = null
function startSession(mnemonic: string) {
  stopIdle?.()
  stopIdle = null
  if (typeof window === 'undefined') return
  if (getAutoLock() === 0) return void clearSession()
  touch()
  void saveSession(mnemonic)
  stopIdle = watchIdle(lock)
}
function endSession() {
  stopIdle?.()
  stopIdle = null
  void clearSession()
}

async function restore() {
  try {
    const mnemonic = await loadSession()
    const s = read()
    if (!mnemonic || !s || state.keys) return
    const { keysFromMnemonic } = await stealth()
    const keys = keysFromMnemonic(mnemonic)
    if (binToHex(keys.scanPub) !== s.scanPub || binToHex(keys.spendPub) !== s.spendPub) return void clearSession()
    state = { ...state, keys, mnemonic }
    startSession(mnemonic)
  } catch {
    void clearSession()
  } finally {
    state = { ...state, restoring: false }
    emit()
  }
}

if (typeof window !== 'undefined') {
  if (read() && stillFresh()) {
    state = { ...state, restoring: true }
    void restore()
  } else void clearSession()
}

/** Minutes of inactivity before locking; 0 locks on every reload. */
export function setAutoLock(min: number) {
  saveAutoLock(min)
  if (state.mnemonic) startSession(state.mnemonic)
  else void clearSession()
}

export async function createVault(handle: string, pin: string) {
  const { newMnemonic, keysFromMnemonic } = await stealth()
  const mnemonic = newMnemonic()
  const keys = keysFromMnemonic(mnemonic)
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  const shieldPkP = shieldPkFor(keys.spendPriv) // overlaps with PBKDF2
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(pin, salt), enc.encode(mnemonic))
  const shieldPk = await shieldPkP
  state = { ...state, keys, mnemonic }
  startSession(mnemonic)
  write({ handle, salt: b64(salt), iv: b64(iv), data: b64(data), backedUp: false, scanPub: binToHex(keys.scanPub), spendPub: binToHex(keys.spendPub), kind: 'pin' })
  return { mnemonic, scanPub: binToHex(keys.scanPub), spendPub: binToHex(keys.spendPub), authPub: binToHex(keys.authPub), shieldPk }
}

export async function unlock(password: string): Promise<void> {
  const s = read()
  if (!s) throw new Error('No account on this device')
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, await aesKey(password, unb64(s.salt)), unb64(s.data))
    const mnemonic = dec.decode(plain)
    const { keysFromMnemonic } = await stealth()
    state = { ...state, keys: keysFromMnemonic(mnemonic), mnemonic }
    startSession(mnemonic)
    emit()
  } catch {
    throw new Error(wrongSecret(vaultKind(s)))
  }
}

export function lock() {
  endSession()
  state = { ...state, keys: null, mnemonic: null }
  emit()
}
export function markBackedUp() {
  const s = read()
  if (s) write({ ...s, backedUp: true })
}
export function forget() {
  endSession()
  clearActivity()
  state = { stored: null, keys: null, mnemonic: null, restoring: false }
  write(null)
}
export const currentKeys = () => state.keys
