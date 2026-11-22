import { ExternalLink } from 'lucide-react'
import { EXPLORER_TX } from '../../lib/config'
import { SuccessMark } from '../../ui'
import { clock, fmtUsd, shortAddr } from './format'
import { PayShell } from './PayShell'

/** `at` is when the payment landed, `took` how long it took in ms, `usd` its value then. */
export type PaidInfo = { amount: string; currency: string; address: string; txid?: string; usd?: number; at?: number; took?: number }

function duration(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export function PaidScreen({ handle, paid, onDone }: { handle: string; paid: PaidInfo; onDone: () => void }) {
  return (
    <PayShell>
      <div className="center" role="status">
        <SuccessMark size={150} />
        <h1 className="page-title pay-paid-amt tnum">{paid.amount} <small>{paid.currency}</small></h1>
        {!!paid.usd && paid.usd > 0 && <p className="pay-paid-usd tnum">≈ {fmtUsd(paid.usd)}</p>}
        <p className="page-sub">Paid to @{handle}</p>
      </div>
      <div className="rows pay-rows">
        <div className="row">
          <span className="row-main muted">Sent to</span>
          <span className="mono">{shortAddr(paid.address)}</span>
          <span className="badge green">one-time</span>
        </div>
        {paid.txid && (
          <div className="row">
            <span className="row-main muted">Transaction</span>
            <a className="text-link mono" href={EXPLORER_TX + paid.txid} target="_blank" rel="noreferrer">{paid.txid.slice(0, 8)}…{paid.txid.slice(-6)}<ExternalLink size={15} /></a>
          </div>
        )}
        {paid.at && (
          <div className="row">
            <span className="row-main muted">Arrived</span>
            <span className="tnum">{clock(paid.at)}</span>
          </div>
        )}
        {paid.took !== undefined && paid.took >= 0 && (
          <div className="row">
            <span className="row-main muted">Took</span>
            <span className="tnum">{duration(paid.took)}</span>
          </div>
        )}
      </div>
      <p className="help">Your payment went to an address nobody will ever see again.</p>
      <div className="pay-actions">
        <button type="button" className="btn btn-primary block" onClick={onDone}>Done</button>
        <a className="btn btn-secondary block" href="/onboarding" style={{ textDecoration: 'none' }}>Get your own link</a>
      </div>
    </PayShell>
  )
}
