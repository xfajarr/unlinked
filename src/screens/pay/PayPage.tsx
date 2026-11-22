import { useEffect, useRef, useState } from 'react'
import { go } from '../../App'
import type { Profile } from '../../lib/api'
import { preparePayment, satsToBch } from '../../lib/payments'
import type { OneTime } from '../../lib/stealth'
import { payWithWallet } from '../../lib/wallet'
import { CrossChain } from './CrossChain'
import { amountNum, fmtCoin, PRESETS, type Currency } from './format'
import { PaidScreen, type PaidInfo } from './PaidScreen'
import { PayForm } from './PayForm'
import { clearSaved, loadSaved, storeSaved, type Saved, type Step } from './saved'
import { QrScreen } from './QrScreen'
import { bchPrice, useXTokens } from './tokens'
import { useFlow } from './useFlow'
import { WalletScreen } from './WalletScreen'
import { suggestAmount } from './xchain'
import type { Deposit } from './XDeposit'

type Screen =
  | { k: 'form' }
  | { k: 'qr'; amount: number; ot: OneTime | null; failed: boolean; shownAt?: number }
  | { k: 'wallet'; amount: number; currency: Currency; ot: OneTime | null; error: string | null }
  | { k: 'chain' }
  | { k: 'deposit'; d: Deposit }
  | { k: 'paid'; paid: PaidInfo }

const PREP_FAILED = "Couldn't prepare a private address. Try again."
const FORM: Screen = { k: 'form' }

const stepOf = (s: Screen): Step => (s.k === 'form' ? '' : s.k)

/** The screen a step URL shows, or null when its saved data is gone. A WizardConnect session can't resume, so wallet never does. */
function fromSaved(step: string, s: Saved | null): Screen | null {
  switch (step) {
    case '': return FORM
    case 'qr': return s?.qr ? { k: 'qr', amount: s.qr.amount, ot: s.qr.ot, failed: false, shownAt: s.qr.shownAt } : null
    case 'chain': return { k: 'chain' }
    case 'deposit': return s?.deposit ? { k: 'deposit', d: s.deposit } : null
    case 'paid': return s?.paid ? { k: 'paid', paid: s.paid } : null
    default: return null
  }
}

type Props = { profile: Profile; step: string; askedUsd: number | null; askedNote: string }

