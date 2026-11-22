import { useEffect, useRef, useState } from 'react'
import type { Profile } from '../../lib/api'
import { preparePayment, satsToBch } from '../../lib/payments'
import type { OneTime } from '../../lib/stealth'
import { payWithWallet } from '../../lib/wallet'
import { CrossChain } from './CrossChain'
import { amountNum, fmtCoin, PRESETS, type Currency } from './format'
import { PaidScreen, type PaidInfo } from './PaidScreen'
import { PayForm } from './PayForm'
import { QrScreen } from './QrScreen'
import { bchPrice, useXTokens } from './tokens'
import { useFlow } from './useFlow'
import { WalletScreen } from './WalletScreen'
import { suggestAmount } from './xchain'

type Screen =
  | { k: 'form' }
  | { k: 'qr'; amount: number; ot: OneTime | null; failed: boolean }
  | { k: 'wallet'; amount: number; currency: Currency; ot: OneTime | null; error: string | null }
  | { k: 'xchain' }
  | { k: 'paid'; paid: PaidInfo }

const PREP_FAILED = "Couldn't prepare a private address. Try again."

export function PayPage({ profile, askedUsd, askedNote }: { profile: Profile; askedUsd: number | null; askedNote: string }) {
  const x = useXTokens()
  const price = bchPrice(x.tokens)
  const [currency, setCurrency] = useState<Currency>('BCH')
  const [amount, setAmount] = useState(askedUsd ? '' : PRESETS.BCH[1]!)
  // the note is not encrypted or posted yet (spec 5.3); only payWithWallet receives it
  const [note, setNote] = useState(askedNote)
  const [screen, setScreen] = useState<Screen>({ k: 'form' })
  const { begin, cancel } = useFlow()
  const n = amountNum(amount)
  const edited = useRef(false)

  useEffect(() => {
    if (askedUsd && price && !edited.current && currency === 'BCH') setAmount(suggestAmount(askedUsd, price, 8))
  }, [askedUsd, price])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen.k])

  const back = () => (cancel(), setScreen({ k: 'form' }))
  const done = () => (back(), setNote(''))

  function showQr(reuse?: OneTime) {
    const amt = currency === 'BCH' ? n : 0
    if (reuse) return setScreen({ k: 'qr', amount: amt, ot: reuse, failed: false })
    const alive = begin()
    setScreen({ k: 'qr', amount: amt, ot: null, failed: false })
    preparePayment(profile).then(
      (ot) => alive() && setScreen({ k: 'qr', amount: amt, ot, failed: false }),
      () => alive() && setScreen({ k: 'qr', amount: amt, ot: null, failed: true }),
    )
  }

  async function payWallet() {
    const alive = begin()
    const base = { k: 'wallet' as const, amount: n, currency }
    setScreen({ ...base, ot: null, error: null })
    let ot: OneTime
    try {
      ot = await preparePayment(profile)
    } catch {
      if (!alive()) return
      return setScreen({ ...base, ot: null, error: PREP_FAILED })
    }
    if (!alive()) return
    setScreen({ ...base, ot, error: null })
    try {
      const txid = await payWithWallet({ to: ot.address, tokenTo: ot.tokenAddress, ephemeralPub: ot.ephemeralPub, viewTag: ot.viewTag, currency, amount: n, note: note.trim() || undefined })
      if (!alive()) return
      setScreen({ k: 'paid', paid: { amount: fmtCoin(n, currency === 'BCH' ? 8 : 2), currency, address: currency === 'PUSD' ? ot.tokenAddress : ot.address, txid } })
    } catch (e) {
      if (!alive()) return
      const msg = e instanceof Error && e.message ? e.message : 'The wallet did not send the payment.'
      if (/cancel/i.test(msg)) return setScreen({ k: 'form' })
      setScreen({ ...base, ot, error: msg })
    }
  }

  switch (screen.k) {
    case 'qr':
      return (
        <QrScreen
          handle={profile.handle}
          amountBch={screen.amount}
          ot={screen.ot}
          failed={screen.failed}
          onRetry={() => showQr()}
          onBack={back}
          onPaid={(utxos) => {
            const sats = utxos.reduce((s, u) => s + u.value, 0)
            setScreen({ k: 'paid', paid: { amount: fmtCoin(sats ? satsToBch(sats) : screen.amount), currency: 'BCH', address: screen.ot?.address ?? '', txid: utxos[0]?.tx_hash } })
          }}
        />
      )
    case 'wallet':
      return (
        <WalletScreen
          amount={screen.amount}
          currency={screen.currency}
          ot={screen.ot}
          error={screen.error}
          onRetry={payWallet}
          onQr={() => showQr(screen.ot ?? undefined)}
          onBack={back}
        />
      )
    case 'xchain':
      return <CrossChain profile={profile} usd={currency === 'BCH' ? (price ? n * price : 0) : n} x={x} onBack={back} onPaid={(paid) => setScreen({ k: 'paid', paid })} />
    case 'paid':
      return <PaidScreen handle={profile.handle} paid={screen.paid} onDone={done} />
    default:
      return (
        <PayForm
          profile={profile}
          currency={currency}
          amount={amount}
          note={note}
          price={price}
          askedUsd={askedUsd}
          onCurrency={(c) => {
            setCurrency(c)
            setAmount(askedUsd ? (c === 'PUSD' ? askedUsd.toFixed(2) : price ? suggestAmount(askedUsd, price, 8) : '') : PRESETS[c][1]!)
          }}
          onAmount={(a) => {
            edited.current = true
            setAmount(a)
          }}
          onNote={setNote}
          onWallet={payWallet}
          onQr={() => showQr()}
          onXchain={() => setScreen({ k: 'xchain' })}
        />
      )
  }
}
