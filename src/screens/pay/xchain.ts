
export const EVM = new Set(['base', 'eth', 'arb', 'bsc', 'op', 'pol', 'avax', 'gnosis', 'scroll', 'bera', 'monad', 'xlayer', 'abs', 'plasma', 'hood', 'hypercore'])
const B58 = '[1-9A-HJ-NP-Za-km-z]'
const CHECKS: Record<string, RegExp> = {
  sol: new RegExp(`^${B58}{32,44}$`),
  tron: new RegExp(`^T${B58}{33}$`),
  btc: /^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
}

export function refundLooksValid(chain: string, addr: string): boolean {
  const a = addr.trim()
  if (!a) return false
  if (EVM.has(chain)) return /^0x[0-9a-fA-F]{40}$/.test(a)
  return CHECKS[chain]?.test(a) ?? a.length >= 20
}

export function friendlyQuoteError(msg: string, chain: string): string {
  const m = msg.replace(/^Quote failed:\s*/, '')
  if (/refundTo/i.test(m)) return `Check the refund address. It doesn't look like a ${chain} address.`
  if (/recipient/i.test(m)) return "Couldn't use the one-time address. Try again."
  if (/amount is too low|too small|minimum/i.test(m)) return m.endsWith('.') ? m : `${m}.`
  return msg
}

export function suggestAmount(usd: number, price: number, decimals: number): string {
  if (!(usd > 0) || !(price > 0)) return ''
  const x = usd / price
  const s = price > 0.5 && price < 2 ? x.toFixed(2) : String(Number(x.toPrecision(4)))
  if (/e/i.test(s)) return x.toFixed(Math.min(decimals, 8)).replace(/\.?0+$/, '')
  const [w, f = ''] = s.split('.')
  const frac = f.slice(0, decimals).replace(/0+$/, '')
  return frac ? `${w}.${frac}` : w!
}

// Dry quotes only need a valid BCH recipient (the CashAddr spec example); they move nothing, so the real one-time address is kept for the real quote.
export const DRY_RECIPIENT = 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a'
