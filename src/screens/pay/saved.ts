// The payer's flow survives a refresh: kept per handle in localStorage. Only public data goes in.
import type { OneTime } from '../../lib/stealth'
import type { Currency } from './format'
import type { PaidInfo } from './PaidScreen'
import type { Deposit } from './XDeposit'

export type Step = '' | 'qr' | 'wallet' | 'chain' | 'deposit' | 'paid'
export const STEPS: readonly Step[] = ['', 'qr', 'wallet', 'chain', 'deposit', 'paid']

export type Saved = {
  savedAt: number
  step: Step
  currency: Currency
  amount: string
  note: string
  qr?: { amount: number; ot: OneTime; shownAt?: number }
  deposit?: Deposit
  paid?: PaidInfo
}

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const keyFor = (handle: string) => `unlinked:pay:${handle}`

// explicit fields, so nothing secret can ride along if OneTime ever grows
const publicOt = (o: OneTime): OneTime => ({ address: o.address, tokenAddress: o.tokenAddress, ephemeralPub: o.ephemeralPub, viewTag: o.viewTag, publicKey: o.publicKey })
const isOt = (o: unknown): o is OneTime => {
  const x = o as OneTime | null
  return typeof x?.address === 'string' && typeof x.tokenAddress === 'string' && typeof x.ephemeralPub === 'string'
}

function expired(s: Saved, now: number) {
  if (!(now - s.savedAt < DAY)) return true
  const deadline = s.deposit ? Date.parse(s.deposit.quote.deadline) : NaN
  return !Number.isNaN(deadline) && now > deadline + HOUR
}

export function loadSaved(handle: string): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(keyFor(handle)) ?? 'null') as Saved | null
    if (!s || typeof s.savedAt !== 'number' || (s.currency !== 'BCH' && s.currency !== 'PUSD')) return null
    if (expired(s, Date.now())) {
      clearSaved(handle)
      return null
    }
    const qr = s.qr && isOt(s.qr.ot) ? s.qr : undefined
    const deposit = s.deposit && isOt(s.deposit.ot) && typeof s.deposit.quote?.depositAddress === 'string' && s.deposit.token ? s.deposit : undefined
    const paid = typeof s.paid?.amount === 'string' ? s.paid : undefined
    return { ...s, step: STEPS.includes(s.step) ? s.step : '', amount: String(s.amount ?? ''), note: String(s.note ?? ''), qr, deposit, paid }
  } catch {
    return null
  }
}

export function storeSaved(handle: string, s: Omit<Saved, 'savedAt'>) {
  const clean: Saved = {
    ...s,
    savedAt: Date.now(),
    qr: s.qr && { amount: s.qr.amount, ot: publicOt(s.qr.ot), shownAt: s.qr.shownAt },
    deposit: s.deposit && { ...s.deposit, ot: publicOt(s.deposit.ot) },
  }
  try {
    localStorage.setItem(keyFor(handle), JSON.stringify(clean))
  } catch { /* storage full or blocked: the flow still works, it just won't survive a refresh */ }
}

export function clearSaved(handle: string) {
  try {
    localStorage.removeItem(keyFor(handle))
  } catch { /* blocked storage */ }
}
