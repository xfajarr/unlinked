// Main-thread side of the browser prover. One worker per page; it keeps the 108 MB zkey in memory after the first
// proof. Browser only: load this module lazily (it starts a Worker and imports snarkjs inside it).
import zkeyShaFile from '../../../shield/circuits/build/transact_final.zkey.sha256?raw'
import type { CircuitInput } from '../../../shield/lib/src/index.ts'
import type { LoadProgress } from './zkey'

/** The key the on-chain verifier was built from (shield/circuits/build). The served chunks must hash to it. */
export const ZKEY_SHA256 = zkeyShaFile.trim().split(/\s+/)[0]!
const BASE = '/shield/'

export type ProveProgress = LoadProgress | { stage: 'witness' } | { stage: 'prove'; step: number; of: number } | { stage: 'verify' }
export type Groth16Proof = { pi_a: string[]; pi_b: string[][]; pi_c: string[]; protocol: string; curve: string }
export type ProveResult = { proof: Groth16Proof; publicSignals: string[]; ms: { witness: number; prove: number; verify: number } }

export type ProverRequest = { id: number; base: string; zkeySha256: string } & ({ type: 'preload' } | { type: 'prove'; input: CircuitInput })
export type ProverResponse =
  | { id: number; type: 'progress'; progress: ProveProgress }
  | { id: number; type: 'done'; result?: unknown }
  | { id: number; type: 'error'; message: string }

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: ProveProgress) => void }
let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./prover.worker.ts', import.meta.url), { type: 'module', name: 'shield-prover' })
  w.onmessage = (e: MessageEvent<ProverResponse>) => {
    const m = e.data
    const p = pending.get(m.id)
    if (!p) return
    if (m.type === 'progress') return p.onProgress?.(m.progress)
    pending.delete(m.id)
    m.type === 'done' ? p.resolve(m.result) : p.reject(new Error(m.message))
  }
  // a crash (usually out of memory) fails everything in flight; the next call starts a fresh worker
  w.onerror = (e) => {
    e.preventDefault()
    const err = new Error("This device ran out of memory making the private proof. Close other tabs and try again.")
    pending.forEach((p) => p.reject(err))
    pending.clear()
    w.terminate()
    worker = null
  }
  return (worker = w)
}

function send<T>(msg: { type: 'preload' } | { type: 'prove'; input: CircuitInput }, onProgress?: (p: ProveProgress) => void): Promise<T> {
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress })
    getWorker().postMessage({ id, base: BASE, zkeySha256: ZKEY_SHA256, ...msg } satisfies ProverRequest)
  })
}

export const preloadProver = (onProgress?: (p: ProveProgress) => void) => send<void>({ type: 'preload' }, onProgress)

/** Groth16 proof for a transact witness (shield/lib buildTransactWitness().input). The worker verifies it first. */
export const proveTransact = (input: CircuitInput, opts: { onProgress?: (p: ProveProgress) => void } = {}) =>
  send<ProveResult>({ type: 'prove', input }, opts.onProgress)
