export const DECK_URL = 'https://docs.google.com/presentation/d/REPLACE_WITH_DECK'
export const REPO_URL = 'https://github.com/xfajarr/unlinked'
export const DONATION_ADDRESS = 'bitcoincash:zREPLACE_WITH_CASHTOKENS_ADDRESS'

export const APP_HOST = 'unlinked.cash'
/** Handle the landing's "See a pay page" button opens; empty hides the button. */
export const DEMO_HANDLE = ''
export const PUSD_CATEGORY = '2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544'
export const PUSD_DECIMALS = 2

export type Network = 'mainnet' | 'chipnet'
/** Mainnet by default. The Shield demo build runs on chipnet: VITE_NETWORK=chipnet (bun run dev:chipnet / build:chipnet). */
export const NETWORK: Network = import.meta.env?.VITE_NETWORK === 'chipnet' ? 'chipnet' : 'mainnet'

const NETWORKS = {
  // Public Fulcrum servers with WebSocket (wss); all four answer listunspent with tokens.
  mainnet: {
    prefix: 'bitcoincash',
    fulcrum: ['bch.loping.net', 'fulcrum.greyh.at', 'electrum.imaginary.cash', 'fulcrum.criptolayer.net'],
    explorerTx: 'https://blockchair.com/bitcoin-cash/transaction/',
  },
  // cbch.loping.net and chipnet.c3-soft.com did not answer, so they are excluded.
  chipnet: {
    prefix: 'bchtest',
    fulcrum: ['chipnet.bch.ninja', 'chipnet.imaginary.cash'],
    explorerTx: 'https://chipnet.imaginary.cash/tx/',
  },
} as const

export const CASHADDR_PREFIX = NETWORKS[NETWORK].prefix
export const FULCRUM_SERVERS: readonly string[] = NETWORKS[NETWORK].fulcrum
export const EXPLORER_TX = NETWORKS[NETWORK].explorerTx
/** PUSD and NEAR cross-chain deposits exist only on mainnet. */
export const PUSD_ENABLED = NETWORK === 'mainnet'
export const XCHAIN_ENABLED = NETWORK === 'mainnet'

// Shield runs wherever its pool is deployed: shield/deployments/<network>.json (see SHIELD_LIVE).
export const SHIELD_ENABLED: boolean = true
/** Fee estimate before the deployment loads: a pool tx is about 31.2 to 31.4 kB at 1.02 sat/B. The real fee comes from shieldTxSize(). */
export const SHIELD_FEE_SATS = 32_000
