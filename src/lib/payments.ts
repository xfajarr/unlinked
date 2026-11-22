// Payer and inbox flows built on stealth.ts + api.ts + fulcrum.ts.
// stealth (libauth WebAssembly) and fulcrum (sockets) load lazily to keep the first page light.
import { listAnnouncements, postAnnouncement, type Profile } from './api'
import { PUSD_CATEGORY, PUSD_DECIMALS } from './config'
import type { Utxo } from './fulcrum'
import type { Match, OneTime, ReceiverKeys } from './stealth'

const stealth = () => import('./stealth')
const fulcrum = () => import('./fulcrum')

/** Announce-first (spec 4.2): the announcement is stored before the payer sees the address, so a payment never lands where the receiver can't find it. */
export async function preparePayment(profile: Pick<Profile, 'scanPub' | 'spendPub'>): Promise<OneTime> {
  const { deriveOneTime } = await stealth()
  const ot = deriveOneTime(profile.scanPub, profile.spendPub)
  await postAnnouncement({ data: { ephemeralPub: ot.ephemeralPub, viewTag: ot.viewTag } })
  return ot
}

export type Received = {
  address: string
  tokenAddress: string
  match: Match
  utxos: Utxo[]
  sats: number
  pusd: number
  pending: boolean
  createdAt: number
}

export const satsToBch = (s: number) => s / 1e8
export const pusdOf = (u: Utxo[]) =>
  u.reduce((sum, x) => (x.token_data?.category === PUSD_CATEGORY ? sum + Number(x.token_data.amount) : sum), 0) / 10 ** PUSD_DECIMALS

export const bip21 = (address: string, bch?: number) => (bch ? `${address}?amount=${+bch.toFixed(8)}` : address)

/** Waits until the one-time address sees any transaction; retries every 10s if all servers are unreachable (onError reports it). Returns a cancel function, safe before the subscription is set up. */
export function waitForPayment(address: string, onPaid: (utxos: Utxo[]) => void, onError?: (message: string | null) => void): () => void {
  let stop: (() => void) | null = null
  let done = false
  let retry: ReturnType<typeof setTimeout> | undefined
  const start = async () => {
    try {
      const { listUnspent, watchAddress } = await fulcrum()
      const check = async () => {
        if (done) return
        const u = await listUnspent(address).catch(() => [] as Utxo[])
        if (u.length && !done) {
          done = true
          stop?.()
          onPaid(u)
        }
      }
      const un = await watchAddress(address, check)
      if (done) return un()
      stop = un
      onError?.(null)
      check()
    } catch {
      if (done) return
      onError?.("Can't reach the Bitcoin Cash network. Retrying.")
      retry = setTimeout(start, 10_000)
    }
  }
  start()
  return () => {
    done = true
    clearTimeout(retry)
    stop?.()
  }
}

export function createInboxScanner(keys: ReceiverKeys) {
  let cursor = 0
  const found = new Map<string, Received>()

  async function refresh(addr: string) {
    const r = found.get(addr)
    if (!r) return
    const { listUnspent } = await fulcrum()
    const utxos = await listUnspent(addr).catch(() => r.utxos)
    found.set(addr, { ...r, utxos, sats: utxos.reduce((s, u) => s + u.value, 0), pusd: pusdOf(utxos), pending: utxos.some((u) => u.height <= 0) })
  }

  async function poll(): Promise<Received[]> {
    const [{ scanAnnouncement }, { watchAddress }] = await Promise.all([stealth(), fulcrum()])
    for (;;) {
      const batch = await listAnnouncements({ data: { after: cursor, limit: 500 } })
      for (const a of batch) {
        cursor = a.id
        const m = scanAnnouncement(keys, a.ephemeralPub, a.viewTag)
        if (!m) continue
        found.set(m.address, { address: m.address, tokenAddress: m.tokenAddress, match: m, utxos: [], sats: 0, pusd: 0, pending: false, createdAt: a.createdAt })
        watchAddress(m.address, () => void refresh(m.address)).catch(() => {})
      }
      if (batch.length < 500) break
    }
    await Promise.all([...found.keys()].map(refresh))
    return [...found.values()].filter((r) => r.utxos.length).sort((a, b) => b.createdAt - a.createdAt)
  }

  return { poll }
}
