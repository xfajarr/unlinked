// One scanner, one Shield sync and one auto-shield queue for the whole app, so switching screens never restarts them.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { NETWORK } from '../lib/config'
import type { Received } from '../lib/payments'
import { SHIELD_LIVE } from '../lib/shield/deployment'
import type { ReceiverKeys } from '../lib/stealth'
import type { useVault } from '../lib/vault'
import { logIncoming, logOutgoing, useHistory, type Entry } from './history'
import { useAutoShield, useBchPrice, useInbox, useShield, type ShieldBalance, type Shielding } from './hooks'

export type Stored = NonNullable<ReturnType<typeof useVault>['stored']>

export type Account = {
  stored: Stored
  keys: ReceiverKeys
  /** unspent stealth payments, newest first; null during the first scan */
  items: Received[] | null
  error: string | null
  poll: () => void
  rescan: () => void
  refreshSoon: () => void
  shield: ShieldBalance
  shielding: Shielding | null
  /** BCH payments below this stay out of the private balance; null when Shield is off */
  minShield: number | null
  /** USD per BCH (mainnet only): undefined while loading, null when unavailable */
  price: number | null | undefined
  history: Entry[]
  /** BCH sats outside the pool (token outputs excluded), PUSD, the private balance and their sum */
  sats: { arriving: number; private: number; total: number; pusd: number }
}

const Ctx = createContext<Account | null>(null)

export function useAccount(): Account {
  const a = useContext(Ctx)
  if (!a) throw new Error('useAccount outside an unlocked account')
  return a
}

export function AccountProvider({ stored, keys, children }: { stored: Stored | null; keys: ReceiverKeys | null; children: ReactNode }) {
  const [nonce, setNonce] = useState(0)
  const { items, error, poll } = useInbox(keys, nonce)
  const shield = useShield(keys)
  const rawPrice = useBchPrice()
  const handle = stored?.handle ?? null
  const history = useHistory(handle)
  const refreshSoon = useCallback(() => void setTimeout(poll, 1500), [poll])
  const shielding = useAutoShield(items, shield, (r, sats, txid) => {
    if (handle) logOutgoing(handle, { kind: 'shield', sats, to: r.address, txids: [txid], private: true })
    refreshSoon()
  })

  useEffect(() => {
    if (handle && items) logIncoming(handle, items)
  }, [handle, items])

  const rescan = useCallback(() => {
    setNonce((n) => n + 1)
    shield.refresh()
  }, [shield])

  const arriving = items?.reduce((s, r) => s + (r.pusd > 0 ? 0 : r.sats), 0) ?? 0
  const pusd = items?.reduce((s, r) => s + r.pusd, 0) ?? 0
  const priv = SHIELD_LIVE ? (shield.sats ?? 0) : 0

  const value: Account | null = stored && keys
    ? {
        stored, keys, items, error, poll, rescan, refreshSoon, shield, shielding, history,
        minShield: SHIELD_LIVE ? (shield.fees?.minShield ?? null) : null,
        price: NETWORK === 'mainnet' ? rawPrice : null,
        sats: { arriving, private: priv, total: arriving + priv, pusd },
      }
    : null
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
