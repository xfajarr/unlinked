// The board scan only returns unspent payments, so a payment vanishes once it is spent or made private.
// This device keeps its own log so Activity still shows it. Nothing here leaves the browser.
import { useSyncExternalStore } from 'react'
import type { Received } from '../lib/payments'

export type InEntry = { kind: 'in'; id: string; at: number; sats: number; pusd: number; txid: string }
export type OutEntry = { kind: 'send' | 'withdraw' | 'shield'; id: string; at: number; sats: number; to: string; txids: string[]; private: boolean }
export type Entry = InEntry | OutEntry

const keyFor = (handle: string) => `unlinked.history.v1:${handle}`
const cache = new Map<string, Entry[]>()
const subs = new Set<() => void>()
const EMPTY: Entry[] = []

function read(handle: string): Entry[] {
  let v = cache.get(handle)
  if (v) return v
  try {
    v = JSON.parse(localStorage.getItem(keyFor(handle)) ?? '[]') as Entry[]
  } catch {
    v = []
  }
  cache.set(handle, v)
  return v
}

function write(handle: string, next: Entry[]) {
  next = [...next].sort((a, b) => b.at - a.at)
  cache.set(handle, next)
  try {
    localStorage.setItem(keyFor(handle), JSON.stringify(next))
  } catch {
    /* storage blocked: the log lasts until reload */
  }
  subs.forEach((f) => f())
}

export function logIncoming(handle: string, items: Received[]) {
  const all = read(handle)
  const byId = new Map(all.filter((e) => e.kind === 'in').map((e) => [e.id, e as InEntry]))
  let changed = false
  for (const r of items) {
    const sats = r.pusd > 0 ? 0 : r.sats
    const prev = byId.get(r.address)
    if (prev && prev.sats >= sats && prev.pusd >= r.pusd) continue
    byId.set(r.address, { kind: 'in', id: r.address, at: r.createdAt, sats: Math.max(sats, prev?.sats ?? 0), pusd: Math.max(r.pusd, prev?.pusd ?? 0), txid: prev?.txid ?? r.utxos[0]?.tx_hash ?? '' })
    changed = true
  }
  if (changed) write(handle, [...all.filter((e) => e.kind !== 'in'), ...byId.values()])
}

export function logOutgoing(handle: string, e: Omit<OutEntry, 'id' | 'at'>) {
  write(handle, [{ ...e, id: e.txids[0] ?? String(Date.now()), at: Date.now() }, ...read(handle)])
}

export function clearHistory(handle: string) {
  cache.delete(handle)
  try {
    localStorage.removeItem(keyFor(handle))
  } catch {}
  subs.forEach((f) => f())
}

const subscribe = (f: () => void) => (subs.add(f), () => subs.delete(f))
export const useHistory = (handle: string | null) =>
  useSyncExternalStore(subscribe, () => (handle ? read(handle) : EMPTY))
