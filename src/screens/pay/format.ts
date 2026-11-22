
export type Currency = 'BCH' | 'PUSD'

export const PRESETS: Record<Currency, string[]> = { BCH: ['0.01', '0.05', '0.1'], PUSD: ['5', '10', '25'] }
export const DECIMALS: Record<Currency, number> = { BCH: 8, PUSD: 2 }

export function cleanAmount(s: string, dp: number): string {
  let v = s.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const i = v.indexOf('.')
  if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, dp)
  if (/^0\d/.test(v)) v = v.replace(/^0+(?=\d)/, '')
  return v.slice(0, 18)
}

export const amountNum = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** "12.345" with 6 decimals -> "12345000". Extra decimals are cut, never rounded up. */
export function toBaseUnits(amount: string, decimals: number): string {
  const m = amount.trim().match(/^(\d*)(?:\.(\d*))?$/)
  if (!m) return '0'
  const whole = m[1] || '0'
  const frac = (m[2] ?? '').slice(0, decimals).padEnd(decimals, '0')
  return (whole + frac).replace(/^0+(?=\d)/, '') || '0'
}

const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtUsd = (n: number) => usdFmt.format(n)

export const fmtCoin = (n: number | string, dp = 8) => {
  const x = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(x)) return String(n)
  return x.toFixed(dp).replace(/\.?0+$/, '') || '0'
}

export const shortAddr = (a: string) => {
  const x = a.replace(/^(bitcoincash|bchtest):/, '')
  return x.length > 16 ? `${x.slice(0, 8)}…${x.slice(-6)}` : x
}

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return d === 1 ? 'yesterday' : `${d} days ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function clock(ts: number | Date): string {
  const d = new Date(ts)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}
