import { useEffect, useMemo, useState } from 'react'
import { xchainQuote, type Profile, type XQuote, type XToken } from '../../lib/api'
import { preparePayment } from '../../lib/payments'
import type { OneTime } from '../../lib/stealth'
import { ChainPicker, TokenPicker } from './ChainPicker'
import { amountNum, cleanAmount, fmtCoin, fmtUsd, toBaseUnits } from './format'
import type { PaidInfo } from './PaidScreen'
import { Notice, PayShell } from './PayShell'
import { bchPrice, chainName, groupByChain, type XTokens } from './tokens'
import { useFlow } from './useFlow'
import { DRY_RECIPIENT, friendlyQuoteError, refundLooksValid, suggestAmount } from './xchain'
import { XDeposit, type Deposit } from './XDeposit'

type Dry = { key: string; out?: string; secs?: number; error?: string }

export function CrossChain({ profile, usd, x, onBack, onPaid }: { profile: Profile; usd: number; x: XTokens; onBack: () => void; onPaid: (p: PaidInfo) => void }) {
  const groups = useMemo(() => (x.tokens ? groupByChain(x.tokens) : null), [x.tokens])
  const price = bchPrice(x.tokens)
  const [chain, setChain] = useState('base')
  const [tokenId, setTokenId] = useState('')
  const [amount, setAmount] = useState('')
  const [refunds, setRefunds] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dry, setDry] = useState<Dry | null>(null)
  const [deposit, setDeposit] = useState<Deposit | null>(null)
  const { begin } = useFlow()

  const list = groups?.get(chain) ?? []
  const token: XToken | undefined = list.find((t) => t.assetId === tokenId) ?? list[0]
  const refund = refunds[chain] ?? ''
  const base = token ? toBaseUnits(amount, token.decimals) : '0'
  const refundOk = refundLooksValid(chain, refund)
  const name = chainName(chain)

  const pickToken = (t: XToken | undefined) => {
    if (!t) return
    setTokenId(t.assetId)
    setAmount(suggestAmount(usd, t.price, t.decimals))
    setError(null)
  }
  useEffect(() => {
    if (groups && !tokenId) pickToken(groups.get(chain)?.[0])
  }, [groups])

  const key = token ? `${token.assetId}|${base}|${refund.trim()}` : ''
  useEffect(() => {
    if (!token || base === '0' || !refundOk) return
    let on = true
    const t = setTimeout(() => {
      xchainQuote({ data: { originAsset: token.assetId, amount: base, recipient: DRY_RECIPIENT, refundTo: refund.trim(), dry: true } })
        .then((q) => on && setDry('error' in q ? { key, error: friendlyQuoteError(q.error, name) } : { key, out: q.amountOut, secs: q.timeEstimate }))
        // a network hiccup on the estimate is not worth a warning; the price estimate stays
        .catch(() => on && setDry({ key }))
    }, 600)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [key, refundOk])

  async function getDeposit() {
    if (!token) return
    const alive = begin()
    setBusy(true)
    setError(null)
    let ot: OneTime
    try {
      ot = await preparePayment(profile)
    } catch {
      if (!alive()) return
      setBusy(false)
      setError("Couldn't prepare a private address. Try again.")
      return
    }
    if (!alive()) return
    const q: XQuote | { error: string } = await xchainQuote({ data: { originAsset: token.assetId, amount: base, recipient: ot.address, refundTo: refund.trim() } }).catch(() => ({ error: 'Quote failed. Try again.' }))
    if (!alive()) return
    setBusy(false)
    if ('error' in q) return setError(friendlyQuoteError(q.error, name))
    setDeposit({ quote: q, ot, token, amount, chain: name })
  }

  if (deposit) return <XDeposit handle={profile.handle} d={deposit} onBack={() => setDeposit(null)} onPaid={onPaid} />

  const live = dry && dry.key === key ? dry : null
  const estimate = live?.out ? fmtCoin(live.out) : token && price && amountNum(amount) ? fmtCoin((amountNum(amount) * token.price) / price, 6) : null
  const tokenUsd = token ? amountNum(amount) * token.price : 0

  return (
    <PayShell onBack={onBack}>
      <div className="center">
        <h1 className="page-title pay-title-sm">Pay from another chain</h1>
        <p className="page-sub">@{profile.handle} gets BCH at a one-time address</p>
      </div>
      {x.failed ? (
        <div className="pay-gap">
          <Notice>Couldn't load chains. Try again.</Notice>
          <button type="button" className="btn btn-secondary block" onClick={x.reload}>Retry</button>
        </div>
      ) : !groups || !token ? (
        <div className="pay-gap" aria-label="Loading chains" role="status">
          <div className="pay-sk pay-sk-row" />
          <div className="pay-sk pay-sk-row" />
          <div className="pay-sk pay-sk-row" />
        </div>
      ) : (
        <>
          <div className="pay-field">
            <span className="pay-label">Chain</span>
            <ChainPicker
              groups={groups}
              chain={chain}
              onChain={(c) => {
                setChain(c)
                pickToken(groups.get(c)?.[0])
              }}
            />
          </div>
          <div className="pay-field">
            <span className="pay-label">Token</span>
            <TokenPicker key={chain} tokens={list} token={token.assetId} onToken={(id) => pickToken(list.find((t) => t.assetId === id))} />
          </div>

          <div className="center pay-amount sm">
            <label className="pay-amount-line">
              <input
                className="pay-amount-input"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                aria-label={`Amount in ${token.symbol}`}
                value={amount}
                onChange={(e) => (setAmount(cleanAmount(e.target.value, token.decimals)), setError(null))}
                style={{ width: `${Math.max(amount.length, 1) + 0.4}ch` }}
              />
              <span className="pay-amount-cur">{token.symbol}</span>
            </label>
            <div className="pay-usd">{tokenUsd > 0 ? `≈ ${fmtUsd(tokenUsd)}` : ' '}</div>
          </div>

          <div className="rows pay-rows" aria-live="polite">
            <div className="row">
              <span className="row-main">
                <span className="muted">@{profile.handle} gets</span>
                <span className="row-meta">{live?.secs ? `Live quote, about ${Math.ceil(live.secs / 60)} min` : 'Estimate'}</span>
              </span>
              <span className="tnum pay-strong">{estimate ? `≈ ${estimate} BCH` : '…'}</span>
            </div>
          </div>

          <label className="pay-field">
            <span className="pay-label">Refund address on {name}</span>
            <input
              className="field mono pay-refund"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={`Your ${name} address`}
              value={refund}
              onChange={(e) => (setRefunds((r) => ({ ...r, [chain]: e.target.value })), setError(null))}
              aria-invalid={refund.trim() !== '' && !refundOk}
            />
            <span className={`pay-hint left${refund.trim() && !refundOk ? ' bad' : ''}`}>
              {refund.trim() && !refundOk ? `That doesn't look like a ${name} address.` : 'If the swap fails, your money goes back here.'}
            </span>
          </label>

          {(error || live?.error) && <Notice>{error ?? live?.error}</Notice>}

          <button type="button" className="btn btn-primary block pay-gap-sm" disabled={busy || base === '0' || !refundOk || !!live?.error} onClick={getDeposit}>
            {busy ? 'Getting address…' : 'Get deposit address'}
          </button>
          <p className="help">Powered by NEAR Intents. Your BCH lands on a fresh one-time address.</p>
        </>
      )}
    </PayShell>
  )
}
