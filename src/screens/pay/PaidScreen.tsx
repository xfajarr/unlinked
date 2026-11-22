import { ExternalLink } from 'lucide-react'
import { EXPLORER_TX } from '../../lib/config'
import { SuccessMark } from '../../ui'
import { shortAddr } from './format'
import { PayShell } from './PayShell'

export type PaidInfo = { amount: string; currency: string; address: string; txid?: string }

export function PaidScreen({ handle, paid, onDone }: { handle: string; paid: PaidInfo; onDone: () => void }) {
  return (
    <PayShell>
      <div className="center" role="status">
        <SuccessMark size={150} />
        <h1 className="page-title pay-paid-amt tnum">{paid.amount} <small>{paid.currency}</small></h1>
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
      </div>
      <p className="help">Your payment went to an address nobody will ever see again.</p>
      <div className="pay-actions">
        <button type="button" className="btn btn-primary block" onClick={onDone}>Done</button>
        <a className="btn btn-secondary block" href="#/onboarding" style={{ textDecoration: 'none' }}>Get your own link</a>
      </div>
    </PayShell>
  )
}
