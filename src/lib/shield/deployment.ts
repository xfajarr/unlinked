// The deployed pool for this build's network: shield/deployments/<network>.json, as shield/contracts/chipnet/deploy.mjs
// writes it. It is also the shield/tx builder's `deployment` (verifier redeem, code pieces and key, pool redeem).
// Missing file = Shield isn't deployed on this network yet; the app then runs without it.
import { NETWORK, SHIELD_ENABLED } from '../config'

type Outpoint = { txid: string; vout: number }
export type Deployment = {
  network: string
  category: string
  genesisTxid: string
  pool: { address: string; lockHex: string; redeemHex: string; outpoint: Outpoint; initialValue: number | string; sGenesis: string }
  verifier: { lockHex: string; redeemHex: string; codePiecesHex: string[]; outpoints: (Outpoint & { value: number | string })[]; vk: unknown }
  zkeySha256: string
}

// lazy: the verifier code and key are tens of kB, needed only when Shield runs
const files = import.meta.glob<Deployment>('../../../shield/deployments/*.json', { import: 'default' })
const PATH = `../../../shield/deployments/${NETWORK}.json`

/** True once this network's pool is deployed (known at build time, no fetch). */
export const SHIELD_LIVE = SHIELD_ENABLED && PATH in files

let loaded: Promise<Deployment | null> | null = null

export function loadDeployment(): Promise<Deployment | null> {
  loaded ??= (async () => {
    const f = files[PATH]
    if (!f) return null
    const d = await f()
    if (d.network !== NETWORK) throw new Error(`Shield deployment is for ${d.network}, this build is ${NETWORK}`)
    return d
  })()
  loaded.catch(() => {
    loaded = null
  })
  return loaded
}
