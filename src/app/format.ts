import { CASHADDR_PREFIX, EXPLORER_TX } from '../lib/config'
import type { Received } from '../lib/payments'

export const fmtBch = (sats: number) => (sats / 1e8).toFixed(8).replace(/\.?0+$/, '') || '0'
export const fmtPusd = (n: number) => String(+n.toFixed(2))
const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const fmtUsd = (n: number) => usdFmt.format(n)

/** What a payment carries, for labels. PUSD outputs also hold dust sats, which we don't show per row. */
export const itemAmount = (r: Received) => (r.pusd > 0 ? `${fmtPusd(r.pusd)} PUSD` : `${fmtBch(r.sats)} BCH`)

export function sumLabel(items: Received[]) {
  const sats = items.filter((r) => r.pusd === 0).reduce((s, r) => s + r.sats, 0)
  const pusd = items.reduce((s, r) => s + r.pusd, 0)
  return [sats ? `${fmtBch(sats)} BCH` : '', pusd ? `${fmtPusd(pusd)} PUSD` : ''].filter(Boolean).join(' + ')
}

export const shortAddr = (a: string) => {
  const s = a.replace(/^[a-z]+:/, '')
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}
export const shortTx = (t: string) => `${t.slice(0, 8)}…${t.slice(-6)}`

export function relTime(ms: number, now = Date.now()) {
  const s = Math.max(0, (now - ms) / 1000)
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const normalizeHandleInput = (v: string) => v.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '').slice(0, 20)
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/

const CASHADDR = /^(bitcoincash|bchtest):[qpzr][qpzry9x8gf2tvdw0s3jn54khce6mua7l]{40,}$/

/** Normalizes a pasted BCH address (adds the network prefix when missing). Returns null when it doesn't look like cashaddr. */
export function parseBchAddress(v: string): { address: string; tokenAware: boolean } | null {
  let a = v.trim().toLowerCase()
  if (!a) return null
  if (!a.includes(':')) a = `${CASHADDR_PREFIX}:${a}`
  if (!CASHADDR.test(a)) return null
  const t = a.split(':')[1][0]
  return { address: a, tokenAware: t === 'z' || t === 'r' }
}

export const explorerTx = (txid: string) => `${EXPLORER_TX}${txid}`
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'Something went wrong'


export const linkFor = (handle: string) => `${window.location.origin}/@${handle}`
export const linkHost = () => window.location.host
