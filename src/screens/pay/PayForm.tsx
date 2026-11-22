import { Globe, QrCode, Wallet } from 'lucide-react'
import type { Profile } from '../../lib/api'
import { PUSD_ENABLED, XCHAIN_ENABLED } from '../../lib/config'
import { Avatar, Segmented } from '../../ui'
import { amountNum, cleanAmount, DECIMALS, fmtUsd, PRESETS, type Currency } from './format'
import { PayShell } from './PayShell'

type Props = {
  profile: Profile
  currency: Currency
  amount: string
  note: string
  price: number | null
  askedUsd: number | null
  onCurrency: (c: Currency) => void
  onAmount: (a: string) => void
  onNote: (n: string) => void
  onWallet: () => void
  onQr: () => void
  onXchain: () => void
}

const LABEL: Record<Currency, string> = { BCH: 'BCH', PUSD: 'Dollars (PUSD)' }

export function PayForm({ profile, currency, amount, note, price, askedUsd, onCurrency, onAmount, onNote, onWallet, onQr, onXchain }: Props) {
  const n = amountNum(amount)
  const usd = currency === 'BCH' ? (price ? n * price : null) : n
  const name = profile.displayName?.trim()
  return (
    <PayShell>
      <div className="center">
        <div style={{ display: 'inline-block' }}><Avatar handle={profile.handle} size={88} /></div>
        <h1 className="page-title pay-title">Pay @{profile.handle}</h1>
        {name && <p className="pay-name">{name}</p>}
        {profile.bio && <p className="pay-bio">{profile.bio}</p>}
        {askedUsd !== null && <span className="badge blue pay-ask">Asked for {fmtUsd(askedUsd)}</span>}
      </div>

      <div className="center pay-amount">
        <label className="pay-amount-line">
          <input
            className="pay-amount-input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            aria-label={`Amount in ${currency}`}
            value={amount}
            onChange={(e) => onAmount(cleanAmount(e.target.value, DECIMALS[currency]))}
            style={{ width: `${Math.max(amount.length, 1) + 0.4}ch` }}
          />
          <span className="pay-amount-cur">{currency}</span>
        </label>
        <div className="pay-usd" aria-live="polite">
          {usd === null ? <span className="pay-sk pay-sk-line" aria-label="Loading price" /> : `≈ ${fmtUsd(usd)}`}
        </div>
      </div>

      {PUSD_ENABLED && (
        <div className="pay-seg">
          <Segmented
            label="Currency"
            options={[LABEL.BCH, LABEL.PUSD]}
            value={LABEL[currency]}
            onChange={(v) => onCurrency(v === LABEL.PUSD ? 'PUSD' : 'BCH')}
          />
        </div>
      )}

      <div className="pay-chips" role="group" aria-label="Quick amounts">
        {PRESETS[currency].map((v) => (
          <button key={v} type="button" className={`btn sm ${amountNum(v) === n ? 'btn-tint' : 'btn-secondary'}`} aria-pressed={amountNum(v) === n} onClick={() => onAmount(v)}>
            {v} {currency}
          </button>
        ))}
      </div>

      <input className="field pay-note" aria-label="Note" placeholder="What's this for? (optional)" maxLength={80} value={note} onChange={(e) => onNote(e.target.value)} />

      <div className="pay-actions">
        <button type="button" className="btn btn-primary block" onClick={onWallet} disabled={!n}>
          <Wallet size={20} strokeWidth={2.2} />Pay with wallet
        </button>
        <button type="button" className="btn btn-secondary block" onClick={onQr} disabled={currency !== 'BCH'} aria-describedby={currency !== 'BCH' ? 'pay-qr-hint' : undefined}>
          <QrCode size={20} strokeWidth={2.2} />Show QR
        </button>
        {currency !== 'BCH' && <p id="pay-qr-hint" className="pay-hint">QR works for BCH. Use a wallet for dollars.</p>}
        {XCHAIN_ENABLED && (
          <button type="button" className="btn btn-secondary block" onClick={onXchain}>
            <Globe size={20} strokeWidth={2.2} />Pay from another chain
          </button>
        )}
      </div>
      <p className="help">A fresh address is made for this payment. Only @{profile.handle} can find it.</p>
      <p className="pay-fp">Key fingerprint <span className="mono">{profile.fingerprint}</span></p>
    </PayShell>
  )
}
