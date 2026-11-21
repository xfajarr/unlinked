import { useState } from 'react'
import { ArrowLeft, Check, ChevronRight, ClipboardPaste, Loader2, Wallet, X } from 'lucide-react'
import { BCH_USD, PAYMENTS, fmtBch, fmtUsd, recordSent } from '../data'
import { Avatar, Modal, TickSlider, SuccessMark, ModalCancel } from '../ui'
import { go } from '../App'

const FEE_PER_TX = 0.0000025
const RECENT = ['@rina', '@budi_design', '@kopikenangan']
// demo wallets saved by the user (withdraw goes to their own addresses)
const MY_WALLETS = [
  { name: 'Paytaca', addr: 'bitcoincash:qr6m7j9a4kq0f3w2hxy8u5c1zv0n4e7tlsd2k8p9gx' },
  { name: 'Cashonize', addr: 'bitcoincash:qz3e8t5w9yq2u7c0kx4h6j1mn8d5r2fpv0a7gle3s' },
]
const shortAddr = (a: string) => `${a.replace('bitcoincash:', '').slice(0, 6)}…${a.slice(-4)}`

export default function Send({ mode = 'send' }: { mode?: 'send' | 'withdraw' }) {
  const withdraw = mode === 'withdraw'
  const total = PAYMENTS.reduce((s, p) => s + p.bch, 0)
  const [to, setTo] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('to') ?? '')
  const [amountStr, setAmountStr] = useState('')
  const [pasteErr, setPasteErr] = useState(false)
  const priv = true // sends are always split into separate payments
  const [phase, setPhase] = useState<'form' | 'confirm' | 'sending' | 'done'>('form')

  // recipient
  const t = to.trim()
  const isHandle = !withdraw && /^@[a-z0-9_]{3,20}$/i.test(t)
  const saved = MY_WALLETS.find((w) => w.addr === t)
  const isAddress = /^(bitcoincash:)?[qp][a-z0-9]{41}$/i.test(t) || (!t.startsWith('@') && t.length > 25)
  const validTo = withdraw ? isAddress : isHandle // Send is for @usernames; addresses go through Withdraw

  // amount (typed, or set by slider / chips)
  const amount = Math.min(total, Number(amountStr) || 0)
  const over = (Number(amountStr) || 0) > total + 1e-9
  const pct = total ? Math.round((amount / total) * 100) : 0
  const setFromPct = (v: number) => setAmountStr(v === 0 ? '' : v === 100 ? fmtBch(total) : fmtBch(Math.floor(total * v * 100 + 1e-6) / 10000))

  // how many separate payments a private send needs (fewest one-time addresses that cover it)
  let covered = 0, n = 0
  for (const p of [...PAYMENTS].sort((a, b) => b.bch - a.bch)) {
    if (covered >= amount - 1e-9) break
    covered += p.bch
    n++
  }
  const txs = amount > 0 ? (priv ? n : 1) : 0
  const fee = txs * FEE_PER_TX
  const ready = validTo && amount > 0 && !over

  const pasteFromClipboard = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (text) setTo(text)
    } catch {
      setPasteErr(true)
    }
  }

  return (
    <main className="main" style={{ maxWidth: 720 }}>
      <div className="page-head inline" style={withdraw ? { alignItems: 'center', justifyContent: 'flex-start', gap: 16 } : undefined}>
        {withdraw && <button className="orb" onClick={() => go('/dashboard')} aria-label="Back to home"><ArrowLeft size={22} strokeWidth={2.2} /></button>}
        <div>
          <h1 className="page-title">{withdraw ? 'Withdraw' : 'Send'}</h1>
          <p className="page-sub tnum">{withdraw ? 'To your own wallet · ' : ''}{fmtBch(total)} BCH available</p>
        </div>
      </div>

      <div className="send-stack">
      <section className="card send-section">
        {/* 1 · who */}
        <div className="send-block">
          <label className="send-title" htmlFor="send-to">{withdraw ? 'To your wallet' : 'To'}</label>
          <div className="field-wrap" style={{ marginTop: 10 }}>
            <input
              id="send-to" className="field" style={{ paddingRight: 108 }}
              placeholder={withdraw ? 'bitcoincash:q…' : '@username'} value={to} spellCheck={false} autoComplete="off"
              onChange={(e) => { setTo(e.target.value); setPasteErr(false) }}
            />
            <span className="field-end">
              {to ? (
                <button className="field-pill" onClick={() => setTo('')} aria-label="Clear recipient"><X size={15} strokeWidth={2.4} />Clear</button>
              ) : (
                <button className="field-pill" onClick={pasteFromClipboard}><ClipboardPaste size={15} strokeWidth={2.2} />Paste</button>
              )}
            </span>
          </div>
          {pasteErr ? (
            <p className="send-note" style={{ color: 'var(--red-11)' }}>Couldn’t read your clipboard. Paste with ⌘V or Ctrl+V.</p>
          ) : isHandle ? (
            <p className="send-note"><span className="badge green"><Check size={13} strokeWidth={2.8} />{t.toLowerCase()}</span>Received privately</p>
          ) : saved ? (
            <p className="send-note"><span className="badge green"><Check size={13} strokeWidth={2.8} />{saved.name}</span>Saved wallet</p>
          ) : withdraw && isAddress ? (
            <p className="send-note"><span className="badge neutral">BCH address</span>Any wallet</p>
          ) : (
            <div className="recent">
              <span className="recent-label">{withdraw ? 'Saved' : 'Recent'}</span>
              {withdraw ? MY_WALLETS.map((w) => (
                <button key={w.addr} className="recent-chip" onClick={() => setTo(w.addr)}>
                  <span className="wallet-dot"><Wallet size={13} strokeWidth={2.4} /></span>{w.name}<span className="muted mono" style={{ fontSize: 12 }}>{shortAddr(w.addr)}</span>
                </button>
              )) : RECENT.map((h) => (
                <button key={h} className="recent-chip" onClick={() => setTo(h)}>
                  <Avatar handle={h.slice(1)} src={`/avatars/${h.slice(1)}.jpg`} size={26} />{h}
                </button>
              ))}
            </div>
          )}
        </div>

      </section>

      <section className="card send-section">
        {/* 2 · how much */}
        <div className="send-block">
          <div className="hstack" style={{ justifyContent: 'space-between' }}>
            <label className="send-title" htmlFor="send-amount">Amount</label>
            <button className="btn-ghost tnum" style={{ fontSize: 14 }} onClick={() => setFromPct(100)}>Max {fmtBch(total)}</button>
          </div>
          <div className="amount-box">
            <input
              id="send-amount" className="amount-input tnum" inputMode="decimal" placeholder="0.00"
              value={amountStr} onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, '').slice(0, 12))}
            />
            <span className="amount-unit">BCH</span>
          </div>
          <div className="amount-usd tnum" style={over ? { color: 'var(--red-11)' } : undefined}>
            {over ? `More than your ${fmtBch(total)} BCH` : `≈ ${fmtUsd(amount * BCH_USD)}`}
          </div>
          <div style={{ marginTop: 18 }}>
            <TickSlider value={pct} onChange={setFromPct} label="Amount to send" ticks={40} />
          </div>
          <div className="chip-row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            {[25, 50, 75, 100].map((v) => (
              <button key={v} className={`btn sm ${pct === v && amount > 0 ? 'btn-tint' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => setFromPct(v)}>
                {v === 100 ? 'Max' : `${v}%`}
              </button>
            ))}
          </div>
        </div>

      </section>

      <section className="card send-section">
        <h2 className="send-title">Summary</h2>
        {/* summary + action */}
        {amount > 0 && !over && (
          <div className="send-summary">
            <div className="row"><span className="row-main muted">They receive</span><span className="tnum">{fmtBch(Math.max(0, amount - fee), 6)} BCH</span></div>
            <div className="row"><span className="row-main muted">Network fee</span><span className="tnum">{fmtBch(fee, 7)} BCH</span></div>
          </div>
        )}
        <div className="send-cta">
          <button className="btn btn-primary block" disabled={!ready} onClick={() => setPhase('confirm')}>
            {!validTo ? 'Add a recipient' : amount <= 0 ? 'Enter an amount' : over ? 'Not enough balance' : 'Review'}
          </button>
        </div>
      </section>
      </div>

      {phase !== 'form' && (
        <Modal title={phase === 'done' ? (withdraw ? 'Withdrawn' : 'Sent') : withdraw ? 'Review withdraw' : 'Review send'} onClose={() => phase !== 'sending' && setPhase('form')}>
          {phase === 'done' ? (
            <div className="center">
              <SuccessMark size={140} />
              <p className="page-sub" style={{ margin: '4px 0 6px' }}>
                {fmtBch(amount)} BCH is on its way to {isHandle ? t.toLowerCase() : saved ? `your ${saved.name} wallet` : withdraw ? 'your wallet' : 'that address'}.
              </p>
              <a className="text-link" href="#/transactions">View transaction<ChevronRight size={16} strokeWidth={2.4} /></a>
              <button className="btn btn-primary block" style={{ marginTop: 24 }} onClick={() => go('/dashboard')}>Back to home</button>
            </div>
          ) : (
            <>
              <div className="center" style={{ marginBottom: 12 }}>
                <div className="hero-num tnum" style={{ fontSize: 40, lineHeight: '48px' }}>{fmtBch(amount)}<small> BCH</small></div>
                <div className="muted tnum">≈ {fmtUsd(amount * BCH_USD)}</div>
              </div>
              <div className="rows">
                <div className="row"><span className="row-main muted">To</span><span className={isHandle ? '' : 'mono'} style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isHandle ? t.toLowerCase() : saved ? `${saved.name} · ${shortAddr(saved.addr)}` : t}</span></div>
                <div className="row"><span className="row-main muted">Sent as</span><span>{priv ? `${txs} separate payment${txs > 1 ? 's' : ''}` : 'One payment'}</span></div>
                <div className="row"><span className="row-main muted">Network fee</span><span className="tnum">{fmtBch(fee, 7)} BCH</span></div>
              </div>
              <div className="hstack" style={{ marginTop: 20 }}>
                <ModalCancel className="btn btn-secondary md" style={{ flex: 1 }} disabled={phase === 'sending'}>Back</ModalCancel>
                <button className="btn btn-primary md" style={{ flex: 1 }} disabled={phase === 'sending'} onClick={() => { setPhase('sending'); setTimeout(() => { recordSent(isHandle ? t.toLowerCase() : saved ? saved.name : shortAddr(t), amount, txs, withdraw); setPhase('done') }, 1600) }}>
                  {phase === 'sending' ? <><Loader2 size={18} className="spin" />Sending…</> : 'Send'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </main>
  )
}
