import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ExternalLink } from 'lucide-react'
import type { Utxo } from '../../lib/fulcrum'
import { bip21, waitForPayment } from '../../lib/payments'
import type { OneTime } from '../../lib/stealth'
import { CopyButton } from '../../ui'
import { fmtCoin } from './format'
import { LiveStatus, Notice, PayShell } from './PayShell'

type Props = {
  handle: string
  amountBch: number
  ot: OneTime | null
  failed: boolean
  onRetry: () => void
  onBack: () => void
  onPaid: (utxos: Utxo[]) => void
}

export function QrScreen({ handle, amountBch, ot, failed, onRetry, onBack, onPaid }: Props) {
  const paid = useRef(onPaid)
  paid.current = onPaid
  const address = ot?.address
  const [netError, setNetError] = useState<string | null>(null)
  useEffect(() => {
    if (!address) return
    return waitForPayment(address, (u) => paid.current(u), setNetError)
  }, [address])

  const uri = ot ? bip21(ot.address, amountBch || undefined) : ''
  return (
    <PayShell onBack={onBack}>
      <div className="center">
        <h1 className="page-title pay-title-sm">Scan to pay</h1>
        <p className="page-sub">
          {amountBch ? <>Send <b className="pay-strong tnum">{fmtCoin(amountBch)} BCH</b> from any Bitcoin Cash wallet</> : 'Send any amount from any Bitcoin Cash wallet'}
        </p>
      </div>

      {failed ? (
        <div className="pay-gap">
          <Notice>Couldn't prepare a private address. Try again.</Notice>
          <button type="button" className="btn btn-primary block" onClick={onRetry}>Retry</button>
        </div>
      ) : !ot ? (
        <div className="center pay-gap" role="status">
          <div className="pay-qr pay-sk" />
          <p className="muted">Preparing a private address</p>
        </div>
      ) : (
        <>
          <div className="center">
            <div className="pay-qr">
              <QRCodeSVG value={uri} size={220} level="M" fgColor="#0b0d14" aria-label={`QR code to pay @${handle}`} />
            </div>
          </div>
          <div className="link-box">
            <span className="url mono pay-addr">{ot.address}</span>
            <CopyButton text={ot.address} label="Copy address" />
          </div>
          <div className="rows pay-rows">
            <div className="row"><span className="row-main muted">Network</span><span>Bitcoin Cash</span></div>
            <div className="row"><span className="row-main muted">Arrives</span><span>In seconds</span></div>
          </div>
          <p className="help">This address is new and works once. Nobody can link it to @{handle}.</p>
          <div className="center pay-gap-sm">
            <a className="text-link" href={uri}>Open in a wallet app<ExternalLink size={15} /></a>
          </div>
          <div className="center pay-gap-sm">
            {netError ? <Notice role="status">{netError}</Notice> : <LiveStatus>Waiting for payment</LiveStatus>}
          </div>
        </>
      )}
    </PayShell>
  )
}
