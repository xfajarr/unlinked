// Browser prover (Web Worker): snarkjs Groth16 for transact.circom. Loads the wasm, the chunked zkey and the
// verification key once, keeps them in memory, and checks every proof before returning it.
import { idbCache, loadAsset, loadManifest, loadZkey } from './zkey'
import type { ProveProgress, ProverRequest, ProverResponse } from './prover'

type Snark = {
  wtns: { calculate(input: unknown, wasm: Uint8Array, out: { type: 'mem'; data?: Uint8Array }): Promise<void> }
  groth16: {
    prove(zkey: Uint8Array, wtns: { type: 'mem'; data?: Uint8Array }, logger?: unknown): Promise<{ proof: unknown; publicSignals: string[] }>
    verify(vk: unknown, publicSignals: string[], proof: unknown): Promise<boolean>
  }
}

const ctx = self as unknown as { postMessage(m: ProverResponse): void; onmessage: ((e: MessageEvent<ProverRequest>) => void) | null }

type Assets = { zkey: Uint8Array; wasm: Uint8Array; vk: unknown }
let assets: Promise<Assets> | null = null

function load(base: string, zkeySha256: string, progress: (p: ProveProgress) => void): Promise<Assets> {
  assets ??= (async () => {
    const m = await loadManifest(base)
    const [wasm, vk, zkey] = await Promise.all([
      loadAsset(base, m.wasm),
      loadAsset(base, m.vk).then((b) => JSON.parse(new TextDecoder().decode(b))),
      loadZkey(base, m, zkeySha256, { cache: idbCache(), onProgress: progress }),
    ])
    return { zkey, wasm, vk }
  })()
  // a failed load is retried on the next request
  assets.catch(() => {
    assets = null
  })
  return assets
}

// groth16_prove's own debug lines, in order: coarse progress for the slow part
const STEPS = ['Reading Wtns', 'Building ABC', 'Join ABC', 'Reading A Points', 'Reading B1 Points', 'Reading B2 Points', 'Reading C Points', 'Reading H Points']

ctx.onmessage = async (e) => {
  const req = e.data
  const progress = (p: ProveProgress) => ctx.postMessage({ id: req.id, type: 'progress', progress: p })
  try {
    const a = await load(req.base, req.zkeySha256, progress)
    if (req.type === 'preload') return ctx.postMessage({ id: req.id, type: 'done' })

    const snarkjs = (await import('snarkjs')) as unknown as Snark
    progress({ stage: 'witness' })
    const t0 = performance.now()
    const wtns: { type: 'mem'; data?: Uint8Array } = { type: 'mem' }
    await snarkjs.wtns.calculate(req.input, a.wasm, wtns)
    const t1 = performance.now()
    let step = 0
    const logger = {
      debug(msg: string) {
        const i = STEPS.findIndex((s) => msg.startsWith(s))
        if (i >= step) progress({ stage: 'prove', step: (step = i + 1), of: STEPS.length })
      },
      info() {},
      warn() {},
      error() {},
    }
    progress({ stage: 'prove', step: 0, of: STEPS.length })
    const { proof, publicSignals } = await snarkjs.groth16.prove(a.zkey, wtns, logger)
    const t2 = performance.now()
    progress({ stage: 'verify' })
    if (!(await snarkjs.groth16.verify(a.vk, publicSignals, proof))) throw new Error('The private proof did not check out. Try again.')
    const t3 = performance.now()
    ctx.postMessage({ id: req.id, type: 'done', result: { proof, publicSignals, ms: { witness: t1 - t0, prove: t2 - t1, verify: t3 - t2 } } })
  } catch (err) {
    ctx.postMessage({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
