// Browser-only Fulcrum access with failover (spec 7.1). Queries never touch our server.
import { ElectrumClient } from '@electrum-cash/network'
import { FULCRUM_SERVERS } from './config'

export type Utxo = { tx_hash: string; tx_pos: number; value: number; height: number; token_data?: { category: string; amount: string; nft?: unknown } }

let client: ElectrumClient<any> | null = null
let connecting: Promise<ElectrumClient<any>> | null = null
const listeners = new Map<string, Set<() => void>>()

async function connect(): Promise<ElectrumClient<any>> {
  if (client) return client
  if (connecting) return connecting
  connecting = (async () => {
    // ponytail: shuffled single connection; spread queries across servers later (spec 5.5, P2)
    const servers = [...FULCRUM_SERVERS].sort(() => Math.random() - 0.5)
    let last: unknown
    for (const host of servers) {
      try {
        const c = new ElectrumClient('unlinked', '1.5', host)
        await c.connect()
        c.on('notification', (msg: any) => {
          if (msg?.method !== 'blockchain.address.subscribe') return
          const addr = String(msg.params?.[0] ?? '')
          listeners.get(addr)?.forEach((fn) => fn())
        })
        client = c
        return c
      } catch (e) {
        last = e
      }
    }
    connecting = null
    throw last instanceof Error ? last : new Error('Could not reach a Bitcoin Cash server')
  })()
  return connecting
}

async function call<T>(method: string, ...params: (string | number | boolean)[]): Promise<T> {
  const c = await connect()
  const r = await c.request(method, ...params)
  if (r instanceof Error) throw r
  return r as T
}

export const listUnspent = (address: string) => call<Utxo[]>('blockchain.address.listunspent', address, 'include_tokens')
export const broadcast = (txHex: string) => call<string>('blockchain.transaction.broadcast', txHex)
export const getTransaction = (txid: string) => call<string>('blockchain.transaction.get', txid)
/** Confirmed history in chain order, then mempool (height 0, or -1 with unconfirmed parents). */
export const scripthashHistory = (scripthash: string) => call<{ tx_hash: string; height: number }[]>('blockchain.scripthash.get_history', scripthash)

export async function watchAddress(address: string, onChange: () => void): Promise<() => void> {
  const c = await connect()
  let set = listeners.get(address)
  if (!set) {
    set = new Set()
    listeners.set(address, set)
    await c.subscribe('blockchain.address.subscribe', address)
  }
  set.add(onChange)
  return () => {
    set!.delete(onChange)
  }
}
