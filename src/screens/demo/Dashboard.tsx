import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Copy, ScanLine } from 'lucide-react'
import Scanner from '../Scanner'
import { BCH_USD, PAYMENTS, TOKENS, fmtBch, fmtUsd, type Payment, type TokenId } from '../../data'
import { Modal, RollingNumber, TokenIcon } from '../../ui'
import { PaymentModal, PaymentRow } from './PaymentParts'
import { go, useStore } from '../../App'

function CopyHandle({ handle }: { handle: string }) {
  const [ok, setOk] = useState(false)
  useEffect(() => { if (!ok) return; const t = setTimeout(() => setOk(false), 1400); return () => clearTimeout(t) }, [ok])
  return (
    <button className="handle-link" onClick={() => { setOk(true); navigator.clipboard?.writeText(`https://unlinked.cash/@${handle}`).catch(() => setOk(false)) }}>
      unlinked.cash/@{handle}{ok ? <Check size={14} strokeWidth={2.6} /> : <Copy size={13} />}
    </button>
  )
}

export default function Dashboard() {
  const { user } = useStore()
  const byToken = useMemo(() => {
    const total = PAYMENTS.reduce((t, p) => t + p.bch, 0)
    const m = new Map<TokenId, { token: TokenId; amount: number; bch: number; count: number }>()
    for (const p of PAYMENTS) {
      const e = m.get(p.token) ?? { token: p.token, amount: 0, bch: 0, count: 0 }
      e.amount += p.amountIn; e.bch += p.bch; e.count++
      m.set(p.token, e)
    }
    return [...m.values()].sort((a, b) => b.bch - a.bch).map((e) => ({
      ...e, share: e.bch / total,
      amountLabel: e.amount.toLocaleString('en-US', { maximumFractionDigits: e.token === 'USDC' || e.token === 'USDT' ? 2 : 4 }),
    }))
  }, [])
  const total = PAYMENTS.reduce((t, p) => t + p.bch, 0)
  const gained = PAYMENTS.filter((p) => p.minutesAgo <= 30 * 24 * 60).reduce((t, p) => t + p.bch, 0)
  const [w, f] = fmtBch(total).split('.')
  const [scanning, setScanning] = useState(false)
  const [tokenOpen, setTokenOpen] = useState<TokenId | null>(null)
  const [payOpen, setPayOpen] = useState<Payment | null>(null)
  const tok = tokenOpen ? byToken.find((t) => t.token === tokenOpen) : null

  return (
    <main className="main" style={{ maxWidth: 720 }}>
      <div className="page-head inline">
        <div>
          <h1 className="page-title">Home</h1>
          <p className="page-sub"><CopyHandle handle={user!.handle} /></p>
        </div>
      </div>
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
            <h2 className="bc-title">Private balance</h2>

          </div>

          <div className="bc-figure">
            <div className="hero-num bc-num"><RollingNumber value={`${w}.${f}`} /><small> BCH</small></div>
            <div className="bc-sub tnum">
              ≈ {fmtUsd(total * BCH_USD)} · <span style={{ color: 'var(--green-11)' }}>+{fmtBch(gained)} past month</span>
            </div>
          </div>

          <div className="bc-actions">
            <button className="btn btn-primary" onClick={() => go('/send')}>Send</button>
            <button className="btn btn-secondary" onClick={() => go('/withdraw')}>Withdraw</button>
            <button className="btn btn-secondary bc-scan" onClick={() => setScanning(true)} aria-label="Scan QR code" title="Scan QR code"><ScanLine size={22} strokeWidth={2.2} /></button>
          </div>
        </section>

        <section className="panel">
          <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <h2 className="bc-title">Tokens</h2>
            <span className="muted" style={{ fontSize: 13 }}>All held as BCH</span>
          </div>
          <div className="rows">
            {byToken.map((t) => (
              <button key={t.token} className="row token-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setTokenOpen(t.token)} aria-label={`${TOKENS[t.token].name} payments`}>
                <TokenIcon token={t.token} size={40} />
                <div className="row-main">
                  <div className="row-title">{TOKENS[t.token].name}</div>
                  <div className="row-meta">{t.count} payment{t.count > 1 ? 's' : ''}</div>
                </div>
                <div className="row-end">
                  <div className="row-amt tnum">{t.amountLabel} {t.token}</div>
                </div>
                <ChevronRight size={18} className="row-chev" />
              </button>
            ))}
          </div>
        </section>
      </div>
      {scanning && <Scanner onClose={() => setScanning(false)} />}
      {tok && (
        <Modal title={TOKENS[tok.token].name} onClose={() => setTokenOpen(null)}>
          <div className="center" style={{ marginBottom: 16 }}>
            <div style={{ display: 'inline-block' }}><TokenIcon token={tok.token} size={56} /></div>
            <div className="hero-num tnum" style={{ fontSize: 36, lineHeight: '44px', marginTop: 10 }}>{tok.amountLabel}<small> {tok.token}</small></div>
            <div className="muted">{tok.count} payment{tok.count > 1 ? 's' : ''}</div>
          </div>
          <div className="rows token-modal-list">
            {PAYMENTS.filter((p) => p.token === tok.token).map((p) => (
              <PaymentRow key={p.id} p={p} onOpen={(x) => { setTokenOpen(null); setPayOpen(x) }} />
            ))}
          </div>
          <div className="center" style={{ marginTop: 14 }}>
            <a className="text-link" href={`#/transactions?token=${tok.token}`}>See all in Activity<ChevronRight size={16} strokeWidth={2.4} /></a>
          </div>
        </Modal>
      )}
      {payOpen && <PaymentModal p={payOpen} onClose={() => setPayOpen(null)} />}
    </main>
  )
}
