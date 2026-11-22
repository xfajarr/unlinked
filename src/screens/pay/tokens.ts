// NEAR Intents token list, loaded once per page view and shared by the BCH price line and the chain picker.
import { useEffect, useState } from 'react'
import { xchainTokens, type XToken } from '../../lib/api'

let cache: Promise<XToken[]> | null = null
const load = () =>
  (cache ??= xchainTokens().catch((e: unknown) => {
    cache = null
    throw e
  }))

export type XTokens = { tokens: XToken[] | null; failed: boolean; reload: () => void }

export function useXTokens(): XTokens {
  const [s, setS] = useState<{ tokens: XToken[] | null; failed: boolean }>({ tokens: null, failed: false })
  const [n, setN] = useState(0)
  useEffect(() => {
    let on = true
    load().then(
      (tokens) => on && setS({ tokens, failed: false }),
      () => on && setS({ tokens: null, failed: true }),
    )
    return () => {
      on = false
    }
  }, [n])
  return { ...s, reload: () => (setS({ tokens: null, failed: false }), setN((x) => x + 1)) }
}

export const bchPrice = (tokens: XToken[] | null) => tokens?.find((t) => t.blockchain === 'bch' && t.symbol === 'BCH')?.price ?? null

export const MAIN_CHAINS = ['base', 'eth', 'sol', 'arb', 'tron', 'bsc']

const NAMES: Record<string, string> = {
  base: 'Base', eth: 'Ethereum', sol: 'Solana', arb: 'Arbitrum', tron: 'Tron', bsc: 'BNB Chain',
  btc: 'Bitcoin', near: 'NEAR', op: 'Optimism', pol: 'Polygon', avax: 'Avalanche', gnosis: 'Gnosis',
  ton: 'TON', sui: 'Sui', aptos: 'Aptos', doge: 'Dogecoin', ltc: 'Litecoin', xrp: 'XRP Ledger',
  zec: 'Zcash', dash: 'Dash', cardano: 'Cardano', stellar: 'Stellar', starknet: 'Starknet',
  bera: 'Berachain', monad: 'Monad', xlayer: 'X Layer', scroll: 'Scroll', plasma: 'Plasma',
  hood: 'Robinhood Chain', hypercore: 'Hyperliquid', abs: 'Abstract', aleo: 'Aleo',
  movement: 'Movement', fogo: 'Fogo', miden: 'Miden',
}
export const chainName = (id: string) => NAMES[id] ?? id.toUpperCase()

const ORDER = ['USDC', 'USDT', 'USDT0', 'ETH', 'SOL', 'BNB', 'TRX', 'BTC', 'POL', 'AVAX', 'ARB', 'OP', 'wNEAR', 'DAI', 'WETH', 'cbBTC', 'WBTC', 'wBTC', 'xBTC']
const rank = (s: string) => {
  const i = ORDER.indexOf(s)
  return i < 0 ? ORDER.length : i
}

export function groupByChain(tokens: XToken[]): Map<string, XToken[]> {
  const m = new Map<string, XToken[]>()
  for (const t of tokens) {
    if (t.blockchain === 'bch' || /deprecated/i.test(t.symbol)) continue
    const list = m.get(t.blockchain) ?? []
    list.push(t)
    m.set(t.blockchain, list)
  }
  for (const list of m.values()) list.sort((a, b) => rank(a.symbol) - rank(b.symbol))
  return m
}
