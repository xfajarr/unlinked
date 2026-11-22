import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeftRight, ArrowRight, Check, ExternalLink } from 'lucide-react'
import { xchainStatus, xchainSubmit, type XQuote, type XStatus, type XToken } from '../../lib/api'
import { EXPLORER_TX } from '../../lib/config'
import type { Utxo } from '../../lib/fulcrum'
import { satsToBch, waitForPayment } from '../../lib/payments'
import type { OneTime } from '../../lib/stealth'
import { CopyButton, TokenIcon } from '../../ui'
import { ago, clock, fmtCoin } from './format'
import type { PaidInfo } from './PaidScreen'
import { txUrl, watchDeposit, type Seen } from './evmwatch'
import { Notice, PayShell } from './PayShell'

const ChainLogo = lazy(() => import('./xicons').then((m) => ({ default: m.ChainLogo })))

/**
 * `status` is the last one seen, saved so a refresh after the deposit landed doesn't show the address again.
 * `fromBlock` is where the origin-chain watch starts; `submitted` is the tx hash already sent to 1Click; `seenAt` is when the deposit first showed up.
 */
export type Deposit = { quote: XQuote; ot: OneTime; token: XToken; amount: string; chain: string; startedAt?: number; status?: XStatus; fromBlock?: number; submitted?: string; seenAt?: number }

const POLL_MS = 5000
const stepOf = (s: XStatus) => (s === 'SUCCESS' ? 3 : s === 'KNOWN_DEPOSIT_TX' || s === 'PROCESSING' ? 1 : 0)
const isFinal = (s: XStatus) => s === 'SUCCESS' || s === 'REFUNDED' || s === 'FAILED'
const isReceived = (s: XStatus) => s === 'KNOWN_DEPOSIT_TX' || s === 'PROCESSING' || s === 'SUCCESS' || s === 'INCOMPLETE_DEPOSIT'

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`
}

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`

type State = 'done' | 'now' | ''

function Step({ state, icon, title, children }: { state: State; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className={`xd-step ${state}`} aria-current={state === 'now' ? 'step' : undefined}>
      <span className="xd-ico">
        {icon}
        {state === 'done' && <span className="xd-tick" aria-label="Done"><Check size={10} strokeWidth={3.6} /></span>}
      </span>
      <div className="xd-body">
        <span className="xd-title">{title}</span>
        <span className="xd-sub">{children}</span>
      </div>
    </li>
  )
}

type Props = { handle: string; d: Deposit; onBack: () => void; onPaid: (p: PaidInfo) => void; onUpdate?: (p: Partial<Deposit>) => void }

