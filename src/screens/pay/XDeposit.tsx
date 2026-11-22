import { useEffect, useRef, useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check } from 'lucide-react'
import { xchainStatus, xchainSubmit, type XQuote, type XStatus, type XToken } from '../../lib/api'
import type { Utxo } from '../../lib/fulcrum'
import { satsToBch, waitForPayment } from '../../lib/payments'
import type { OneTime } from '../../lib/stealth'
import { CopyButton } from '../../ui'
import { fmtCoin } from './format'
import type { PaidInfo } from './PaidScreen'
import { Notice, PayShell } from './PayShell'

/** `status` is the last one seen, saved so a refresh after the deposit landed doesn't show the address again. */
export type Deposit = { quote: XQuote; ot: OneTime; token: XToken; amount: string; chain: string; startedAt?: number; status?: XStatus }

const STEPS = ['Waiting for your deposit', 'Swapping to BCH via NEAR Intents', 'Delivered to a one-time address']
const POLL_MS = 5000
const stepOf = (s: XStatus) => (s === 'SUCCESS' ? 3 : s === 'KNOWN_DEPOSIT_TX' || s === 'PROCESSING' ? 1 : 0)
const isFinal = (s: XStatus) => s === 'SUCCESS' || s === 'REFUNDED' || s === 'FAILED'
const isReceived = (s: XStatus) => s === 'KNOWN_DEPOSIT_TX' || s === 'PROCESSING' || s === 'SUCCESS' || s === 'INCOMPLETE_DEPOSIT'

function sendBy(until: Date) {
  const time = until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return until.toDateString() === new Date().toDateString() ? time : `${until.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`
}

type Props = { handle: string; d: Deposit; onBack: () => void; onPaid: (p: PaidInfo) => void; onStatus?: (s: XStatus) => void }

