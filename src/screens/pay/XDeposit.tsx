import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check } from 'lucide-react'
import { xchainStatus, type XQuote, type XStatus, type XToken } from '../../lib/api'
import type { OneTime } from '../../lib/stealth'
import { CopyButton } from '../../ui'
import { fmtCoin } from './format'
import type { PaidInfo } from './PaidScreen'
import { Notice, PayShell } from './PayShell'

export type Deposit = { quote: XQuote; ot: OneTime; token: XToken; amount: string; chain: string }

const STEPS = ['Waiting for your deposit', 'Swapping to BCH via NEAR Intents', 'Delivered to a one-time address']
const stepOf = (s: XStatus) => (s === 'SUCCESS' ? 3 : s === 'KNOWN_DEPOSIT_TX' || s === 'PROCESSING' ? 1 : 0)
const isFinal = (s: XStatus) => s === 'SUCCESS' || s === 'REFUNDED' || s === 'FAILED'

export function XDeposit({ handle, d, onBack, onPaid }: { handle: string; d: Deposit; onBack: () => void; onPaid: (p: PaidInfo) => void }) {
  const [status, setStatus] = useState<XStatus>('PENDING_DEPOSIT')
  const addr = d.quote.depositAddress
  const final = isFinal(status)
  const paid = useRef(onPaid)
  paid.current = onPaid

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
    const t = setInterval(tick, 5000)
    return () => {
      on = false
      clearInterval(t)
    }
  }, [addr, final])

  useEffect(() => {
    if (status !== 'SUCCESS') return
    const t = setTimeout(() => paid.current({ amount: fmtCoin(d.quote.amountOut), currency: 'BCH', address: d.ot.address }), 1200)
    return () => clearTimeout(t)
  }, [status, d])

  const step = stepOf(status)
  const mins = Math.max(1, Math.ceil(d.quote.timeEstimate / 60))
  const until = new Date(d.quote.deadline)
  return (
    <PayShell onBack={onBack}>
      <div className="center">
        <h1 className="page-title pay-title-sm">Send {d.amount} {d.token.symbol}</h1>
        <p className="page-sub">on {d.chain}, exactly this amount</p>
        <div className="pay-qr">
          <QRCodeSVG value={addr} size={220} level="M" fgColor="#0b0d14" aria-label={`Deposit address on ${d.chain}`} />
        </div>
      </div>
      <div className="link-box">
        <span className="url mono pay-addr">{addr}</span>
        <CopyButton text={addr} label="Copy deposit address" />
      </div>
      <div className="rows pay-rows">
        <div className="row"><span className="row-main muted">@{handle} gets</span><span className="tnum">≈ {fmtCoin(d.quote.amountOut)} BCH</span></div>
        <div className="row"><span className="row-main muted">Time</span><span>About {mins} min</span></div>
      </div>
      <p className="help">Lands on a one-time address. NEAR Intents never learns it's @{handle}.</p>

      {status === 'REFUNDED' && <Notice>The swap didn't go through. Your {d.token.symbol} went back to your refund address.</Notice>}
      {status === 'FAILED' && <Notice>The swap failed. Your deposit goes back to your refund address.</Notice>}
      {status === 'INCOMPLETE_DEPOSIT' && <Notice>We got less than {d.amount} {d.token.symbol}. Send the rest, or it goes back to your refund address.</Notice>}

      {!final || status === 'SUCCESS' ? (
        <ol className="pay-steps" role="status" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} className={i < step ? 'done' : i === step ? 'now' : ''}>
              <span className="pay-step-b">{i < step ? <Check size={14} strokeWidth={3} /> : i === step ? <span className="pay-pulse" /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      ) : (
        <button type="button" className="btn btn-secondary block pay-gap-sm" onClick={onBack}>Start over</button>
      )}
      {!Number.isNaN(until.getTime()) && !final && (
        <p className="help">Send before {until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Later deposits are refunded.</p>
      )}
    </PayShell>
  )
}
