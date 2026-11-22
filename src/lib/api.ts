// Client for the Unlinked API Worker (api/), `{ data }` call shape. Base URL: VITE_API_URL (dev default localhost:8790).
import { R } from '../../shield/lib/src/field.ts'

export type Profile = {
  handle: string
  scanPub: string
  spendPub: string
  /** Shield key (64 hex, a BN254 field element). Null when the handle was claimed before Shield. */
  shieldPk: string | null
  displayName: string | null
  bio: string | null
  fingerprint: string
}
export type Announcement = { id: number; ephemeralPub: string; viewTag: number; noteCiphertext: string | null; createdAt: number }
export type XToken = { assetId: string; symbol: string; blockchain: string; decimals: number; price: number }
export type XQuote = { depositAddress: string; amountIn: string; amountOut: string; amountOutUsd: string; timeEstimate: number; deadline: string }
export type XStatus = 'PENDING_DEPOSIT' | 'KNOWN_DEPOSIT_TX' | 'PROCESSING' | 'SUCCESS' | 'INCOMPLETE_DEPOSIT' | 'REFUNDED' | 'FAILED' | 'UNKNOWN'

export const BCH_ASSET = 'nep141:bch.omft.near'
const FIELD_HEX = /^[0-9a-f]{64}$/
/** 32-byte big-endian field element below r (shield spec section 3). */
export const isShieldPk = (h: string) => FIELD_HEX.test(h) && BigInt('0x' + h) < R
export const normalizeHandle = (h: string) => h.trim().toLowerCase().replace(/^@/, '')

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8790').replace(/\/$/, '')

async function call<T>(path: string, init?: { query?: Record<string, string | number>; body?: unknown }): Promise<T> {
  const qs = init?.query ? '?' + new URLSearchParams(Object.entries(init.query).map(([k, v]) => [k, String(v)])) : ''
  const r = await fetch(BASE + path + qs, init?.body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error((j as { error?: string } | null)?.error ?? `Request failed (${r.status})`)
  return j as T
}

export const getProfile = ({ data }: { data: { handle: string } }) => call<Profile | null>('/api/profile', { query: { handle: data.handle } })
export const checkHandle = ({ data }: { data: { handle: string } }) => call<{ valid: boolean; available: boolean }>('/api/check', { query: { handle: data.handle } })
export const claimHandle = ({ data }: { data: { handle: string; scanPub: string; spendPub: string; authPub: string; shieldPk?: string | null; displayName?: string | null; bio?: string | null } }) =>
  call<{ ok: true; profile: Profile } | { ok: false; error: string }>('/api/claim', { body: data })
export const postAnnouncement = ({ data }: { data: { ephemeralPub: string; viewTag: number; noteCiphertext?: string | null } }) => call<{ id: number }>('/api/announcements', { body: data })
export const listAnnouncements = ({ data }: { data: { after: number; limit: number } }) => call<Announcement[]>('/api/announcements', { query: data })
export const recentAnnouncements = () => call<Announcement[]>('/api/announcements/recent')
export const xchainTokens = () => call<XToken[]>('/api/xchain/tokens')
export const xchainQuote = ({ data }: { data: { originAsset: string; destinationAsset?: string; amount: string; recipient: string; refundTo: string; dry?: boolean } }) =>
  call<XQuote | { error: string }>('/api/xchain/quote', { body: data })
export const xchainStatus = ({ data }: { data: { depositAddress: string } }) => call<XStatus>('/api/xchain/status', { query: data })
