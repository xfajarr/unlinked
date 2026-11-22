import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronRight, Copy, Info, KeyRound, Loader2, ScanLine, ShieldCheck, Wallet } from 'lucide-react'
import Scanner from './Scanner'
import { Modal, ModalCancel, RollingNumber, TokenIcon, useModalClose } from '../ui'
import { PaymentModal, PaymentRow } from './PaymentParts'
import { go } from '../App'
import { useAccount } from '../app/account'
import type { Entry } from '../app/history'
import { fmtBch, fmtPusd, fmtUsd, linkFor, linkHost } from '../app/format'
import { ShieldingCard } from '../app/ShieldParts'
import { useStoredState } from '../app/hooks'
import { SHIELD_FEE_SATS } from '../lib/config'
import { SHIELD_LIVE } from '../lib/shield/deployment'
import { vaultKind, type VaultKind } from '../lib/vault'
import { RecoveryPhrase } from './Settings'

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
const heroUsd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function BackupGate({ kind }: { kind: VaultKind }) {
  return createPortal(
    <div className="backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Save your 12 words">
        <div className="modal-head"><h2 className="modal-title">Save your 12 words</h2></div>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.5 }}>You just got paid. These 12 words are the only way back to your money if you forget your {kind === 'pin' ? 'PIN' : 'password'} or lose this device, and we can’t recover them for you. Write them down now.</p>
        <RecoveryPhrase backedUp={false} kind={kind} onDone={() => {}} />
      </div>
    </div>,
    document.body,
  )
}