export function XDeposit({ handle, d, onBack, onPaid, onStatus }: Props) {
  const [status, setStatus] = useState<XStatus>(d.status ?? 'PENDING_DEPOSIT')
  // 1Click says PROCESSING until the BCH has a confirmation; the one-time address sees it in the mempool minutes earlier
  const [landed, setLanded] = useState<Utxo[] | null>(null)
  const addr = d.quote.depositAddress
  const final = isFinal(status) || !!landed
  const pending = status === 'PENDING_DEPOSIT' && !landed
  const received = isReceived(status) || !!landed
  const delivered = !!landed || status === 'SUCCESS'
  const paid = useRef(onPaid)
  paid.current = onPaid
  const report = useRef(onStatus)
  report.current = onStatus
  const [since] = useState(() => d.startedAt ?? Date.now())
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (final) return
    let on = true
    let inFlight = false
    const tick = async () => {
      if (inFlight) return
      inFlight = true
      const s = await xchainStatus({ data: { depositAddress: addr } }).catch((): XStatus => 'UNKNOWN')
      inFlight = false
      if (on && s !== 'UNKNOWN') setStatus(s)
    }
    tick()
    const t = setInterval(tick, POLL_MS)
    return () => {
      on = false
      clearInterval(t)
    }
  }, [addr, final])

  useEffect(() => {
    if (status !== (d.status ?? 'PENDING_DEPOSIT')) report.current?.(status)
  }, [status])

  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [pending])

  useEffect(() => waitForPayment(d.ot.address, setLanded), [d.ot.address])

  useEffect(() => {
    if (!delivered) return
    const sats = landed?.reduce((n, u) => n + u.value, 0) ?? 0
    const info = { amount: fmtCoin(sats ? satsToBch(sats) : d.quote.amountOut), currency: 'BCH', address: d.ot.address, txid: landed?.[0]?.tx_hash }
    const t = setTimeout(() => paid.current(info), 1200)
    return () => clearTimeout(t)
  }, [delivered, landed])

  const step = delivered ? 3 : stepOf(status)
  const mins = Math.max(1, Math.ceil(d.quote.timeEstimate / 60))
  const until = new Date(d.quote.deadline)
  return (
    <PayShell onBack={onBack}>
      <div className="center">
        {received ? (
          <>
            <span className="pay-ring" aria-hidden><Check size={32} strokeWidth={2.6} /></span>
            <h1 className="page-title pay-title-sm">Deposit received</h1>
            <p className="page-sub">{d.amount} {d.token.symbol} on {d.chain}. Don't send it again.</p>
          </>
        ) : (
          <>
            <h1 className="page-title pay-title-sm">Send {d.amount} {d.token.symbol}</h1>
            <p className="page-sub">on {d.chain}, exactly this amount</p>
            {pending && <p className="pay-hint pay-once">Send once. A second transfer to this address isn't part of the swap and may be refunded.</p>}
            {pending && (
              <div className="pay-qr">
                <QRCodeSVG value={addr} size={220} level="M" fgColor="#0b0d14" aria-label={`Deposit address on ${d.chain}`} />
              </div>
            )}
          </>
        )}
      </div>
      {pending && (
        <div className="link-box">
          <span className="url mono pay-addr">{addr}</span>
          <CopyButton text={addr} label="Copy deposit address" />
        </div>
      )}
      <div className="rows pay-rows">
        <div className="row"><span className="row-main muted">@{handle} gets</span><span className="tnum">≈ {fmtCoin(d.quote.amountOut)} BCH</span></div>
        <div className="row"><span className="row-main muted">Time</span><span>About {mins} min</span></div>
      </div>
      <p className="help">Lands on a one-time address. NEAR Intents never learns it's @{handle}.</p>

      {status === 'REFUNDED' && <Notice>The swap didn't go through. Your {d.token.symbol} went back to your refund address.</Notice>}
      {status === 'FAILED' && <Notice>The swap failed. Your deposit goes back to your refund address.</Notice>}
      {status === 'INCOMPLETE_DEPOSIT' && <Notice>We got less than {d.amount} {d.token.symbol}, so the swap can't run as quoted. It goes back to your refund address.</Notice>}

      {!final || delivered ? (
        <ol className="pay-steps" role="status" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} className={i < step ? 'done' : i === step ? 'now' : ''}>
              <span className="pay-step-b">{i < step ? <Check size={14} strokeWidth={3} /> : i === step ? <span className="pay-pulse" /> : i + 1}</span>
              <span>
                {label}
                {pending && i === 0 && <span className="pay-step-meta">Checking every {POLL_MS / 1000} s, {elapsed(now - since)} so far</span>}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <button type="button" className="btn btn-secondary block pay-gap-sm" onClick={onBack}>Start over</button>
      )}
      {pending && <SubmitTx depositAddress={addr} />}
      {pending && !Number.isNaN(until.getTime()) && (
        <p className="help">Send before {sendBy(until)}. Later deposits are refunded.</p>
      )}
    </PayShell>
  )
}

function SubmitTx({ depositAddress }: { depositAddress: string }) {
  const [hash, setHash] = useState('')
  const [state, setState] = useState<{ k: 'idle' | 'busy' | 'sent' } | { k: 'error'; msg: string }>({ k: 'idle' })
  const h = hash.trim()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!h || state.k === 'busy') return
    setState({ k: 'busy' })
    try {
      await xchainSubmit({ data: { txHash: h, depositAddress } })
      setState({ k: 'sent' })
    } catch (err) {
      setState({ k: 'error', msg: err instanceof Error && err.message ? err.message : "Couldn't send it. Check the hash and try again." })
    }
  }

  if (state.k === 'sent') return <p className="pay-hint">Got it. NEAR Intents is checking that transaction now.</p>
  return (
    <form className="pay-field pay-submit" onSubmit={submit}>
      <label className="pay-hint left" htmlFor="pay-txhash">Already sent? Paste your transaction hash to speed it up</label>
      <div className="pay-submit-row">
        <input
          id="pay-txhash"
          className="field mono pay-refund"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={200}
          placeholder="Transaction hash"
          value={hash}
          onChange={(e) => (setHash(e.target.value), state.k === 'error' && setState({ k: 'idle' }))}
        />
        <button type="submit" className="btn btn-secondary sm" disabled={!h || state.k === 'busy'}>{state.k === 'busy' ? 'Sending…' : 'Submit'}</button>
      </div>
      {state.k === 'error' && <span className="pay-hint left bad" role="alert">{state.msg}</span>}
    </form>
  )
}
