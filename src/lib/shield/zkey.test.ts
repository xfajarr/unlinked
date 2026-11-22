import { describe, expect, test } from 'bun:test'
import { loadZkey, sha256Hex, type LoadProgress, type Manifest, type ZkeyCache } from './zkey'

const blob = crypto.getRandomValues(new Uint8Array(100_000))
const parts = [blob.slice(0, 40_000), blob.slice(40_000, 80_000), blob.slice(80_000)]

async function setup() {
  const files = new Map(parts.map((p, i) => [`/s/z.${i}`, p]))
  const m: Manifest = {
    version: 1,
    zkey: { sha256: await sha256Hex(blob), size: blob.length, chunks: await Promise.all(parts.map(async (p, i) => ({ file: `z.${i}`, size: p.length, sha256: await sha256Hex(p) }))) },
    wasm: { file: 'w', size: 0, sha256: '' },
    vk: { file: 'v', size: 0, sha256: '' },
  }
  // streams each file in small pieces, like a real response body
  const fetcher = async (url: string) => {
    const f = files.get(url)
    if (!f) return new Response(null, { status: 404 })
    return new Response(new ReadableStream({
      start(c) {
        for (let i = 0; i < f.length; i += 7_000) c.enqueue(f.slice(i, i + 7_000))
        c.close()
      },
    }))
  }
  return { m, files, fetcher }
}

const memCache = (): ZkeyCache & { store: Map<string, Uint8Array> } => {
  const store = new Map<string, Uint8Array>()
  return { store, get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) }
}

describe('chunked zkey', () => {
  test('reassembles the parts, reports progress, caches, then loads from the cache', async () => {
    const { m, fetcher } = await setup()
    const cache = memCache()
    const seen: LoadProgress[] = []
    const z = await loadZkey('/s/', m, m.zkey.sha256, { fetcher, cache, onProgress: (p) => seen.push(p) })
    expect(z).toEqual(blob)
    const dl = seen.filter((p) => p.stage === 'download')
    expect(dl.at(-1)).toEqual({ stage: 'download', loaded: blob.length, total: blob.length })
    await Bun.sleep(0)
    expect(cache.store.get(`zkey:${m.zkey.sha256}`)).toEqual(blob)

    const again: LoadProgress[] = []
    const z2 = await loadZkey('/s/', m, m.zkey.sha256, { fetcher: () => Promise.reject(new Error('no network')), cache, onProgress: (p) => again.push(p) })
    expect(z2).toEqual(blob)
    expect(again.map((p) => p.stage)).toEqual(['check', 'cached'])
  })

  test('a corrupt part is named', async () => {
    const { m, files, fetcher } = await setup()
    const bad = files.get('/s/z.1')!.slice()
    bad[5]! ^= 1
    files.set('/s/z.1', bad)
    await expect(loadZkey('/s/', m, m.zkey.sha256, { fetcher })).rejects.toThrow('z.1 is corrupt')
  })

  test('a corrupt cache entry is replaced by a fresh download', async () => {
    const { m, fetcher } = await setup()
    const cache = memCache()
    const junk = blob.slice()
    junk[0]! ^= 1
    cache.store.set(`zkey:${m.zkey.sha256}`, junk)
    expect(await loadZkey('/s/', m, m.zkey.sha256, { fetcher, cache })).toEqual(blob)
  })

  test('refuses a key other than the pinned one', async () => {
    const { m, fetcher } = await setup()
    await expect(loadZkey('/s/', m, 'ab'.repeat(32), { fetcher })).rejects.toThrow('do not match')
  })
})
