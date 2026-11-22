import { Loader2, Wallet } from 'lucide-react'
import type { OneTime } from '../../lib/stealth'
import { fmtCoin, shortAddr, type Currency } from './format'
import { LiveStatus, Notice, PayShell } from './PayShell'

type Props = {
  amount: number
  currency: Currency
  ot: OneTime | null
  error: string | null
  onRetry: () => void
  onQr: () => void
  onBack: () => void
}

export function WalletScreen({ amount, currency, ot, error, onRetry, onQr, onBack }: Props) {
  return (
    <PayShell onBack={onBack}>
      <div className="center">
        <span className={`pay-ring${error ? ' off' : ''}`} aria-hidden>
          {error || !ot ? <Wallet size={30} strokeWidth={2} /> : <Loader2 size={30} className="spin" />}
        </span>
        <h1 className="page-title pay-title-sm">{error ? 'Payment not sent' : ot ? 'Continue in your wallet' : 'Preparing a private address'}</h1>
        <p className="page-sub">
          {error ? (currency === 'BCH' ? 'Try again, or pay with the QR.' : 'Check your wallet and try again.') : `Sending ${fmtCoin(amount, currency === 'BCH' ? 8 : 2)} ${currency} to a one-time address`}
        </p>
      </div>
      {ot ? (
        <div className="rows pay-rows">
          <div className="row">
            <span className="row-main muted">To</span>
            <span className="mono">{shortAddr(currency === 'PUSD' ? ot.tokenAddress : ot.address)}</span>
            <span className="badge green">one-time</span>
          </div>
        </div>
      ) : (
        !error && <div className="pay-sk pay-sk-row" aria-hidden />
      )}
      {error && <Notice>{error}</Notice>}
      {error ? (
        <div className="pay-actions">
          <button type="button" className="btn btn-primary block" onClick={onRetry}>Try again</button>
          {currency === 'BCH' && <button type="button" className="btn btn-secondary block" onClick={onQr}>Use QR instead</button>}
        </div>
      ) : (
        <div className="center pay-gap-sm"><LiveStatus>{ot ? 'Waiting for your wallet' : 'Getting ready'}</LiveStatus></div>
      )}
    </PayShell>
  )
}
