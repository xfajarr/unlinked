import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { xchainTokens } from '../lib/api'
import { SHIELD_LIVE } from '../lib/shield/deployment'
import type { ShieldTxProgress } from '../lib/shield/progress'
import { createInboxScanner, type Received } from '../lib/payments'
import type { ReceiverKeys } from '../lib/stealth'
import { useToast } from '../components/Toast'
import { errMsg, fmtBch, itemAmount } from './format'

export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

// One price fetch per page load, shared by every mount.
let pricePromise: Promise<number | null> | null = null
const loadBchPrice = () =>
  (pricePromise ??= xchainTokens()
    .then((all) => all.find((t) => t.blockchain === 'bch' && t.symbol === 'BCH')?.price ?? null)
    .then((p) => (typeof p === 'number' && p > 0 ? p : null))
    .catch(() => null))

/** undefined while loading, null when unavailable. */
export function useBchPrice() {
  const [price, setPrice] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    loadBchPrice().then((p) => live && setPrice(p))
    return () => {
      live = false
    }
  }, [])
  return price
}

/** Polls the board for this receiver's payments: now, every 5 s, and on window focus. Toasts new arrivals. */
export function useInbox(keys: ReceiverKeys | null, nonce = 0) {
  const toast = useToast()
  // `nonce` bumps start a fresh scanner, so a rescan reads the whole board again
  const scanner = useMemo(() => (keys ? createInboxScanner(keys) : null), [keys, nonce])
  const [items, setItems] = useState<Received[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const seen = useRef<Set<string> | null>(null)

  const poll = useCallback(async () => {
    if (!scanner || busy.current) return
    busy.current = true
    try {
      const next = await scanner.poll()
      const prev = seen.current
      if (prev) for (const r of next) if (!prev.has(r.address)) toast(`New payment +${itemAmount(r)}`)
      seen.current = new Set(next.map((r) => r.address))
      setItems(next)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      busy.current = false
    }
  }, [scanner, toast])

  useEffect(() => {
    seen.current = null
    setItems(null)
    poll()
    const t = setInterval(() => document.hidden || poll(), 5000)
    const onFocus = () => void poll()
    addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      removeEventListener('focus', onFocus)
    }
  }, [poll])

  return { items, error, poll }
}

// libauth, circomlibjs, shield/tx and the prover worker load only when Shield is live
const shieldSession = () => (import.meta.env.SSR ? Promise.reject(new Error('browser only')) : import('../lib/shield/session'))

export type ShieldFeeView = { deposit: number; send: number; withdraw: number; minShield: number }
export type ShieldBalance = { sats: number | null; error: string | null; fees: ShieldFeeView | null; refresh: () => void }

let preloaded = false

/** The private (shielded) balance: synced from the pool now, every 15 s and on window focus. Idle unless Shield is live. */
export function useShield(keys: ReceiverKeys | null): ShieldBalance {
  const [sats, setSats] = useState<number | null>(null)
  const [fees, setFees] = useState<ShieldFeeView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!SHIELD_LIVE) return
    try {
      const s = await shieldSession()
      const v = await s.syncShield()
      setSats(Number(v.sats))
      setFees(v.fees)
      setError(null)
      // fetch and check the 108 MB proving key in the background, so the first private payment doesn't wait for it
      if (!preloaded) {
        preloaded = true
        s.preloadShieldProver().catch(() => {
          preloaded = false
        })
      }
    } catch (e) {
      setError(errMsg(e))
    }
  }, [])

  useEffect(() => {
    if (!SHIELD_LIVE || !keys) return
    setSats(null)
    refresh()
    const t = setInterval(() => document.hidden || refresh(), 15_000)
    addEventListener('focus', refresh)
    return () => {
      clearInterval(t)
      removeEventListener('focus', refresh)
    }
  }, [keys, refresh])

  return { sats, error, fees, refresh }
}

export type Shielding = { address: string; sats: number; progress: ShieldTxProgress | null }

export function useStoredState<T>(key: string, fallback: T, valid: (v: unknown) => v is T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      const v: unknown = raw === null ? fallback : JSON.parse(raw)
      return valid(v) ? v : fallback
    } catch {
      return fallback
    }
  })
  const set = useCallback((v: T) => {
    setValue(v)
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {}
  }, [key])
  return [value, set]
}

type Coin = { id: string; r: Received; u: Received['utxos'][number] }

/** Stealth BCH coins worth making private: one pool transaction each, payments are never merged. */
const shieldable = (items: Received[] | null, minShield: number | null): Coin[] =>
  !items || minShield === null
    ? []
    : items.flatMap((r) => (r.pusd > 0 ? [] : r.utxos.filter((u) => !u.token_data && u.value >= minShield).map((u) => ({ id: `${u.tx_hash}:${u.tx_pos}`, r, u }))))

export type ShieldQueue = {
  active: Shielding | null
  /** BCH coins that can go into the pool now, and their total */
  ready: { count: number; sats: number }
  /** Shields every ready coin, through the same queue auto-shield uses */
  shieldNow: () => void
}

/**
 * Moves stealth BCH coins into the pool, one transaction per coin and one at a time. With `auto` on, every coin worth it
 * goes in; with it off, only the coins `shieldNow` picked. Chain state is the queue: an unspent stealth coin still needs
 * shielding, so a reload picks up where it left off. Coins below `fees.minShield` stay where they are.
 */
export function useShieldQueue(items: Received[] | null, shield: ShieldBalance, auto: boolean, onDone: (r: Received, sats: number, txid: string) => void): ShieldQueue {
  const toast = useToast()
  const [active, setActive] = useState<Shielding | null>(null)
  const [wanted, setWanted] = useState<ReadonlySet<string>>(() => new Set())
  const tried = useRef(new Set<string>())
  const done = useRef(new Set<string>())
  const busy = useRef<string | null>(null)
  const minShield = shield.fees?.minShield ?? null
  const coins = useMemo(() => shieldable(items, minShield), [items, minShield])

  useEffect(() => {
    if (!SHIELD_LIVE || busy.current) return
    const next = coins.find((c) => (auto || wanted.has(c.id)) && !tried.current.has(c.id))
    if (!next) return
    const { id, r, u } = next
    tried.current.add(id)
    busy.current = id
    const sats = u.value
    setActive({ address: r.address, sats, progress: null })
    ;(async () => {
      try {
        const s = await shieldSession()
        const txid = await s.submitShieldTx({ kind: 'deposit', coin: { utxo: u, match: r.match } }, (progress) => setActive({ address: r.address, sats, progress }))
        done.current.add(id)
        toast(`Your ${fmtBch(sats)} BCH payment is now private`)
        shield.refresh()
        onDone(r, sats, txid)
      } catch (e) {
        toast(`Couldn't make a payment private yet: ${errMsg(e)}`, { error: true })
        // try this coin again in a minute (the pool may have moved, or the server lagged)
        setTimeout(() => tried.current.delete(id), 60_000)
      } finally {
        busy.current = null
        setActive(null)
        setWanted((w) => {
          const n = new Set(w)
          n.delete(id)
          return n
        })
      }
    })()
  }, [coins, auto, wanted])

  const open = coins.filter((c) => c.id !== busy.current && !done.current.has(c.id))
  const shieldNow = () => {
    for (const c of open) tried.current.delete(c.id)
    setWanted(new Set(open.map((c) => c.id)))
  }
  return { active, ready: { count: open.length, sats: open.reduce((s, c) => s + c.u.value, 0) }, shieldNow }
}
