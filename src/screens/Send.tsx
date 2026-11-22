import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, ClipboardPaste, ExternalLink, KeyRound, Loader2, Wallet, X } from 'lucide-react'
import { Avatar, Modal, ModalCancel, Segmented, Switch, SuccessMark, TickSlider, TokenIcon } from '../ui'
import { go } from '../App'
import { useAccount } from '../app/account'
import { logOutgoing } from '../app/history'
import { HANDLE_RE, errMsg, explorerTx, fmtBch, fmtUsd, itemAmount, normalizeHandleInput, parseBchAddress, relTime, shortAddr, shortTx, sumLabel } from '../app/format'
import { ShieldProgress } from '../app/ShieldParts'
import { getProfile, type Profile } from '../lib/api'
import { CASHADDR_PREFIX, SHIELD_FEE_SATS } from '../lib/config'
import { SHIELD_LIVE } from '../lib/shield/deployment'
import type { ShieldTxProgress } from '../lib/shield/progress'
import { sendToHandle, withdraw as withdrawCoins } from '../lib/spend'

type Lookup = { s: 'idle' } | { s: 'checking' } | { s: 'found'; p: Profile } | { s: 'none' } | { s: 'self' } | { s: 'error' }
type From = 'Private' | 'Regular'
// sendToHandle spends one payment and needs about this much on top of the amount for the fee and change
const SEND_MARGIN = 2000
// P2PKH, one input and up to three outputs at 1.1 sat/B (src/lib/spend.ts FEE_RATE)
const STEALTH_FEE = 300

const shieldSession = () => import('../lib/shield/session')
const toSats = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1e8) : 0
}
const satsStr = (sats: number) => (sats / 1e8).toFixed(8).replace(/\.?0+$/, '')