export function PayPage({ profile, step, askedUsd, askedNote }: Props) {
  const handle = profile.handle
  const x = useXTokens()
  const price = bchPrice(x.tokens)
  const [init] = useState(() => {
    const saved = loadSaved(handle)
    // reopening the bare link mid-payment goes back to the address the payer may already have paid
    const want = step === '' && (saved?.step === 'qr' || saved?.step === 'deposit') ? saved.step : step
    return { saved: want ? saved : null, screen: fromSaved(want, saved) ?? FORM }
  })
  const [currency, setCurrency] = useState<Currency>(init.saved?.currency ?? 'BCH')
  const [amount, setAmount] = useState(init.saved ? init.saved.amount : askedUsd ? '' : PRESETS.BCH[1]!)
  // the note is not encrypted or posted yet (spec 5.3); only payWithWallet receives it
  const [note, setNote] = useState(init.saved ? init.saved.note : askedNote)
  const [screen, setScreen] = useState<Screen>(init.screen)
  const { begin, cancel } = useFlow()
  const n = amountNum(amount)
  const edited = useRef(!!init.saved)

  useEffect(() => {
    if (askedUsd && price && !edited.current && currency === 'BCH') setAmount(suggestAmount(askedUsd, price, 8))
  }, [askedUsd, price])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen.k])

  const urlFor = (st: Step) => `/@${handle}${st ? `/${st}` : ''}${window.location.search}`

  // Steps pushed here remember the URL they came from, so in-app Back can pop the entry instead of stacking a new one.
  function show(next: Screen, replace = false) {
    setScreen(next)
    const url = urlFor(stepOf(next))
    if (replace) go(url, { replace: true, state: history.state })
    else go(url, { state: { payFrom: window.location.pathname + window.location.search } })
  }

  function backTo(next: Screen) {
    cancel()
    setScreen(next)
    const url = urlFor(stepOf(next))
    if ((history.state as { payFrom?: string } | null)?.payFrom === url) history.back()
    else go(url, { replace: true, state: history.state })
  }

  // URL is the source of truth for the step: on mount the restored screen fixes the URL, after Back/Forward the URL picks the screen
  const seen = useRef(step)
  useEffect(() => {
    const mine = stepOf(screen)
    if (step === mine) return void (seen.current = step)
    if (step === seen.current) return void go(urlFor(mine), { replace: true, state: history.state })
    seen.current = step
    cancel()
    const next = fromSaved(step, loadSaved(handle))
    setScreen(next ?? FORM)
    if (!next) go(urlFor(''), { replace: true, state: history.state })
  }, [step])

  // Step data is merged in, so Back to the form and Forward again finds the same one-time address.
  useEffect(() => {
    const prev = loadSaved(handle)
    if (screen.k === 'form') {
      if (prev && prev.step !== '') storeSaved(handle, { ...prev, step: '' })
      return
    }
    storeSaved(handle, {
      ...prev,
      step: stepOf(screen),
      currency,
      amount,
      note,
      ...(screen.k === 'qr' && { qr: screen.ot ? { amount: screen.amount, ot: screen.ot, shownAt: screen.shownAt } : undefined }),
      ...(screen.k === 'deposit' && { deposit: screen.d }),
      // a paid flow drops its address, so Back can't reopen a step that would report "paid" again
      ...(screen.k === 'paid' && { paid: screen.paid, qr: undefined, deposit: undefined }),
    })
  }, [screen, currency, amount, note])

  const back = () => (clearSaved(handle), backTo(FORM))
  const done = () => (back(), setNote(''))

  function showQr(reuse?: OneTime) {
    const amt = currency === 'BCH' ? n : 0
    const shownAt = Date.now()
    if (reuse) return show({ k: 'qr', amount: amt, ot: reuse, failed: false, shownAt })
    const alive = begin()
    show({ k: 'qr', amount: amt, ot: null, failed: false, shownAt })
    preparePayment(profile).then(
      (ot) => alive() && setScreen({ k: 'qr', amount: amt, ot, failed: false, shownAt }),
      () => alive() && setScreen({ k: 'qr', amount: amt, ot: null, failed: true, shownAt }),
    )
  }

  async function payWallet() {
    const alive = begin()
    const started = Date.now()
    const base = { k: 'wallet' as const, amount: n, currency }
    show({ ...base, ot: null, error: null })
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
      const at = Date.now()
      const usd = currency === 'PUSD' ? n : price ? n * price : undefined
      show({ k: 'paid', paid: { amount: fmtCoin(n, currency === 'BCH' ? 8 : 2), currency, address: currency === 'PUSD' ? ot.tokenAddress : ot.address, txid, usd, at, took: at - started } }, true)
    } catch (e) {
      if (!alive()) return
      const msg = e instanceof Error && e.message ? e.message : 'The wallet did not send the payment.'
      if (/cancel/i.test(msg)) return backTo(FORM)
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
            const bch = sats ? satsToBch(sats) : screen.amount
            const at = Date.now()
            show({ k: 'paid', paid: { amount: fmtCoin(bch), currency: 'BCH', address: screen.ot?.address ?? '', txid: utxos[0]?.tx_hash, usd: price ? bch * price : undefined, at, took: screen.shownAt ? at - screen.shownAt : undefined } }, true)
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
    case 'chain':
    case 'deposit':
      return (
        <CrossChain
          profile={profile}
          usd={currency === 'BCH' ? (price ? n * price : 0) : n}
          x={x}
          deposit={screen.k === 'deposit' ? screen.d : null}
          onBack={back}
          onDeposit={(d) => show({ k: 'deposit', d })}
          onDepositBack={() => {
            const s = loadSaved(handle)
            if (s) storeSaved(handle, { ...s, deposit: undefined })
            backTo({ k: 'chain' })
          }}
          onDepositUpdate={(p) => setScreen((s) => (s.k === 'deposit' ? { k: 'deposit', d: { ...s.d, ...p } } : s))}
          onPaid={(paid) => show({ k: 'paid', paid }, true)}
        />
      )
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
          onXchain={() => show({ k: 'chain' })}
        />
      )
  }
}
