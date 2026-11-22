import { useEffect, useState } from 'react'
import { Check, ChevronRight, Copy, KeyRound, ScanLine } from 'lucide-react'
import Scanner from './Scanner'
import { RollingNumber, TokenIcon } from '../ui'
import { PaymentModal, PaymentRow } from './PaymentParts'
import { go } from '../App'
import { useAccount } from '../app/account'
import type { Entry } from '../app/history'
import { fmtBch, fmtPusd, fmtUsd, linkFor, linkHost } from '../app/format'
import { ShieldingCard } from '../app/ShieldParts'
import { SHIELD_LIVE } from '../lib/shield/deployment'

function CopyHandle({ handle }: { handle: string }) {
  const [ok, setOk] = useState(false)
  useEffect(() => { if (!ok) return; const t = setTimeout(() => setOk(false), 1400); return () => clearTimeout(t) }, [ok])
  return (
    <button className="handle-link" onClick={() => { setOk(true); navigator.clipboard?.writeText(linkFor(handle)).catch(() => setOk(false)) }}>
      {linkHost()}/@{handle}{ok ? <Check size={14} strokeWidth={2.6} /> : <Copy size={13} />}
    </button>
  )
}

const heroBch = (sats: number) => (sats / 1e8).toFixed(8).replace(/(\.\d{4}\d*?)0+$/, '$1')

export default function Dashboard() {
  const { stored, items, error, poll, shield, shielding, sats, price, history } = useAccount()
  const [scanning, setScanning] = useState(false)
  const [open, setOpen] = useState<Entry | null>(null)
  const loading = items === null || (SHIELD_LIVE && shield.sats === null && !shield.error)
  const recent = history.filter((e) => e.kind === 'in').slice(0, 5)
  const usd = price ? fmtUsd((sats.total / 1e8) * price + sats.pusd) : null

  return (
    <main className="main" style={{ maxWidth: 720 }}>
      <div className="page-head inline">
        <div>
          <h1 className="page-title">Home</h1>
          <p className="page-sub"><CopyHandle handle={stored.handle} /></p>
        </div>
      </div>
      {!stored.backedUp && (
        <button className="ap-notice" onClick={() => go('/settings?backup=1')}>
          <span className="ap-ico"><KeyRound size={18} strokeWidth={2.2} /></span>
          <span className="row-main">Back up your 12 words before you withdraw.</span>
          <ChevronRight size={18} className="row-chev" />
        </button>
      )}
      <div className="frame">
        <section className="balance-card">
          <span className="corner-peek" aria-hidden>
            {['cp-front', 'cp-back'].map((layer) => (
              <span key={layer} className={`cp-layer ${layer}`}>
                <img className="cp-coin c1" src="/art/coin-eth.webp" alt="" />
                <img className="cp-coin c2" src="/art/coin-sol.webp" alt="" />
                <img className="cp-coin c3" src="/art/coin-usdt.webp" alt="" />
              </span>
            ))}
            <span className="cp-shadow" />
            <span className="cp-glass" />
          </span>
          <div className="bc-head">
            <h2 className="bc-title">{SHIELD_LIVE ? 'Balance' : 'Private balance'}</h2>
          </div>

          <div className="bc-figure">
            {loading ? (
              <div className="ap-skel ap-skel-hero" aria-label="Loading balance" />
            ) : (
              <div className="hero-num bc-num"><RollingNumber value={heroBch(sats.total)} /><small> BCH</small></div>
            )}
            <div className="bc-sub tnum">
              {SHIELD_LIVE ? (
                shield.error && shield.sats === null
                  ? 'Can’t check your private balance right now'
                  : <>{fmtBch(sats.private)} private, {fmtBch(sats.arriving)} arriving{usd ? ` (≈ ${usd})` : ''}</>
              ) : usd ? `≈ ${usd}` : loading ? ' ' : 'Paid to one-time addresses only you can find'}
            </div>
          </div>

          <div className="bc-actions">
            <button className="btn btn-primary" onClick={() => go('/send')}>Send</button>
            <button className="btn btn-secondary" onClick={() => go('/withdraw')}>Withdraw</button>
            <button className="btn btn-secondary bc-scan" onClick={() => setScanning(true)} aria-label="Scan QR code" title="Scan QR code"><ScanLine size={22} strokeWidth={2.2} /></button>
          </div>
        </section>

        {shielding && <ShieldingCard sats={shielding.sats} progress={shielding.progress} />}

        <section className="panel">
          <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <h2 className="bc-title">Tokens</h2>
          </div>
          <div className="rows">
            <div className="row token-row">
              <TokenIcon token="BCH" size={40} />
              <div className="row-main">
                <div className="row-title">Bitcoin Cash</div>
                <div className="row-meta">{SHIELD_LIVE ? 'Private and arriving' : 'At one-time addresses'}</div>
              </div>
              <div className="row-end"><div className="row-amt tnum">{loading ? '…' : fmtBch(sats.total)} BCH</div></div>
            </div>
            {sats.pusd > 0 && (
              <div className="row token-row">
                <span className="ap-usd" style={{ width: 40, height: 40 }}>$</span>
                <div className="row-main">
                  <div className="row-title">Dollars</div>
                  <div className="row-meta">PUSD, a CashToken</div>
                </div>
                <div className="row-end"><div className="row-amt tnum">{fmtPusd(sats.pusd)} PUSD</div></div>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <h2 className="bc-title">Incoming</h2>
            {recent.length > 0 && <a className="text-link" href="#/transactions">See all<ChevronRight size={16} strokeWidth={2.4} /></a>}
          </div>
          {error && (
            <div className="ap-inline-err">
              <span className="row-main">Couldn’t check for payments right now.</span>
              <button className="btn btn-secondary sm" onClick={poll}>Retry</button>
            </div>
          )}
          {recent.length === 0 && (items === null || items.length > 0) ? (
            !error && <div className="rows" aria-label="Loading payments">{[0, 1, 2].map((i) => <div key={i} className="ap-skel ap-skel-row" />)}</div>
          ) : recent.length === 0 ? (
            <div className="center ap-empty">
              <p className="muted" style={{ margin: '0 0 14px' }}>No payments yet. Share your link to get paid.</p>
              <button className="btn btn-secondary md" onClick={() => go('/link')}>Share your link</button>
            </div>
          ) : (
            <div className="rows">
              {recent.map((e) => <PaymentRow key={e.id} e={e} onOpen={setOpen} />)}
            </div>
          )}
        </section>
      </div>
      {scanning && <Scanner onClose={() => setScanning(false)} />}
      {open && <PaymentModal e={open} onClose={() => setOpen(null)} />}
    </main>
  )
}