export default function Send({ mode = 'send' }: { mode?: 'send' | 'withdraw' }) {
  const isWithdraw = mode === 'withdraw'
  const { stored, items, shield, price, history, refreshSoon } = useAccount()
  const [to, setTo] = useState(() => new URLSearchParams(window.location.search).get('to') ?? '')
  const [amountStr, setAmountStr] = useState('')
  const [pasteErr, setPasteErr] = useState(false)
  const [phase, setPhase] = useState<'form' | 'confirm' | 'sending' | 'done'>('form')
  const [proof, setProof] = useState<ShieldTxProgress | null>(null)
  const [done, setDone] = useState<{ txids: string[]; sub: string } | null>(null)
  const [sendErr, setSendErr] = useState<string | null>(null)
  const [look, setLook] = useState<Lookup>({ s: 'idle' })
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set())
  const [split, setSplit] = useState(true)

  const fee = (isWithdraw ? shield.fees?.withdraw : shield.fees?.send) ?? SHIELD_FEE_SATS
  const availPriv = SHIELD_LIVE ? Math.max(0, (shield.sats ?? 0) - fee) : 0
  const [from, setFrom] = useState<From>('Regular')
  const touched = useRef(false)
  useEffect(() => {
    if (!touched.current && SHIELD_LIVE) setFrom(availPriv > 0 ? 'Private' : 'Regular')
  }, [availPriv])
  const fromPrivate = SHIELD_LIVE && from === 'Private'

  const list = items ?? []
  const spendable = list.filter((r) => r.pusd === 0)

  const t = to.trim()
  const handle = normalizeHandleInput(t)
  const isHandle = !isWithdraw && HANDLE_RE.test(handle) && !/^(bitcoincash|bchtest):/i.test(t)
  const parsed = isWithdraw ? parseBchAddress(t) : null

  useEffect(() => {
    if (isWithdraw || !isHandle) return setLook({ s: 'idle' })
    if (handle === stored.handle) return setLook({ s: 'self' })
    setLook({ s: 'checking' })
    let live = true
    const timer = setTimeout(() => {
      getProfile({ data: { handle } })
        .then((p) => live && setLook(p ? { s: 'found', p } : { s: 'none' }))
        .catch(() => live && setLook({ s: 'error' }))
    }, 400)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [isWithdraw, isHandle, handle, stored.handle])
  const profile = look.s === 'found' ? look.p : null
  const noShield = !isWithdraw && fromPrivate && !!profile && !profile.shieldPk

  const sweep = isWithdraw && !fromPrivate
  const chosen = sweep ? list.filter((r) => !unpicked.has(r.address)) : []
  const hasPusd = chosen.some((r) => r.pusd > 0)
  const destErr = !isWithdraw || !t
    ? null
    : !parsed
      ? 'That doesn’t look like a Bitcoin Cash address.'
      : !parsed.address.startsWith(`${CASHADDR_PREFIX}:`)
        ? `Use a ${CASHADDR_PREFIX}: address on this network.`
        : hasPusd && !parsed.tokenAware
          ? 'PUSD needs a token-aware address (it starts with z). Untick the PUSD payment or use another address.'
          : null

  const maxSingle = Math.max(0, ...spendable.map((r) => r.sats - SEND_MARGIN))
  const avail = fromPrivate ? availPriv : sweep ? chosen.filter((r) => r.pusd === 0).reduce((s, r) => s + r.sats, 0) : maxSingle
  const typed = toSats(amountStr)
  const sats = sweep ? avail : Math.min(avail, typed)
  const over = !sweep && typed > avail
  const pct = avail && !sweep ? Math.round((sats / avail) * 100) : 0
  const setFromPct = (v: number) => setAmountStr(v === 0 ? '' : satsStr(v === 100 ? avail : Math.floor((avail * v) / 100)))

  const txCount = sweep ? (split ? chosen.length : chosen.length ? 1 : 0) : 1
  const netFee = fromPrivate ? fee : STEALTH_FEE * txCount
  const validTo = isWithdraw ? !!parsed && !destErr : !!profile && !noShield
  const needsBackup = isWithdraw && !stored.backedUp
  const ready = validTo && !needsBackup && (sweep ? chosen.length > 0 : sats > 0 && !over)
  const toLabel = isWithdraw ? (parsed ? shortAddr(parsed.address) : '') : `@${profile?.handle ?? handle}`

  const recent = useMemo(() => {
    const seen = new Set<string>()
    return history.filter((e) => e.kind === (isWithdraw ? 'withdraw' : 'send') && !seen.has((e as { to: string }).to) && seen.add((e as { to: string }).to)).slice(0, 3) as { to: string }[]
  }, [history, isWithdraw])

  const pasteFromClipboard = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (text) setTo(text)
    } catch {
      setPasteErr(true)
    }
  }

  async function submit() {
    if (!ready) return
    setPhase('sending')
    setSendErr(null)
    try {
      let txids: string[]
      let sub: string
      if (fromPrivate) {
        setProof({ stage: 'sync' })
        const s = await shieldSession()
        const req = isWithdraw
          ? { kind: 'withdraw' as const, address: parsed!.address, sats: BigInt(sats) }
          : { kind: 'send' as const, to: profile!, sats: BigInt(sats) }
        txids = [await s.submitShieldTx(req, setProof)]
        sub = isWithdraw
          ? `${fmtBch(sats)} BCH is on its way to ${toLabel} from your private balance.`
          : `${fmtBch(sats)} BCH sent to ${toLabel} from your private balance. Only you two know the amount.`
        shield.refresh()
      } else if (isWithdraw) {
        txids = await withdrawCoins(chosen, parsed!.address, { private: split })
        sub = split && chosen.length > 1 ? `${chosen.length} separate transactions to ${toLabel}, so they stay unlinked.` : `Sent to ${toLabel}.`
      } else {
        txids = await sendToHandle(spendable, profile!, sats)
        sub = `${fmtBch(sats)} BCH sent to ${toLabel}. Neither side can be traced.`
      }
      logOutgoing(stored.handle, {
        kind: isWithdraw ? 'withdraw' : 'send',
        sats,
        to: isWithdraw ? parsed!.address : profile!.handle,
        txids,
        private: fromPrivate,
      })
      refreshSoon()
      setDone({ txids, sub })
      setPhase('done')
    } catch (e) {
      setSendErr(errMsg(e))
      setPhase('confirm')
    } finally {
      setProof(null)
    }
  }

  const fromNote = fromPrivate
    ? `${fmtBch(availPriv)} BCH private, after a ${fmtBch(fee)} BCH network fee`
    : sweep
      ? `${sumLabel(list) || '0 BCH'} ${SHIELD_LIVE ? 'regular' : 'to withdraw'}`
      : `Up to ${fmtBch(maxSingle)} BCH in one payment`

  return (
    <main className="main" style={{ maxWidth: 720 }}>
      <div className="page-head inline" style={isWithdraw ? { alignItems: 'center', justifyContent: 'flex-start', gap: 16 } : undefined}>
        {isWithdraw && <button className="orb" onClick={() => go('/dashboard')} aria-label="Back to home"><ArrowLeft size={22} strokeWidth={2.2} /></button>}
        <div>
          <h1 className="page-title">{isWithdraw ? 'Withdraw' : 'Send'}</h1>
          <p className="page-sub tnum">{items === null ? 'Checking your balance' : fromNote}</p>
        </div>
      </div>

      <div className="send-stack">
        {SHIELD_LIVE && (
          <section className="card send-section">
            <div className="hstack" style={{ justifyContent: 'space-between' }}>
              <span className="send-title">From</span>
              <Segmented label="Pay from" options={['Private', 'Regular'] as From[]} value={from} onChange={(v) => { touched.current = true; setFrom(v); setAmountStr('') }} />
            </div>
            <p className="send-note" style={{ margin: 0 }}>
              {fromPrivate ? 'Your private balance. The amount and both sides stay hidden.' : 'Payments still at their one-time addresses.'}
            </p>
          </section>
        )}

        <section className="card send-section">
          <div className="send-block">
            <label className="send-title" htmlFor="send-to">{isWithdraw ? 'To your wallet' : 'To'}</label>
            <div className="field-wrap" style={{ marginTop: 10 }}>
              <input
                id="send-to" className="field" style={{ paddingRight: 108 }}
                placeholder={isWithdraw ? `${CASHADDR_PREFIX}:q…` : '@username'} value={to} spellCheck={false} autoComplete="off" autoCapitalize="off"
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
              <p className="send-note ap-err-text">Couldn’t read your clipboard. Paste with ⌘V or Ctrl+V.</p>
            ) : isWithdraw && t ? (
              destErr ? <p className="send-note ap-err-text">{destErr}</p> : <p className="send-note"><span className="badge neutral">BCH address</span>Any wallet you control</p>
            ) : !isWithdraw && isHandle ? (
              <p className="send-note" aria-live="polite">
                {look.s === 'checking' && <><Loader2 size={14} className="spin" />Looking up @{handle}</>}
                {look.s === 'none' && <span className="ap-err-text">No one has that name</span>}
                {look.s === 'self' && <span className="ap-err-text">That’s you. Pick someone else.</span>}
                {look.s === 'error' && <span className="ap-err-text">Couldn’t look that up. Try again.</span>}
                {look.s === 'found' && noShield && <span className="ap-err-text">@{look.p.handle} hasn’t set up a private balance yet. Send from Regular instead.</span>}
                {look.s === 'found' && !noShield && <><span className="badge green"><Check size={13} strokeWidth={2.8} />@{look.p.handle}</span>Key fingerprint <span className="mono">{look.p.fingerprint}</span></>}
              </p>
            ) : recent.length > 0 ? (
              <div className="recent">
                <span className="recent-label">Recent</span>
                {recent.map(({ to: r }) => (
                  <button key={r} className="recent-chip" onClick={() => setTo(isWithdraw ? r : `@${r}`)}>
                    {isWithdraw ? <><span className="wallet-dot"><Wallet size={13} strokeWidth={2.4} /></span><span className="mono">{shortAddr(r)}</span></> : <><Avatar handle={r} size={26} />@{r}</>}
                  </button>
                ))}
              </div>
            ) : (
              <p className="send-note">{isWithdraw ? 'Paste an address from Paytaca, Cashonize or any BCH wallet.' : 'Send to anyone on Unlinked by their username.'}</p>
            )}
          </div>
        </section>

        {sweep ? (
          <section className="card send-section">
            <div className="hstack" style={{ justifyContent: 'space-between' }}>
              <span className="send-title">Payments</span>
              <span className="muted tnum" style={{ fontSize: 14 }}>{chosen.length} of {list.length}</span>
            </div>
            {items === null ? (
              <div className="ap-skel ap-skel-row" />
            ) : list.length === 0 ? (
              <p className="send-note" style={{ margin: 0 }}>{SHIELD_LIVE ? 'No regular balance right now. Your payments are in your private balance.' : 'Nothing to withdraw yet. Payments show up here once they arrive.'}</p>
            ) : (
              <div className="rows">
                {list.map((r) => {
                  const on = !unpicked.has(r.address)
                  return (
                    <label key={r.address} className="row ap-pick">
                      <input type="checkbox" checked={on} onChange={() => setUnpicked((s) => { const x = new Set(s); if (on) x.add(r.address); else x.delete(r.address); return x })} />
                      <span className={`ap-check${on ? ' on' : ''}`} aria-hidden>{on && <Check size={14} strokeWidth={3} />}</span>
                      <div className="row-main">
                        <div className="row-title tnum">{itemAmount(r)}</div>
                        <div className="row-meta">{relTime(r.createdAt)}, <span className="mono">{shortAddr(r.address)}</span></div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
            {list.length > 1 && (
              <label className="hstack" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>
                <span>
                  <span style={{ display: 'block' }}>Keep them unlinked</span>
                  <span className="muted" style={{ fontSize: 14 }}>One transaction per payment, never merged.</span>
                </span>
                <Switch on={split} onChange={setSplit} label="One transaction per payment" />
              </label>
            )}
            {!split && chosen.length > 1 && <p className="ap-err" style={{ textAlign: 'left' }}>These payments will be merged into one transaction and linked on-chain.</p>}
          </section>
        ) : (
          <section className="card send-section">
            <div className="send-block">
              <div className="hstack" style={{ justifyContent: 'space-between' }}>
                <label className="send-title" htmlFor="send-amount">Amount</label>
                <button className="btn-ghost tnum" style={{ fontSize: 14 }} onClick={() => setFromPct(100)} disabled={!avail}>Max {fmtBch(avail)}</button>
              </div>
              <div className="amount-box">
                <input
                  id="send-amount" className="amount-input tnum" inputMode="decimal" placeholder="0.00"
                  value={amountStr} onChange={(e) => setAmountStr(e.target.value.replace(',', '.').replace(/[^0-9.]/g, '').slice(0, 12))}
                />
                <span className="amount-unit" aria-label="BCH"><TokenIcon token="BCH" size={36} /></span>
              </div>
              <div className="amount-usd tnum" style={over ? { color: 'var(--red-11)' } : undefined}>
                {over ? (fromPrivate ? `You can ${isWithdraw ? 'withdraw' : 'send'} up to ${fmtBch(avail)} BCH` : `No single payment covers this. Up to ${fmtBch(avail)} BCH.`) : price ? `≈ ${fmtUsd((sats / 1e8) * price)}` : ' '}
              </div>
              <div style={{ marginTop: 18 }}>
                <TickSlider value={pct} onChange={setFromPct} label={isWithdraw ? 'Amount to withdraw' : 'Amount to send'} ticks={40} />
              </div>
              <div className="chip-row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
                {[25, 50, 75, 100].map((v) => (
                  <button key={v} className={`btn sm ${pct === v && sats > 0 ? 'btn-tint' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => setFromPct(v)} disabled={!avail}>
                    {v === 100 ? 'Max' : `${v}%`}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="card send-section">
          <h2 className="send-title">Summary</h2>
          {(sweep ? chosen.length > 0 : sats > 0 && !over) && (
            <div className="send-summary">
              <div className="row"><span className="row-main muted">{isWithdraw ? 'You receive' : 'They receive'}</span><span className="tnum">{sweep ? `about ${sumLabel(chosen)}` : `${fmtBch(sats)} BCH`}</span></div>
              <div className="row"><span className="row-main muted">Network fee</span><span className="tnum">{fromPrivate ? '' : 'about '}{fmtBch(netFee)} BCH</span></div>
              {sweep && <div className="row"><span className="row-main muted">Sent as</span><span>{txCount > 1 ? `${txCount} separate transactions` : 'One transaction'}</span></div>}
            </div>
          )}
          {needsBackup && (
            <button className="ap-notice" onClick={() => go('/settings?backup=1')}>
              <span className="ap-ico"><KeyRound size={18} strokeWidth={2.2} /></span>
              <span className="row-main">Back up your 12 words first. If this device is lost, they are the only way to reach your money.</span>
              <ChevronRight size={18} className="row-chev" />
            </button>
          )}
          <div className="send-cta">
            <button className="btn btn-primary block" disabled={!ready} onClick={() => { setSendErr(null); setPhase('confirm') }}>
              {!validTo ? 'Add a recipient' : sweep ? (chosen.length ? 'Review' : 'Pick a payment') : sats <= 0 ? 'Enter an amount' : over ? 'Not enough balance' : 'Review'}
            </button>
          </div>
        </section>
      </div>

      {phase !== 'form' && (
        <Modal title={phase === 'done' ? (isWithdraw ? 'Withdrawn' : 'Sent') : isWithdraw ? 'Review withdraw' : 'Review send'} onClose={() => phase !== 'sending' && (phase === 'done' ? go('/dashboard') : setPhase('form'))}>
          {phase === 'done' && done ? (
            <div className="center">
              <SuccessMark size={140} />
              <p className="page-sub" style={{ margin: '4px 0 14px' }}>{done.sub}</p>
              <div className="rows" style={{ textAlign: 'left' }}>
                {done.txids.map((id) => (
                  <a key={id} className="row ap-tx" href={explorerTx(id)} target="_blank" rel="noreferrer">
                    <span className="row-main mono">{shortTx(id)}</span><span className="muted">View</span><ExternalLink size={15} />
                  </a>
                ))}
              </div>
              <button className="btn btn-primary block" style={{ marginTop: 24 }} onClick={() => go('/dashboard')}>Back to home</button>
            </div>
          ) : phase === 'sending' && fromPrivate ? (
            <ShieldProgress progress={proof} />
          ) : (
            <>
              <div className="center" style={{ marginBottom: 12 }}>
                <div className="hero-num tnum" style={{ fontSize: 40, lineHeight: '48px' }}>{sweep ? sumLabel(chosen) : <>{fmtBch(sats)}<small> BCH</small></>}</div>
                {price && <div className="muted tnum">≈ {fmtUsd((sats / 1e8) * price)}</div>}
              </div>
              <div className="rows">
                <div className="row"><span className="row-main muted">To</span><span className={isWithdraw ? 'mono' : ''}>{toLabel}</span></div>
                <div className="row"><span className="row-main muted">From</span><span>{fromPrivate ? 'Private balance' : sweep ? `${chosen.length} payment${chosen.length === 1 ? '' : 's'}` : 'One payment'}</span></div>
                {sweep && <div className="row"><span className="row-main muted">Sent as</span><span>{txCount > 1 ? `${txCount} separate transactions` : 'One transaction'}</span></div>}
                <div className="row"><span className="row-main muted">Network fee</span><span className="tnum">{fromPrivate ? '' : 'about '}{fmtBch(netFee)} BCH</span></div>
              </div>
              {sendErr && <p className="ap-err" role="alert" style={{ marginTop: 14 }}>{sendErr}</p>}
              <div className="hstack" style={{ marginTop: 20 }}>
                <ModalCancel className="btn btn-secondary md" style={{ flex: 1 }} disabled={phase === 'sending'}>Back</ModalCancel>
                <button className="btn btn-primary md" style={{ flex: 1 }} disabled={phase === 'sending'} onClick={submit}>
                  {phase === 'sending' ? <><Loader2 size={18} className="spin" />{isWithdraw ? 'Withdrawing' : 'Sending'}</> : isWithdraw ? 'Withdraw' : 'Send'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </main>
  )
}
