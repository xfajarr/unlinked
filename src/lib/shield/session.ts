// The unlocked account's Shield state: keys, note wallet, pool sync and transactions, shared by every component.
// Browser only (libauth, circomlibjs, shield/tx and the prover worker): load this module lazily.
import type { ReceiverKeys } from '../stealth'
import { currentKeys } from '../vault'
import { loadDeployment, type Deployment } from './deployment'
import { deriveShieldKeys, type ShieldKeys } from './keys'
import type { ShieldTxProgress } from './progress'
import { defaultPoolSource, type TipSource } from './source'
import { buildShieldTx, shieldFees, type ShieldFees, type ShieldTxRequest } from './tx'
import { NoteWallet, type OwnNote, type PoolSource } from './wallet'

type Session = { keys: ReceiverKeys & ShieldKeys; wallet: NoteWallet; source: TipSource | null; deployment: Deployment | null; fees: ShieldFees | null }
let base: ReceiverKeys | null = null
let session: Promise<Session> | null = null
let sourceOverride: { source: TipSource; deployment: Deployment } | null = null

export function setShieldSource(s: { source: TipSource; deployment: Deployment } | null) {
  sourceOverride = s
  session = null
}

function open(): Promise<Session> {
  const k = currentKeys()
  if (!k) return Promise.reject(new Error('Unlock your inbox first'))
  if (session && base === k) return session
  base = k
  const s = (async () => {
    const keys = { ...k, ...(await deriveShieldKeys(k.spendPriv)) }
    const deployment = sourceOverride?.deployment ?? (await loadDeployment())
    const source = sourceOverride?.source ?? (deployment ? defaultPoolSource(deployment) : null)
    return { keys, wallet: await NoteWallet.create(keys), source, deployment, fees: deployment ? await shieldFees(deployment) : null }
  })()
  s.catch(() => {
    if (session === s) session = null
  })
  return (session = s)
}

// wallet.sync and pool transactions never overlap (two would apply the same events, or spend the same pool coin)
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(f: () => Promise<T>): Promise<T> {
  const run = queue.then(f, f)
  queue = run.catch(() => {})
  return run
}

const notDeployed = () => new Error("Private balances aren't live on this network yet")

export type ShieldView = {
  sats: bigint
  notes: OwnNote[]
  deployed: boolean
  /** network fees in sats; `minShield` is the smallest coin worth making private */
  fees: { send: number; withdraw: number; minShield: number } | null
}

async function view(s: Session): Promise<ShieldView> {
  const f = s.fees
  return {
    sats: s.wallet.balance,
    notes: s.wallet.notes,
    deployed: !!s.deployment,
    // a coin must leave a note after the deposit fee, plus a margin so the note is worth spending later
    fees: f && { send: Number(f.send), withdraw: Number(f.withdraw()), minShield: Number(f.deposit) + 5_000 },
  }
}

export function syncShield(): Promise<ShieldView> {
  return serial(async () => {
    const s = await open()
    if (s.source) await s.wallet.sync(s.source as PoolSource)
    return view(s)
  })
}

export function submitShieldTx(req: ShieldTxRequest, onProgress?: (p: ShieldTxProgress) => void): Promise<string> {
  return serial(async () => {
    const s = await open()
    if (!s.source || !s.deployment) throw notDeployed()
    onProgress?.({ stage: 'sync' })
    await s.wallet.sync(s.source)
    const tip = s.source.tip()
    if (!tip) throw notDeployed()
    const tx = await buildShieldTx(req, { wallet: s.wallet, tip, keys: s.keys, deployment: s.deployment, onProgress })
    onProgress?.({ stage: 'broadcast' })
    const { broadcast } = await import('../fulcrum')
    const txid = await broadcast(tx.hex)
    // the next transaction must spend this one's pool coin: wait (up to ~40 s) until the server indexes it
    for (let i = 0; i < 20 && s.wallet.cursor !== tx.S1; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      await s.wallet.sync(s.source).catch(() => {})
    }
    return txid
  })
}

/** Starts the 108 MB proving-key download (cached in IndexedDB) before the user pays. */
export async function preloadShieldProver(onProgress?: (p: ShieldTxProgress) => void): Promise<void> {
  const { preloadProver } = await import('./prover')
  await preloadProver(onProgress)
}