function BalanceInfo({ onClose }: { onClose: () => void }) {
  const { autoShield } = useAccount()
  return (
    <Modal title="Private and regular" onClose={onClose}>
      <div className="bal-info">
        <div className="bal-info-row">
          <span className="bal-ico private"><ShieldCheck size={18} strokeWidth={2.4} /></span>
          <div>
            <h3>Private</h3>
            <p>Money inside Unlinked Shield, our zero-knowledge pool on Bitcoin Cash. Nobody can see who sent it, who holds it or how much. Sending to an @username from here stays private too.</p>
          </div>
        </div>
        <div className="bal-info-row">
          <span className="bal-ico regular"><Wallet size={18} strokeWidth={2.4} /></span>
          <div>
            <h3>Regular</h3>
            <p>Payments at your one-time addresses. On-chain they look unrelated to you, but they are not in the pool yet. {autoShield ? 'The app moves each one into Shield for you' : 'Tap Make private to move them into Shield'}, for a fee of about 32,000 sats (a few cents). Payments under about 37,000 sats stay here, because shielding them would cost more than they are worth.</p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

type Tab = 'private' | 'regular'
const isTab = (v: unknown): v is Tab => v === 'private' || v === 'regular'

function BalanceToggle({ tab, onChange, flowing }: { tab: Tab; onChange: (t: Tab) => void; flowing: boolean }) {
  return (
    <div className={`bal-seg${flowing ? ' flowing' : ''}`} role="tablist" aria-label="Balance" data-tab={tab}>
      <span className="bal-seg-pill" aria-hidden />
      {flowing && <span className="bal-seg-coin" aria-hidden />}
      {(['private', 'regular'] as const).map((t) => (
        <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => onChange(t)}>
          {t === 'private' ? <ShieldCheck size={15} strokeWidth={2.4} /> : <Wallet size={15} strokeWidth={2.4} />}
          {t === 'private' ? 'Private' : 'Regular'}
        </button>
      ))}
    </div>
  )
}

const satsLabel = (n: number) => `${n.toLocaleString('en-US')} sats`

function MakePrivateConfirm({ onConfirm }: { onConfirm: () => void }) {
  const { shieldReady, shield, price, sats: bal } = useAccount()
  const close = useModalClose()
  const fee = (shield.fees?.deposit ?? SHIELD_FEE_SATS) * shieldReady.count
  const left = bal.arriving - shieldReady.sats
  return (
    <>
      <p className="mp-lead">Moves <b className="tnum">{fmtBch(shieldReady.sats)} BCH</b> into Shield{shieldReady.count > 1 ? `, in ${shieldReady.count} transactions (one per payment)` : ''}. Fee about <span className="tnum">{satsLabel(fee)}</span>{price ? <> (≈&nbsp;<span className="tnum">{fmtUsd((fee / 1e8) * price)}</span>)</> : null}.</p>
      {left > 0 && <p className="muted ap-small" style={{ marginTop: 10 }}><span className="tnum">{fmtBch(left)} BCH</span> stays regular: too small to be worth the fee.</p>}
      <p className="muted ap-small" style={{ marginTop: 10 }}>The proof is made on this device and takes about half a minute{shieldReady.count > 1 ? ' per payment' : ''}. You can keep using the app.</p>
      <div className="hstack" style={{ marginTop: 24 }}>
        <ModalCancel className="btn btn-secondary md" style={{ flex: 1 }}>Cancel</ModalCancel>
        <button className="btn btn-primary md" style={{ flex: 1 }} onClick={() => { onConfirm(); close() }}><ShieldCheck size={18} strokeWidth={2.4} />Make private</button>
      </div>
    </>
  )
}

function RegularAction({ onMakePrivate }: { onMakePrivate: () => void }) {
  const { shielding, shieldReady, autoShield, sats: bal } = useAccount()
  if (shielding) return <span className="bc-note live"><Loader2 size={14} strokeWidth={2.6} className="spin" />Making {fmtBch(shielding.sats)} BCH private</span>
  if (shieldReady.count > 0) return <button type="button" className="btn btn-shield sm" onClick={onMakePrivate}><ShieldCheck size={16} strokeWidth={2.4} />Make private</button>
  if (bal.arriving > 0) return <span className="bc-note">Too small to make private (fee would cost more than it’s worth)</span>
  return <span className="bc-note">{autoShield ? 'New payments move to Private automatically' : 'New payments stay here until you make them private'}</span>
}

export default function Dashboard() {
  const { stored, items, error, poll, shield, shielding, shieldNow, sats, price, history } = useAccount()
  const [scanning, setScanning] = useState(false)
  const [open, setOpen] = useState<Entry | null>(null)
  const loading = items === null || (SHIELD_LIVE && shield.sats === null && !shield.error)
  const recent = history.filter((e) => e.kind === 'in').slice(0, 5)
  const totalUsd = price ? (sats.total / 1e8) * price + sats.pusd : null
  const [info, setInfo] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [tab, setTabStored] = useStoredState<Tab>('unlinked.balanceTab', 'private', isTab)
  const switched = useRef(false)
  const setTab = (t: Tab) => {
    if (t === tab) return
    switched.current = true
    setTabStored(t)
  }
  const regularUsd = price ? (sats.arriving / 1e8) * price + sats.pusd : null
  const privateUsd = price ? (sats.private / 1e8) * price : null
  const shownUsd = tab === 'private' ? privateUsd : regularUsd
  const shownSats = tab === 'private' ? sats.private : sats.arriving
  const arrivingSats = items?.reduce((s, r) => s + (r.pending && r.pusd === 0 ? r.sats : 0), 0) ?? 0
  const privateDown = shield.error !== null && shield.sats === null

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
          {SHIELD_LIVE ? (
            <>
              <div className="bc-head">
                <BalanceToggle tab={tab} onChange={setTab} flowing={!!shielding} />
              </div>
              <div className="bc-figure">
                {loading ? (
                  <div className="ap-skel ap-skel-hero" aria-label="Loading balance" />
                ) : (
                  shownUsd !== null
                    ? <div className="hero-num bc-num"><span className="bc-cur">$</span><RollingNumber value={heroUsd(shownUsd)} /></div>
                    : <div className="hero-num bc-num"><RollingNumber value={heroBch(shownSats)} /><small> BCH</small></div>
                )}
                <div key={tab} className={`bc-swap${switched.current ? ' anim' : ''}`} data-tab={tab}>
                  <div className="bc-sub bc-line">
                    {tab === 'private' && privateDown ? (
                      <span>Can’t check your private balance right now</span>
                    ) : (
                      <span className="tnum">
                        {loading ? ' ' : <>{fmtBch(shownSats)} BCH{tab === 'regular' && sats.pusd > 0 ? ` and ${fmtPusd(sats.pusd)} PUSD` : ''} {tab}, total {totalUsd !== null ? fmtUsd(totalUsd) : `${fmtBch(sats.total)} BCH`}</>}
                      </span>
                    )}
                    {tab === 'regular' && arrivingSats > 0 && <span className="bc-arriving tnum" title="Not confirmed on-chain yet">{fmtBch(arrivingSats)} arriving</span>}
                    <button type="button" className="bal-info-btn" onClick={() => setInfo(true)} aria-label="What do private and regular mean?" title="What do private and regular mean?">
                      <Info size={16} strokeWidth={2.4} />
                    </button>
                  </div>
                  <div className="bc-slot">
                    {loading ? null : tab === 'private'
                      ? <span className="bc-note private"><ShieldCheck size={14} strokeWidth={2.6} />Hidden in Unlinked Shield</span>
                      : <RegularAction onMakePrivate={() => setConfirm(true)} />}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bc-head">
                <h2 className="bc-title">Private balance</h2>
              </div>
              <div className="bc-figure">
                {loading ? (
                  <div className="ap-skel ap-skel-hero" aria-label="Loading balance" />
                ) : (
                  totalUsd !== null
                    ? <div className="hero-num bc-num"><span className="bc-cur">$</span><RollingNumber value={heroUsd(totalUsd)} /></div>
                    : <div className="hero-num bc-num"><RollingNumber value={heroBch(sats.total)} /><small> BCH</small></div>
                )}
                <div className="bc-sub tnum">{loading ? ' ' : 'Paid to one-time addresses only you can find'}</div>
              </div>
            </>
          )}

          <div className="bc-actions">
            <button className="btn btn-primary" onClick={() => go('/send')}>Send</button>
            <button className="btn btn-secondary" onClick={() => go('/withdraw')}>Withdraw</button>
            <button className="btn btn-secondary bc-scan" onClick={() => setScanning(true)} aria-label="Scan QR code" title="Scan QR code"><ScanLine size={22} strokeWidth={2.2} /></button>
          </div>
        </section>

        {info && <BalanceInfo onClose={() => setInfo(false)} />}
        {confirm && (
          <Modal title="Make private?" onClose={() => setConfirm(false)}>
            <MakePrivateConfirm onConfirm={shieldNow} />
          </Modal>
        )}
        {!stored.backedUp && !loading && (sats.total > 0 || history.some((e) => e.kind === 'in')) && <BackupGate kind={vaultKind(stored)} />}
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
                <div className="row-meta">{SHIELD_LIVE ? 'Private and regular' : 'At one-time addresses'}</div>
              </div>
              <div className="row-end">
                <div className="row-amt tnum">{loading ? '…' : fmtBch(sats.total)} BCH</div>
                {price && !loading && <div className="row-meta tnum">{fmtUsd((sats.total / 1e8) * price)}</div>}
              </div>
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
            {recent.length > 0 && <a className="text-link" href="/transactions">See all<ChevronRight size={16} strokeWidth={2.4} /></a>}
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
