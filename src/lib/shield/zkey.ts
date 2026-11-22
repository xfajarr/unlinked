// Proving assets for the browser prover. The ~108 MB zkey is served from /shield/ in chunks of at most 24 MiB
// (Workers assets cap a file at 25 MiB; scripts/shield-assets.sh writes them and the manifest), checked by sha256.
// The zkey is cached in IndexedDB when the browser allows it.

export type AssetFile = { file: string; size: number; sha256: string }
export type Manifest = { version: 1; zkey: { sha256: string; size: number; chunks: AssetFile[] }; wasm: AssetFile; vk: AssetFile }

export type LoadProgress = { stage: 'download'; loaded: number; total: number } | { stage: 'check' } | { stage: 'cached' }

/** Where a verified zkey is kept between visits. Every method must swallow its own errors. */
export type ZkeyCache = { get(key: string): Promise<Uint8Array | null>; put(key: string, data: Uint8Array): Promise<void> }

export const noCache: ZkeyCache = { get: async () => null, put: async () => {} }

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')
export const sha256Hex = async (data: Uint8Array) => hex(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>))

type Fetch = (url: string) => Promise<Response>

export async function loadManifest(base: string, fetcher: Fetch = fetch): Promise<Manifest> {
  const r = await fetcher(`${base}manifest.json`)
  if (!r.ok) throw new Error('The private proof files are missing on this server')
  return (await r.json()) as Manifest
}

async function fetchInto(url: string, into: Uint8Array, offset: number, size: number, fetcher: Fetch, onBytes: (n: number) => void) {
  const r = await fetcher(url)
  if (!r.ok || !r.body) throw new Error(`Could not download ${url}`)
  const reader = r.body.getReader()
  let at = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (at + value.length > size) throw new Error(`${url} is larger than expected`)
    into.set(value, offset + at)
    at += value.length
    onBytes(value.length)
  }
  if (at !== size) throw new Error(`${url} is incomplete`)
}

/** The zkey as one Uint8Array, checked against `pinnedSha256` so a proof is never made with a key the on-chain verifier doesn't match. */
export async function loadZkey(base: string, m: Manifest, pinnedSha256: string, opts: { cache?: ZkeyCache; fetcher?: Fetch; onProgress?: (p: LoadProgress) => void } = {}): Promise<Uint8Array> {
  const { cache = noCache, fetcher = fetch, onProgress } = opts
  if (m.zkey.sha256 !== pinnedSha256) throw new Error('This app version and its proving key do not match. Reload the page.')
  const cacheKey = `zkey:${pinnedSha256}`

  const hit = await cache.get(cacheKey)
  if (hit && hit.length === m.zkey.size) {
    onProgress?.({ stage: 'check' })
    if ((await sha256Hex(hit)) === pinnedSha256) {
      onProgress?.({ stage: 'cached' })
      return hit
    }
  }

  const sum = m.zkey.chunks.reduce((s, c) => s + c.size, 0)
  if (sum !== m.zkey.size) throw new Error('The proving key manifest is inconsistent')
  const out = new Uint8Array(m.zkey.size)
  let offset = 0, loaded = 0
  onProgress?.({ stage: 'download', loaded, total: m.zkey.size })
  for (const c of m.zkey.chunks) {
    await fetchInto(`${base}${c.file}`, out, offset, c.size, fetcher, (n) => {
      loaded += n
      onProgress?.({ stage: 'download', loaded, total: m.zkey.size })
    })
    if ((await sha256Hex(out.subarray(offset, offset + c.size))) !== c.sha256) throw new Error(`Proving key part ${c.file} is corrupt`)
    offset += c.size
  }
  onProgress?.({ stage: 'check' })
  if ((await sha256Hex(out)) !== pinnedSha256) throw new Error('The proving key is corrupt')
  void cache.put(cacheKey, out)
  return out
}

export async function loadAsset(base: string, f: AssetFile, fetcher: Fetch = fetch): Promise<Uint8Array> {
  const r = await fetcher(`${base}${f.file}`)
  if (!r.ok) throw new Error(`Could not download ${f.file}`)
  const b = new Uint8Array(await r.arrayBuffer())
  if (b.length !== f.size || (await sha256Hex(b)) !== f.sha256) throw new Error(`${f.file} is corrupt`)
  return b
}

/** IndexedDB cache holding only the newest key; no cache when storage is blocked or full. */
export function idbCache(name = 'unlinked-shield', store = 'zkey'): ZkeyCache {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(store)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  const run = <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T> | void) =>
    open().then(
      (db) =>
        new Promise<T | undefined>((resolve, reject) => {
          const tx = db.transaction(store, mode)
          const req = f(tx.objectStore(store))
          tx.oncomplete = () => (db.close(), resolve(req ? req.result : undefined))
          tx.onerror = tx.onabort = () => (db.close(), reject(tx.error))
        }),
    )
  return {
    async get(key) {
      try {
        const v = await run<unknown>('readonly', (s) => s.get(key))
        return v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : null
      } catch {
        return null
      }
    },
    async put(key, data) {
      try {
        await run('readwrite', (s) => {
          s.clear()
          s.put(data, key)
        })
      } catch {
        /* quota or private mode: the next visit downloads again */
      }
    },
  }
}
