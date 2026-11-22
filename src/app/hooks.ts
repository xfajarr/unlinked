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

export type ShieldFeeView = { send: number; withdraw: number; minShield: number }
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

/**
 * Shield by default: every stealth BCH coin worth it goes into the pool, one transaction per coin (payments are never
 * merged) and one at a time. Chain state is the queue: an unspent stealth coin still needs shielding, so a reload
 * picks up where it left off. Coins below `fees.minShield` stay where they are.
 */
export function useAutoShield(items: Received[] | null, shield: ShieldBalance, onDone: (r: Received, sats: number, txid: string) => void): Shielding | null {
  const toast = useToast()
  const [active, setActive] = useState<Shielding | null>(null)
  const tried = useRef(new Set<string>())
  const busy = useRef(false)
  const minShield = shield.fees?.minShield ?? null

  useEffect(() => {
    if (!SHIELD_LIVE || !items || minShield === null || busy.current) return
    const next = items
      .flatMap((r) => (r.pusd > 0 ? [] : r.utxos.filter((u) => !u.token_data && u.value >= minShield).map((u) => ({ r, u }))))
      .find(({ u }) => !tried.current.has(`${u.tx_hash}:${u.tx_pos}`))
    if (!next) return
    const id = `${next.u.tx_hash}:${next.u.tx_pos}`
    tried.current.add(id)
    busy.current = true
    const sats = next.u.value
    setActive({ address: next.r.address, sats, progress: null })
    ;(async () => {
      try {
        const s = await shieldSession()
        const txid = await s.submitShieldTx({ kind: 'deposit', coin: { utxo: next.u, match: next.r.match } }, (progress) => setActive({ address: next.r.address, sats, progress }))
        toast(`Your ${fmtBch(sats)} BCH payment is now private`)
        shield.refresh()
        onDone(next.r, sats, txid)
      } catch (e) {
        toast(`Couldn't make a payment private yet: ${errMsg(e)}`, { error: true })
        // try this coin again in a minute (the pool may have moved, or the server lagged)
        setTimeout(() => tried.current.delete(id), 60_000)
      } finally {
        busy.current = false
        setActive(null)
      }
    })()
  }, [items, minShield])

  return active
}
