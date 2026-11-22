import { fromHex, toHex } from './hex'

/** Short, human-checkable fingerprint of a profile's public keys (share card). Works on the Worker and in browsers. */
export async function fingerprint(scanPubHex: string, spendPubHex: string): Promise<string> {
  const h = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...fromHex(scanPubHex), ...fromHex(spendPubHex)])))).toUpperCase()
  return `${h.slice(0, 4)} ${h.slice(4, 8)} ${h.slice(8, 12)}`
}