export function XDeposit({ handle, d, onBack, onPaid, onUpdate }: Props) {
  const [status, setStatus] = useState<XStatus>(d.status ?? 'PENDING_DEPOSIT')
  // 1Click says PROCESSING until the BCH has a confirmation; the one-time address sees it in the mempool minutes earlier
  const [landed, setLanded] = useState<Utxo[] | null>(null)
  // the origin chain shows the deposit seconds after it's sent; 1Click can take many minutes to notice
  const [seen, setSeen] = useState<Seen | null>(null)
  const [sub, setSub] = useState<'idle' | 'busy' | 'done' | 'failed'>(d.submitted ? 'done' : 'idle')
  const addr = d.quote.depositAddress
  const chain = d.token.blockchain
  const transfers = seen && !seen.native ? seen.transfers : []
  const first = transfers[0]
  const final = isFinal(status) || !!landed
  const pending = status === 'PENDING_DEPOSIT' && !landed && !seen
  const received = isReceived(status) || !!landed || !!seen
  const delivered = !!landed || status === 'SUCCESS'
  const paid = useRef(onPaid)
  paid.current = onPaid
  const update = useRef(onUpdate)
  update.current = onUpdate
  const [since] = useState(() => d.startedAt ?? Date.now())
  const [now, setNow] = useState(Date.now)
  const [seenAt, setSeenAt] = useState(d.seenAt)

  useEffect(() => {
    if (final) return
    let on = true
    let inFlight = false
    const tick = async () => {
      if (inFlight) return
      inFlight = true
      const s = await xchainStatus({ data: { depositAddress: addr, depositMemo: d.quote.depositMemo } }).catch((): XStatus => 'UNKNOWN')
      inFlight = false
      if (on && s !== 'UNKNOWN') setStatus(s)
    }
    tick()
    const t = setInterval(tick, POLL_MS)
    return () => {
      on = false
      clearInterval(t)
    }
  }, [addr, final])

  useEffect(() => {
    if (status !== (d.status ?? 'PENDING_DEPOSIT')) update.current?.({ status })
  }, [status])

  useEffect(() => {
    if (final) return
    return watchDeposit({ chain, assetId: d.token.assetId, address: addr, fromBlock: d.fromBlock, onStart: (fromBlock) => update.current?.({ fromBlock }) }, setSeen)
  }, [addr, final])

  useEffect(() => {
    if (!first || sub !== 'idle') return
    setSub('busy')
    xchainSubmit({ data: { txHash: first.hash, depositAddress: addr } }).then(
      () => (setSub('done'), update.current?.({ submitted: first.hash })),
      () => setSub('failed'),
    )
  }, [first?.hash])

  useEffect(() => {
    if (final) return
    const t = setInterval(() => setNow(Date.now()), pending ? 1000 : 15_000)
    return () => clearInterval(t)
  }, [pending, final])

  useEffect(() => {
    if (!received || seenAt) return
    const t = Date.now()
    setSeenAt(t)
    update.current?.({ seenAt: t })
  }, [received])

  useEffect(() => waitForPayment(d.ot.address, setLanded), [d.ot.address])

  useEffect(() => {
    if (!delivered) return
    const sats = landed?.reduce((n, u) => n + u.value, 0) ?? 0
    const bch = sats ? satsToBch(sats) : Number(d.quote.amountOut)
    const usd = (Number(d.quote.amountOutUsd) * bch) / Number(d.quote.amountOut)
    const at = Date.now()
    const info = { amount: fmtCoin(bch), currency: 'BCH', address: d.ot.address, txid: landed?.[0]?.tx_hash, usd: Number.isFinite(usd) ? usd : undefined, at, took: at - (seenAt ?? since) }
    const t = setTimeout(() => paid.current(info), 1200)
    return () => clearTimeout(t)
  }, [delivered, landed])

  const step = delivered ? 3 : Math.max(stepOf(status), seen ? 1 : 0)
  const hash = first?.hash ?? d.submitted
  const link = hash && txUrl(chain, hash)
  const extra = transfers.length - 1
  const mins = Math.max(1, Math.ceil(d.quote.timeEstimate / 60))
  const until = new Date(d.quote.deadline)
  const eta = (seenAt ?? since) + mins * 60_000
  const sats = landed?.reduce((n, u) => n + u.value, 0) ?? 0
  const bchTx = landed?.[0]?.tx_hash
  const at = (i: number): State => (i < step ? 'done' : i === step ? 'now' : '')
  const [phase, tone] = delivered
    ? ['Delivered', 'green']
    : status === 'REFUNDED'
      ? ['Refunded', 'warn']
      : status === 'FAILED' || status === 'INCOMPLETE_DEPOSIT'
        ? ['Refunding', 'warn']
        : step > 0
          ? ['Swapping', 'blue']
          : ['Waiting', 'neutral']
  return (
    <PayShell onBack={onBack}>
      <div className="center">
        {received ? (
          <>
            <span className="pay-ring" aria-hidden><Check size={32} strokeWidth={2.6} /></span>
            <h1 className="page-title pay-title-sm">Deposit received</h1>
            <p className="page-sub">Don't send it again.</p>
          </>
        ) : (
          <>
            <h1 className="page-title pay-title-sm">Send {d.amount} {d.token.symbol}</h1>
            <p className="page-sub">on {d.chain}, exactly this amount</p>
            {pending && <p className="pay-hint pay-once">Send once. A second transfer to this address isn't part of the swap and may be refunded.</p>}
            {pending && (
              <div className="pay-qr">
                <QRCodeSVG value={addr} size={220} level="M" fgColor="#0b0d14" aria-label={`Deposit address on ${d.chain}`} />
              </div>
            )}
          </>
        )}
      </div>
      {pending && (
        <>
          <div className="link-box">
            <span className="url mono pay-addr">{addr}</span>
            <CopyButton text={addr} label="Copy deposit address" />
          </div>
          {d.quote.depositMemo && (
            <>
              <div className="link-box">
                <span className="url mono pay-addr">Memo {d.quote.depositMemo}</span>
                <CopyButton text={d.quote.depositMemo} label="Copy memo" />
              </div>
              <p className="pay-memo-warn">Add this memo to your transfer. Without it the deposit can't be matched to this payment.</p>
            </>
          )}
        </>
      )}
      {status === 'REFUNDED' && <Notice>The swap didn't go through. Your {d.token.symbol} went back to your refund address.</Notice>}
      {status === 'FAILED' && <Notice>The swap failed. Your deposit goes back to your refund address.</Notice>}
      {status === 'INCOMPLETE_DEPOSIT' && <Notice>We got less than {d.amount} {d.token.symbol}, so the swap can't run as quoted. It goes back to your refund address.</Notice>}
      {extra > 0 && (
        <Notice>
          {transfers.length} transfers reached this address. Only the first one counts for this swap. NEAR Intents refunds {extra === 1 ? 'the other one' : `the other ${extra}`} to your refund address.
        </Notice>
      )}

      <section className={`xd${delivered ? ' all' : ''}`} aria-label="Payment progress">
        <div className="xd-sum">
          <div className="xd-top">
            <span className={`xd-pill ${tone}`} role="status">
              {delivered ? <Check size={13} strokeWidth={3} aria-hidden /> : tone !== 'warn' && <span className="pay-pulse" aria-hidden />}
              {phase}
            </span>
            {!final && <span className="xd-k">Usually takes about {mins} min</span>}
          </div>
          <div className="xd-leg">
            <span className="xd-k">You send</span>
            <span className="xd-v"><b>{d.amount} {d.token.symbol}</b></span>
            <span className="xd-k">on {d.chain}</span>
          </div>
          <ArrowRight className="xd-arrow" size={16} strokeWidth={2.4} aria-hidden />
          <div className="xd-leg">
            <span className="xd-k">@{handle} gets</span>
            <span className="xd-v"><b>{`≈\u00a0${fmtCoin(d.quote.amountOut)} BCH`}</b></span>
          </div>
        </div>
        {(!final || delivered) && (
          <ol className="xd-steps" aria-label="Progress">
            <Step
              state={at(0)}
              icon={<Suspense fallback={<span className="xd-blank" />}><ChainLogo id={chain} size={36} /></Suspense>}
              title={received ? `Deposit seen on ${d.chain}` : `Waiting for your ${d.amount} ${d.token.symbol}`}
            >
              {received ? (
                <>
                  <span className="xd-amt">{d.amount} {d.token.symbol}</span>
                  {hash && (link ? (
                    <a className="xd-tx mono" href={link} target="_blank" rel="noreferrer">{short(hash)}<ExternalLink size={12} strokeWidth={2.4} aria-hidden /></a>
                  ) : <span className="mono">{short(hash)}</span>)}
                  {seenAt && <span className="xd-time">{ago(seenAt, now)}</span>}
                </>
              ) : `Checking every ${POLL_MS / 1000} s, ${elapsed(now - since)} so far`}
            </Step>
            <Step state={at(1)} icon={<span className="xd-glyph"><ArrowLeftRight size={17} strokeWidth={2.4} /></span>} title="Swapping to BCH">
              {at(1) === 'done' ? (
                `Swapped for ${sats ? fmtCoin(satsToBch(sats)) : `≈ ${fmtCoin(d.quote.amountOut)}`} BCH`
              ) : at(1) !== 'now' ? (
                'NEAR Intents finds the best route'
              ) : now > eta ? (
                'Taking longer than usual, NEAR Intents is still working on it'
              ) : (
                <>
                  <span>NEAR Intents finds the best route</span>
                  <span className="xd-eta">ETA {clock(eta)}</span>
                </>
              )}
            </Step>
            <Step state={at(2)} icon={<TokenIcon token="BCH" size={36} />} title="Delivered privately">
              {delivered && bchTx ? (
                <>
                  <span>Sent to a one-time address</span>
                  <a className="xd-tx mono" href={EXPLORER_TX + bchTx} target="_blank" rel="noreferrer">{short(bchTx)}<ExternalLink size={12} strokeWidth={2.4} aria-hidden /></a>
                </>
              ) : `To a one-time address only @${handle} can find`}
            </Step>
          </ol>
        )}
      </section>
      {final && !delivered && <button type="button" className="btn btn-secondary block pay-gap-sm" onClick={onBack}>Start over</button>}
      {status === 'PENDING_DEPOSIT' && !landed && (!first || sub === 'failed') && <SubmitTx depositAddress={addr} />}
      {pending && !Number.isNaN(until.getTime()) && (
        <p className="help">Send before {clock(until)}. Later deposits are refunded.</p>
      )}
    </PayShell>
  )
}

function SubmitTx({ depositAddress }: { depositAddress: string }) {
  const [hash, setHash] = useState('')
  const [state, setState] = useState<{ k: 'idle' | 'busy' | 'sent' } | { k: 'error'; msg: string }>({ k: 'idle' })
  const h = hash.trim()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!h || state.k === 'busy') return
    setState({ k: 'busy' })
    try {
      await xchainSubmit({ data: { txHash: h, depositAddress } })
      setState({ k: 'sent' })
    } catch (err) {
      setState({ k: 'error', msg: err instanceof Error && err.message ? err.message : "Couldn't send it. Check the hash and try again." })
    }
  }

  if (state.k === 'sent') return <p className="pay-hint">Got it. NEAR Intents is checking that transaction now.</p>
  return (
    <form className="pay-field pay-submit" onSubmit={submit}>
      <label className="pay-hint left" htmlFor="pay-txhash">Already sent? Paste your transaction hash to speed it up</label>
      <div className="pay-submit-row">
        <input
          id="pay-txhash"
          className="field mono pay-refund"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={200}
          placeholder="Transaction hash"
          value={hash}
          onChange={(e) => (setHash(e.target.value), state.k === 'error' && setState({ k: 'idle' }))}
        />
        <button type="submit" className="btn btn-secondary sm" disabled={!h || state.k === 'busy'}>{state.k === 'busy' ? 'Sending…' : 'Submit'}</button>
      </div>
      {state.k === 'error' && <span className="pay-hint left bad" role="alert">{state.msg}</span>}
    </form>
  )
}
