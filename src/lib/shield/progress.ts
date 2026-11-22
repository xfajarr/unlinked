// Progress of a Shield transaction for the UI. No imports with side effects: safe to load anywhere.
import type { ProveProgress } from './prover'

export type ShieldTxProgress = { stage: 'sync' } | { stage: 'build' } | ProveProgress | { stage: 'broadcast' }

// Share of proving time reached at each groth16 step (measured in Chrome, 8 cores): A, B, C and the FFTs are about half, then the multiexps.
const PROVE_AT = [0, 0.003, 0.004, 0.53, 0.54, 0.62, 0.68, 0.88, 0.9, 1]
/** Only moves the bar between steps. Measured 12 to 23 s on a loaded 8-core laptop (the first proof in a tab is slowest). */
export const EXPECTED_PROVE_MS = 18_000

/** 0..1 for the progress bar. `downloading` (first visit) gives the 108 MB key download the first 40%; `proveMs` creeps between steps. */
export function progressFraction(p: ShieldTxProgress | null, downloading: boolean, proveMs = 0): number {
  if (!p) return 0
  const dl = downloading ? 0.4 : 0
  const proveFrom = dl + 0.06, proveSpan = 0.92 - proveFrom
  switch (p.stage) {
    case 'sync':
    case 'build':
      return 0.01
    case 'download':
      return 0.01 + (dl - 0.01) * (p.total ? p.loaded / p.total : 0)
    case 'check':
    case 'cached':
      return dl + 0.02
    case 'witness':
      return dl + 0.04
    case 'prove': {
      const lo = PROVE_AT[p.step] ?? 0, hi = PROVE_AT[p.step + 1] ?? 1
      const t = Math.min(hi, Math.max(lo, proveMs / EXPECTED_PROVE_MS))
      return proveFrom + proveSpan * t
    }
    case 'verify':
      return 0.94
    case 'broadcast':
      return 0.97
  }
}

const mb = (n: number) => Math.round(n / 1e6)

export function progressLabel(p: ShieldTxProgress | null): string {
  switch (p?.stage) {
    case undefined:
    case 'sync':
      return 'Checking your private balance'
    case 'build':
      return 'Preparing the payment'
    case 'download':
      return `Getting the proof files, first time only (${mb(p.loaded)} of ${mb(p.total)} MB)`
    case 'check':
    case 'cached':
      return 'Checking the proof files'
    case 'witness':
    case 'prove':
      return 'Building the proof on this device'
    case 'verify':
      return 'Checking the proof'
    case 'broadcast':
      return 'Sending'
  }
}
