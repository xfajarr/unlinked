// Watches a 1Click deposit address on its origin EVM chain from the browser, so the payer sees the deposit before 1Click does.
const RPC: Record<string, string> = {
  eth: 'https://ethereum-rpc.publicnode.com',
  base: 'https://base-rpc.publicnode.com',
  arb: 'https://arbitrum-one-rpc.publicnode.com',
  bsc: 'https://bsc-rpc.publicnode.com',
  pol: 'https://polygon-bor-rpc.publicnode.com',
  op: 'https://optimism-rpc.publicnode.com',
  avax: 'https://avalanche-c-chain-rpc.publicnode.com',
}
const EXPLORER: Record<string, string> = {
  eth: 'https://etherscan.io',
  base: 'https://basescan.org',
  arb: 'https://arbiscan.io',
  bsc: 'https://bscscan.com',
  pol: 'https://polygonscan.com',
  op: 'https://optimistic.etherscan.io',
  avax: 'https://snowtrace.io',
}
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
export const WATCH_MS = 4000
const RANGE = 2000
const MARGIN = 50
// load-balanced public RPCs can serve a backend a few blocks behind, so the tail is scanned again each tick
const OVERLAP = 30

export type Transfer = { hash: string; block: number; index: number; value: string }
export type Seen = { native: true } | { native: false; transfers: Transfer[] }
type Log = { transactionHash: string; blockNumber: string; logIndex: string; data: string; removed?: boolean }

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const b58 = (s: string) => [...s].reduce((n, c) => n * 58n + BigInt(B58.indexOf(c)), 0n)

/** The ERC-20 contract a NEAR asset id points at, '' for the chain's native coin, null when it can't be told. */
export function tokenContract(assetId: string): string | null {
  const hex = assetId.match(/0x[0-9a-fA-F]{40}/)
  if (hex) return hex[0].toLowerCase()
  // HOT omni ids carry the contract as base58, all ones being the native coin
  const hot = assetId.match(/^nep245:v2_1\.omni\.hot\.tg:\d+_([1-9A-HJ-NP-Za-km-z]+)$/)
  if (hot) {
    const n = b58(hot[1]!)
    return n === 0n ? '' : n < 1n << 160n ? '0x' + n.toString(16).padStart(40, '0') : null
  }
  return /^nep141:[a-z]+\.(omft|omdep)\.near$/.test(assetId) ? '' : null
}

export const canWatch = (chain: string, assetId: string) => !!RPC[chain] && tokenContract(assetId) !== null
export const txUrl = (chain: string, hash: string) => (EXPLORER[chain] ? `${EXPLORER[chain]}/tx/${hash}` : null)

let id = 0
async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    signal: AbortSignal.timeout(10_000),
  })
  const j = (await r.json()) as { result?: T; error?: { message?: string } }
  if (j.error || j.result === undefined || j.result === null) throw new Error(j.error?.message ?? `RPC ${r.status}`)
  return j.result
}

const head = (url: string) => rpc<string>(url, 'eth_blockNumber', []).then(Number)

/** A block shortly before now, to scan from. Undefined when the chain isn't watched or the RPC is down. */
export async function startBlock(chain: string): Promise<number | undefined> {
  const url = RPC[chain]
  if (!url) return undefined
  return head(url).then((n) => Math.max(0, n - MARGIN), () => undefined)
}

type Opts = { chain: string; assetId: string; address: string; fromBlock?: number; onStart?: (block: number) => void }

/** Polls until stopped. Errors are swallowed and retried on the next tick. */
export function watchDeposit({ chain, assetId, address, fromBlock, onStart }: Opts, onSeen: (s: Seen) => void): () => void {
  const url = RPC[chain]
  const token = tokenContract(assetId)
  if (!url || token === null || !/^0x[0-9a-fA-F]{40}$/.test(address)) return () => {}
  let on = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let start = fromBlock
  let next = fromBlock
  const found = new Map<string, Transfer>()
  const topic = '0x' + address.slice(2).toLowerCase().padStart(64, '0')

  async function native() {
    const bal = await rpc<string>(url!, 'eth_getBalance', [address, 'latest'])
    if (BigInt(bal) > 0n && on) {
      on = false
      onSeen({ native: true })
    }
  }

  async function logs() {
    const top = await head(url!)
    if (start === undefined) {
      start = next = Math.max(0, top - MARGIN)
      onStart?.(start)
    }
    let size = RANGE
    while (on && next! <= top) {
      const to = Math.min(next! + size - 1, top)
      let got: Log[]
      try {
        got = await rpc<Log[]>(url!, 'eth_getLogs', [{ address: token, fromBlock: '0x' + next!.toString(16), toBlock: '0x' + to.toString(16), topics: [TRANSFER, null, topic] }])
      } catch (e) {
        if (size <= 250) throw e
        size = Math.floor(size / 2)
        continue
      }
      let added = false
      for (const l of got) {
        const k = `${l.transactionHash}:${l.logIndex}`
        if (l.removed || found.has(k)) continue
        found.set(k, { hash: l.transactionHash, block: Number(l.blockNumber), index: Number(l.logIndex), value: BigInt(l.data === '0x' ? 0 : l.data).toString() })
        added = true
      }
      if (added && on) onSeen({ native: false, transfers: [...found.values()].sort((a, b) => a.block - b.block || a.index - b.index) })
      next = to + 1
    }
    next = Math.max(start, top + 1 - OVERLAP)
  }

  const tick = async () => {
    await (token === '' ? native() : logs()).catch(() => {})
    if (on) timer = setTimeout(tick, WATCH_MS)
  }
  tick()
  return () => {
    on = false
    clearTimeout(timer)
  }
}
