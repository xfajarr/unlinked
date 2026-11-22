import { QRCodeSVG } from 'qrcode.react'
import { Loader2, X } from 'lucide-react'
import { CopyButton } from '../ui'

export type WalletStage = 'pair' | 'building' | 'approve' | 'sending'

const COPY: Record<WalletStage, string> = {
  pair: 'Scan with Selene, Cashonize or Paytaca to connect.',
  building: 'Wallet connected. Preparing your payment.',
  approve: 'Approve the payment in your wallet.',
  sending: 'Sending.',
}

/** Pairing + progress overlay for payWithWallet (mounted imperatively, so it works from a plain async call). */
export function WalletOverlay({ uri, qrUri, stage, walletName, onCancel }: { uri: string; qrUri: string; stage: WalletStage; walletName: string | null; onCancel: () => void }) {
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal wc-modal" role="dialog" aria-modal="true" aria-label="Connect your wallet">
        <div className="modal-head">
          <h2 className="modal-title">{stage === 'pair' ? 'Connect your wallet' : walletName ? `Connected to ${walletName}` : 'Wallet connected'}</h2>
          <button type="button" className="orb sm" aria-label="Cancel" onClick={onCancel}><X size={20} strokeWidth={2.4} /></button>
        </div>
        {stage === 'pair' ? (
          <>
            <div className="wc-qr"><QRCodeSVG value={qrUri} size={232} level="M" fgColor="#0b0d14" aria-label="WizardConnect pairing code" /></div>
            <div className="link-box">
              <span className="url mono">{uri.slice(0, 42)}…</span>
              <CopyButton text={uri} label="Copy pairing link" />
            </div>
            <a className="btn btn-tint block md" href={uri} style={{ textDecoration: 'none' }}>Open wallet on this device</a>
          </>
        ) : (
          <div className="wc-busy" aria-hidden><Loader2 size={30} className="spin" /></div>
        )}
        <p className="wc-copy">{COPY[stage]}</p>
        <button type="button" className="btn btn-secondary block md" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
