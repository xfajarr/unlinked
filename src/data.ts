// Demo data only. No real funds, keys or addresses.
export const BCH_USD = 191.2

export type TokenId = 'BCH' | 'USDC' | 'USDT' | 'ETH' | 'SOL'
export type ChainId = 'bch' | 'base' | 'ethereum' | 'arbitrum' | 'solana' | 'tron'

export const TOKENS: Record<TokenId, { name: string; color: string; glyph: string; usd: number; chains: ChainId[] }> = {
  BCH: { name: 'Bitcoin Cash', color: '#0ac18e', glyph: '₿', usd: BCH_USD, chains: ['bch'] },
  USDC: { name: 'USD Coin', color: '#2775ca', glyph: '$', usd: 1, chains: ['base', 'ethereum', 'arbitrum', 'solana'] },
  USDT: { name: 'Tether', color: '#26a17b', glyph: '₮', usd: 1, chains: ['ethereum', 'tron', 'arbitrum'] },
  ETH: { name: 'Ether', color: '#627eea', glyph: 'Ξ', usd: 3120, chains: ['ethereum', 'base', 'arbitrum'] },
  SOL: { name: 'Solana', color: '#9945ff', glyph: '◎', usd: 168, chains: ['solana'] },
}

export const CHAINS: Record<ChainId, { name: string; color: string }> = {
  bch: { name: 'Bitcoin Cash', color: '#0ac18e' },
  base: { name: 'Base', color: '#0052ff' },
  ethereum: { name: 'Ethereum', color: '#454a75' },
  arbitrum: { name: 'Arbitrum', color: '#28a0f0' },
  solana: { name: 'Solana', color: '#14b88a' },
  tron: { name: 'Tron', color: '#e5312b' },
}

export type Payment = {
  id: string
  token: TokenId
  chain: ChainId
  amountIn: number
  bch: number
  minutesAgo: number
  oneTime: string
  note?: string
  /** set for money you sent out (Send / Withdraw) */
  out?: { to: string; txs: number; at: number; withdraw?: boolean }
}

export const PAYMENTS: Payment[] = [
  { id: 'p1', token: 'USDC', chain: 'base', amountIn: 10, bch: 0.0524, minutesAgo: 3, oneTime: 'qz7m…8f3k', note: 'Logo revisions' },
  { id: 'p2', token: 'BCH', chain: 'bch', amountIn: 0.12, bch: 0.12, minutesAgo: 95, oneTime: 'qp2x…a91d' },
  { id: 'p3', token: 'USDT', chain: 'tron', amountIn: 25, bch: 0.1306, minutesAgo: 60 * 26, oneTime: 'qr9c…0e7v', note: 'Invoice #12' },
  { id: 'p4', token: 'ETH', chain: 'arbitrum', amountIn: 0.01, bch: 0.1628, minutesAgo: 60 * 24 * 3, oneTime: 'qq4t…m2wz' },
  { id: 'p5', token: 'SOL', chain: 'solana', amountIn: 0.4, bch: 0.3512, minutesAgo: 60 * 24 * 6, oneTime: 'qz0h…7kqs' },
]

// 29 older demo payments, generated with a fixed seed so the list is stable between reloads
const NOTES = ['Invoice #11', 'Website copy', 'Poster design', undefined, 'Consulting call', undefined, 'Tip', 'Brand kit', undefined, 'Monthly retainer']
const MIX: [TokenId, ChainId, number][] = [['USDC', 'base', 1], ['BCH', 'bch', BCH_USD], ['USDT', 'tron', 1], ['ETH', 'arbitrum', 3120], ['SOL', 'solana', 168], ['USDC', 'ethereum', 1], ['USDT', 'ethereum', 1]]
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
for (let i = 0; i < 29; i++) {
  const [token, chain, usd] = MIX[Math.floor(rnd() * MIX.length)]
  const valueUsd = Math.round((8 + rnd() * 140) * 100) / 100
  const amountIn = token === 'USDC' || token === 'USDT' ? Math.round(valueUsd) : Number((valueUsd / usd).toFixed(token === 'ETH' ? 4 : 3))
  PAYMENTS.push({
    id: `g${i}`,
    token, chain, amountIn,
    bch: Number(((amountIn * usd * (token === 'BCH' ? 1 : 0.997)) / BCH_USD).toFixed(4)),
    minutesAgo: Math.round(60 * 24 * (6.5 + i * 0.85 + rnd() * 0.6)),
    oneTime: `q${Math.floor(rnd() * 36 ** 3).toString(36).padStart(3, '0')}…${Math.floor(rnd() * 36 ** 4).toString(36).padStart(4, '0')}`,
    note: NOTES[i % NOTES.length],
  })
}

// sends made in this browser session, newest first (demo only)
export const SENT: Payment[] = []
export function recordSent(to: string, amount: number, txs: number, withdraw: boolean) {
  SENT.unshift({
    id: `s${Date.now()}`, token: 'BCH', chain: 'bch', amountIn: amount, bch: -amount, minutesAgo: 0,
    oneTime: '', note: withdraw ? `Withdrawn to ${to}` : `Sent to ${to}`, out: { to, txs, at: Date.now(), withdraw },
  })
}

export const fmtBch = (n: number, d = 4) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
export const fmtUsd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
export const ago = (m: number) =>
  m < 1 ? 'Just now' : m < 60 ? `${m}m ago` : m < 60 * 24 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 60 / 24)}d ago`

const hex = '0123456789abcdef'
export const randHex = (n: number) => Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join('')
