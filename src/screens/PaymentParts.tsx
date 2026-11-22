import { ArrowUpRight, ExternalLink, ShieldCheck } from 'lucide-react'
import { Modal, TokenIcon } from '../ui'
import { useAccount } from '../app/account'
import type { Entry } from '../app/history'
import { explorerTx, fmtBch, fmtPusd, relTime, shortAddr, shortTx } from '../app/format'
import { useNow } from '../app/hooks'

type Tone = 'live' | 'warn' | 'ok' | 'quiet'

export function useStatus(e: Entry): { label: string; tone: Tone } | null {
  const { items, shielding, minShield, history, autoShield } = useAccount()
  if (e.kind !== 'in') return null
  if (shielding?.address === e.id) return { label: 'Making it private', tone: 'live' }
  const live = items?.find((r) => r.address === e.id)
  if (live?.pending) return { label: 'Arriving', tone: 'live' }
  if (live && minShield !== null && live.pusd === 0) return live.sats < minShield ? { label: 'Too small to make private', tone: 'warn' } : autoShield ? null : { label: 'Regular', tone: 'quiet' }
  if (live) return null
  if (history.some((h) => h.kind === 'shield' && h.to === e.id)) return { label: 'Private', tone: 'ok' }
  return items ? { label: 'Moved', tone: 'quiet' } : null
}

const amountOf = (e: Entry) => (e.kind === 'in' && e.pusd > 0 ? { n: fmtPusd(e.pusd), unit: 'PUSD' } : { n: fmtBch(e.sats), unit: 'BCH' })

export function titleOf(e: Entry) {
  if (e.kind === 'in') return 'Payment received'
  if (e.kind === 'shield') return 'Made private'
  return e.kind === 'send' ? `Sent to @${e.to}` : `Withdrawn to ${shortAddr(e.to)}`
}

function metaOf(e: Entry) {
  if (e.kind === 'in') return `to ${shortAddr(e.id)}`
  if (e.kind === 'shield') return 'Moved to your private balance'
  if (e.private && e.kind !== 'withdraw') return 'From your private balance'
  return e.txids.length > 1 ? `${e.txids.length} separate transactions` : 'One transaction'
}

function Icon({ e, size }: { e: Entry; size: number }) {
  if (e.kind === 'in') return e.pusd > 0 ? <span className="ap-usd" style={{ width: size, height: size }}>$</span> : <TokenIcon token="BCH" size={size} />
  return <span className="out-ico" style={{ width: size, height: size }}>{e.kind === 'shield' ? <ShieldCheck size={size * 0.46} strokeWidth={2.2} /> : <ArrowUpRight size={size * 0.48} strokeWidth={2.2} />}</span>
}

export function StatusBadge({ e }: { e: Entry }) {
  const s = useStatus(e)
  if (!s) return null
  return <span className={`badge ap-tone-${s.tone}`}>{s.tone === 'live' && <span className="dot ap-pulse" />}{s.label}</span>
}

export function PaymentRow({ e, onOpen }: { e: Entry; onOpen: (e: Entry) => void }) {
  const now = useNow()
  const a = amountOf(e)
  const sign = e.kind === 'in' ? '+' : e.kind === 'shield' ? '' : '−'
  return (
    <button className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => onOpen(e)}>
      <Icon e={e} size={46} />
      <div className="row-main">
        <div className="row-title">{titleOf(e)}</div>
        <div className="row-meta">{metaOf(e)}, {relTime(e.at, now)}</div>
        <StatusBadge e={e} />
      </div>
      <div className="row-end">
        <div className="row-amt" style={e.kind === 'in' ? { color: 'var(--green-11)' } : undefined}>{sign}{a.n}</div>
        <div className="row-meta">{a.unit}</div>
      </div>
    </button>
  )
}

const TxLink = ({ txid }: { txid: string }) => (
  <a className="text-link mono" href={explorerTx(txid)} target="_blank" rel="noreferrer">{shortTx(txid)}<ExternalLink size={14} style={{ marginLeft: 4 }} /></a>
)

export function PaymentModal({ e, onClose }: { e: Entry; onClose: () => void }) {
  const a = amountOf(e)
  const status = useStatus(e)
  const when = new Date(e.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const txids = e.kind === 'in' ? (e.txid ? [e.txid] : []) : e.txids
  return (
    <Modal title={titleOf(e)} onClose={onClose}>
      <div className="center" style={{ marginBottom: 24 }}>
        <div style={{ display: 'inline-block' }}><Icon e={e} size={64} /></div>
        <div className="hero-num" style={{ fontSize: 40, lineHeight: '48px', marginTop: 12 }}>{e.kind === 'in' ? '+' : e.kind === 'shield' ? '' : '−'}{a.n}<small> {a.unit}</small></div>
        <div className="muted">{when}</div>
      </div>
      <div className="rows">
        {e.kind === 'in' && <div className="row"><span className="row-main muted">One-time address</span><span className="mono">{shortAddr(e.id)}</span></div>}
        {e.kind === 'send' && <div className="row"><span className="row-main muted">To</span><span>@{e.to}</span></div>}
        {e.kind === 'withdraw' && <div className="row"><span className="row-main muted">To</span><span className="mono">{shortAddr(e.to)}</span></div>}
        {status && <div className="row"><span className="row-main muted">Status</span><span>{status.label}</span></div>}
        {e.kind !== 'in' && <div className="row"><span className="row-main muted">From</span><span>{e.kind === 'shield' ? 'A one-time address' : e.private ? 'Private balance' : 'One-time addresses'}</span></div>}
        {txids.map((t, i) => (
          <div className="row" key={t}><span className="row-main muted">{txids.length > 1 ? `Transaction ${i + 1}` : 'Transaction'}</span><TxLink txid={t} /></div>
        ))}
      </div>
    </Modal>
  )
}
