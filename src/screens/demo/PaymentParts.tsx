import { BCH_USD, CHAINS, ago, fmtBch, fmtUsd, type Payment } from '../../data'
import { ArrowUpRight } from 'lucide-react'
import { Modal, TokenIcon } from '../../ui'

function txHash(id: string) {
  let h = 2166136261
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const hex = Array.from({ length: 8 }, (_, i) => ((h >>> ((i % 4) * 8)) ^ (i * 2654435761)) >>> 0).map((n) => (n % 256).toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`
}

export function PaymentRow({ p, onOpen }: { p: Payment; onOpen: (p: Payment) => void }) {
  if (p.out) {
    return (
      <button className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => onOpen(p)}>
        <span className="out-ico"><ArrowUpRight size={22} strokeWidth={2.2} /></span>
        <div className="row-main">
          <div className="row-title">{p.note}</div>
          <div className="row-meta">{p.out.txs > 1 ? `${p.out.txs} separate payments` : 'One payment'} · {ago(p.minutesAgo)}</div>
        </div>
        <div className="row-end">
          <div className="row-amt">−{fmtBch(Math.abs(p.bch))}</div>
          <div className="row-meta">BCH</div>
        </div>
      </button>
    )
  }
  return (
    <button className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => onOpen(p)}>
      <TokenIcon token={p.token} chain={p.chain} size={46} />
      <div className="row-main">
        <div className="row-title">{p.note ?? 'Payment received'}</div>
        <div className="row-meta">{p.amountIn} {p.token} on {CHAINS[p.chain].name} · {ago(p.minutesAgo)}</div>
      </div>
      <div className="row-end">
        <div className="row-amt" style={{ color: 'var(--green-11)' }}>+{fmtBch(p.bch)}</div>
        <div className="row-meta">BCH</div>
      </div>
    </button>
  )
}

export function PaymentModal({ p, onClose }: { p: Payment; onClose: () => void }) {
  if (p.out) {
    return (
      <Modal title={p.out.withdraw ? 'Withdrawal' : 'Sent'} onClose={onClose}>
        <div className="center" style={{ marginBottom: 24 }}>
          <span className="out-ico" style={{ width: 64, height: 64, margin: '0 auto' }}><ArrowUpRight size={30} strokeWidth={2.2} /></span>
          <div className="hero-num" style={{ fontSize: 40, lineHeight: '48px', marginTop: 12 }}>−{fmtBch(Math.abs(p.bch))}</div>
          <div className="muted">BCH · {ago(p.minutesAgo)}</div>
        </div>
        <div className="rows">
          <div className="row"><span className="row-main muted">To</span><span>{p.out.to}</span></div>
          <div className="row"><span className="row-main muted">Sent as</span><span>{p.out.txs > 1 ? `${p.out.txs} separate payments` : 'One payment'}</span></div>
          <div className="row"><span className="row-main muted">Tx hash</span><span className="mono">{txHash(p.id)}</span></div>
          <div className="row"><span className="row-main muted">Amount</span><span className="tnum">{fmtUsd(Math.abs(p.bch) * BCH_USD)}</span></div>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Payment" onClose={onClose}>
      <div className="center" style={{ marginBottom: 24 }}>
        <div style={{ display: 'inline-block' }}><TokenIcon token={p.token} chain={p.chain} size={64} /></div>
        <div className="hero-num" style={{ fontSize: 40, lineHeight: '48px', marginTop: 12 }}>+{fmtBch(p.bch)}</div>
        <div className="muted">BCH · {ago(p.minutesAgo)}</div>
      </div>
      <div className="rows">
        <div className="row"><span className="row-main muted">They sent</span><span>{p.amountIn} {p.token} on {CHAINS[p.chain].name}</span></div>
        <div className="row"><span className="row-main muted">Tx hash</span><span className="mono">{txHash(p.id)}</span></div>
        <div className="row"><span className="row-main muted">Amount</span><span className="tnum">{fmtUsd(p.bch * BCH_USD)}</span></div>
      </div>
    </Modal>
  )
}
