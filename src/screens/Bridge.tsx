import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { BCH_ASSET, xchainQuote, xchainStatus, xchainSubmit, type XStatus, type XToken } from '../lib/api'
import { EXPLORER_TX } from '../lib/config'
import {
  PUSD_DECIMALS, buyAndPay, estimateBuy, estimateSell, fromUnits, holdings, keyInfo, newKey, parseBchAddress, planSell, quoteSell, recoveryWif, sellAndDeposit, toUnits,
} from '../lib/bridge'
import { CopyButton, Segmented } from '../ui'
import { ChainPicker, TokenPicker } from './pay/ChainPicker'
import { cleanAmount } from './pay/format'
import { LiveStatus, Notice, PayShell } from './pay/PayShell'
import { chainName, groupByChain, useXTokens } from './pay/tokens'
import { DRY_RECIPIENT, friendlyQuoteError, refundLooksValid } from './pay/xchain'

const STORE = 'unlinked:bridge'
const STABLES = new Set(['USDC', 'USDT', 'DAI'])
const POLL = 8000

type Dir = 'in' | 'out'
type Saved = {
  dir: Dir
  keyHex: string
  chain: string
  assetId: string
  symbol: string
  amount: string
  bch: string
  other: string
  depositAddress?: string
  depositMemo?: string
  amountOut?: string
  timeEstimate?: number
  swapTxid?: string
  pusd?: string
  stage: 'deposit' | 'bridging' | 'done' | 'failed'
  note?: string
}

const load = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? 'null') as Saved | null
  } catch {
    return null
  }
}
const save = (s: Saved | null) => {
  try {
    if (s) localStorage.setItem(STORE, JSON.stringify(s))
    else localStorage.removeItem(STORE)
  } catch { /* private mode: the run still works until the tab closes */ }
}
const short = (a: string, n = 10) => (a.length > 2 * n + 3 ? `${a.slice(0, n + 12)}…${a.slice(-n)}` : a)

export default function Bridge() {
  const [run, setRun] = useState<Saved | null>(load)
  const update = (s: Saved | null) => {
    // a cancelled run may still receive funds, so its key is kept
    if (!s && run && run.stage !== 'done') {
      try {
        const old = JSON.parse(localStorage.getItem(STORE + ':keys') ?? '[]') as string[]
        localStorage.setItem(STORE + ':keys', JSON.stringify([...old, run.keyHex]))
      } catch { /* storage unavailable */ }
    }
    save(s)
    setRun(s)
  }
  return (
    <PayShell onBack={() => history.length > 1 ? history.back() : location.assign('/')}>
      {run ? <Run s={run} update={update} /> : <Form onStart={update} />}
    </PayShell>
  )
}

function Form({ onStart }: { onStart: (s: Saved) => void }) {
  const x = useXTokens()
  const groups = useMemo(() => {
    if (!x.tokens) return null
    const g = new Map<string, XToken[]>()
    for (const [chain, list] of groupByChain(x.tokens)) {
      const st = list.filter((t) => STABLES.has(t.symbol.toUpperCase()))
      if (st.length) g.set(chain, st)
    }
    return g
  }, [x.tokens])
  const [dir, setDir] = useState<Dir>('in')
  const [chain, setChain] = useState('base')
  const [assetId, setAssetId] = useState('')
  const [amount, setAmount] = useState('')
  const [bch, setBch] = useState('')
  const [other, setOther] = useState('')
  const [estimate, setEstimate] = useState<{ key: string; text?: string; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = groups?.get(chain) ?? []
  const token = list.find((t) => t.assetId === assetId) ?? list[0]
  useEffect(() => {
    if (groups && !groups.has(chain)) setChain([...groups.keys()][0] ?? 'base')
  }, [groups, chain])

  const decimals = dir === 'in' ? token?.decimals ?? 6 : PUSD_DECIMALS
  const units = toUnits(amount || '0', decimals)
  const otherOk = refundLooksValid(chain, other)
  const [bchOk, setBchOk] = useState(false)
  useEffect(() => {
    let on = true
    if (!bch.trim()) return setBchOk(false)
    parseBchAddress(bch).then((r) => on && setBchOk(!!r))
    return () => {
      on = false
    }
  }, [bch])

  const key = `${dir}|${token?.assetId}|${units}|${other.trim()}`
  useEffect(() => {
    if (!token || units <= 0n || !otherOk) return
    let on = true
    const t = setTimeout(async () => {
      try {
        if (dir === 'in') {
          const q = await xchainQuote({ data: { originAsset: token.assetId, amount: units.toString(), recipient: DRY_RECIPIENT, refundTo: other.trim(), dry: true } })
          if ('error' in q) throw new Error(friendlyQuoteError(q.error, chainName(chain)))
          const pusd = await estimateBuy(toUnits(q.amountOut, 8))
          if (on) setEstimate({ key, text: pusd > 0n ? `About ${fromUnits(pusd, PUSD_DECIMALS)} PUSD` : 'Too small to swap after fees.' })
        } else {
          const sats = (await estimateSell(units)) - 3000n
          if (sats <= 0n) throw new Error('That PUSD amount is too small to bridge.')
          const q = await xchainQuote({ data: { originAsset: BCH_ASSET, destinationAsset: token.assetId, amount: sats.toString(), recipient: other.trim(), refundTo: DRY_RECIPIENT, dry: true } })
          if ('error' in q) throw new Error(friendlyQuoteError(q.error, chainName(chain)))
          if (on) setEstimate({ key, text: `About ${q.amountOut} ${token.symbol} on ${chainName(chain)}` })
        }
      } catch (e) {
        if (on) setEstimate({ key, error: e instanceof Error ? e.message : 'Could not get a price. Try again.' })
      }
    }, 600)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [key])
  const live = estimate?.key === key ? estimate : null

  const start = async () => {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const k = await newKey()
      const base: Saved = { dir, keyHex: k.keyHex, chain, assetId: token.assetId, symbol: token.symbol, amount, bch: bch.trim(), other: other.trim(), stage: 'deposit' }
      if (dir === 'in') {
        const q = await xchainQuote({ data: { originAsset: token.assetId, amount: units.toString(), recipient: k.address, refundTo: other.trim() } })
        if ('error' in q) throw new Error(friendlyQuoteError(q.error, chainName(chain)))
        onStart({ ...base, depositAddress: q.depositAddress, depositMemo: q.depositMemo, amountOut: q.amountOut, timeEstimate: q.timeEstimate })
      } else onStart(base)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const ready = !!token && units > 0n && bchOk && otherOk && !!live?.text && !busy
  return (
    <>
      <h1 className="page-title pay-title-sm">PUSD bridge</h1>
      <p className="page-sub">Move dollars between other chains and PUSD on Bitcoin Cash.</p>
      <div className="pay-seg">
        <Segmented label="Direction" options={['Into PUSD', 'Out of PUSD']} value={dir === 'in' ? 'Into PUSD' : 'Out of PUSD'} onChange={(v) => (setDir(v === 'Into PUSD' ? 'in' : 'out'), setAmount(''), setError(null))} />
      </div>
      {!groups ? (
        x.failed ? <Notice>Couldn't load tokens. <button type="button" className="btn sm btn-secondary" onClick={x.reload}>Retry</button></Notice> : <LiveStatus>Loading tokens…</LiveStatus>
      ) : (
        <>
          <div className="pay-field">
            <span className="pay-label">{dir === 'in' ? 'From chain' : 'To chain'}</span>
            <ChainPicker groups={groups} chain={chain} onChain={(c) => (setChain(c), setAssetId(''))} />
          </div>
          {token && (
            <div className="pay-field">
              <span className="pay-label">{dir === 'in' ? 'Pay with' : 'Receive'}</span>
              <TokenPicker tokens={list} token={token.assetId} onToken={setAssetId} />
            </div>
          )}
          <label className="pay-amount-line">
            <input
              className="pay-amount-input"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              aria-label="Amount"
              value={amount}
              onChange={(e) => setAmount(cleanAmount(e.target.value, decimals))}
              style={{ width: `${Math.max(amount.length, 1) + 0.4}ch` }}
            />
            <span className="pay-amount-cur">{dir === 'in' ? token?.symbol : 'PUSD'}</span>
          </label>
          <label className="pay-field">
            <span className="pay-label">{dir === 'in' ? `Refund address on ${chainName(chain)}` : `Your address on ${chainName(chain)}`}</span>
            <input className="field mono pay-refund" spellCheck={false} autoComplete="off" value={other} onChange={(e) => setOther(e.target.value)} placeholder={chainName(chain) + ' address'} />
          </label>
          <label className="pay-field">
            <span className="pay-label">{dir === 'in' ? 'Your BCH address for the PUSD' : 'Your BCH address, for refunds and change'}</span>
            <input className="field mono pay-refund" spellCheck={false} autoComplete="off" value={bch} onChange={(e) => setBch(e.target.value)} placeholder="bitcoincash:z…" />
          </label>
          {bch.trim() && !bchOk && <p className="help">That doesn't look like a Bitcoin Cash address.</p>}
          {units > 0n && otherOk && <p className="pay-hint left">{live?.error ?? live?.text ?? 'Getting a price…'}</p>}
          {error && <Notice>{error}</Notice>}
          <button type="button" className="btn btn-primary block" disabled={!ready} onClick={start}>
            {busy ? 'Working…' : dir === 'in' ? 'Get deposit address' : 'Get PUSD address'}
          </button>
          <p className="help">
            {dir === 'in'
              ? 'NEAR Intents swaps your stablecoin to BCH, then a Cauldron pool swaps the BCH to PUSD and sends it to your address.'
              : 'A Cauldron pool swaps your PUSD to BCH and pays NEAR Intents in the same transaction. NEAR then sends the stablecoin to your address.'}
          </p>
        </>
      )}
    </>
  )
}

function Run({ s, update }: { s: Saved; update: (s: Saved | null) => void }) {
  const [status, setStatus] = useState<XStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addr, setAddr] = useState<{ plain: string; token: string } | null>(null)
  const [wif, setWif] = useState<string | null>(null)
  const working = useRef(false)
  const latest = useRef(s)
  latest.current = s

  useEffect(() => {
    keyInfo(s.keyHex).then((k) => setAddr({ plain: k.address, token: k.tokenAddress }))
  }, [s.keyHex])

  useEffect(() => {
    if (s.stage === 'done' || s.stage === 'failed') return
    let on = true
    const tick = async () => {
      if (working.current) return
      const cur = latest.current
      try {
        const k = await keyInfo(cur.keyHex)
        const user = await parseBchAddress(cur.bch)
        if (!user) throw new Error('Your BCH address is not valid.')
        if (cur.dir === 'in') {
          if (cur.depositAddress) {
            const st = await xchainStatus({ data: { depositAddress: cur.depositAddress, depositMemo: cur.depositMemo } }).catch(() => null)
            if (on && st) setStatus(st)
            if (st === 'REFUNDED' || st === 'FAILED') return update({ ...cur, stage: 'failed', note: `NEAR Intents returned your ${cur.symbol} to your refund address.` })
          }
          const h = await holdings(k.address)
          if (h.sats > 4000n) {
            working.current = true
            const r = await buyAndPay(k, user.lock)
            update({ ...cur, stage: 'done', swapTxid: r.txid, pusd: r.pusd.toString() })
          }
        } else if (cur.stage === 'deposit') {
          const h = await holdings(k.address)
          if (h.pusd > 0n) {
            working.current = true
            const plan = await planSell(k)
            const q = await quoteSell(plan, cur.assetId, cur.other, user.plain)
            const txid = await sellAndDeposit(k, q.depositAddress, q.sats, user.lock)
            xchainSubmit({ data: { txHash: txid, depositAddress: q.depositAddress } }).catch(() => {})
            update({ ...cur, stage: 'bridging', swapTxid: txid, depositAddress: q.depositAddress, amountOut: q.amountOut, pusd: plan.units.toString() })
          }
        } else if (cur.depositAddress) {
          const st = await xchainStatus({ data: { depositAddress: cur.depositAddress } }).catch(() => null)
          if (on && st) setStatus(st)
          if (st === 'SUCCESS') update({ ...cur, stage: 'done' })
          if (st === 'REFUNDED' || st === 'FAILED') update({ ...cur, stage: 'failed', note: 'NEAR Intents sent the BCH back to your BCH address.' })
        }
        if (on) setError(null)
      } catch (e) {
        if (on) setError(e instanceof Error ? e.message : 'Something went wrong. It will retry.')
      } finally {
        working.current = false
      }
    }
    tick()
    const t = setInterval(tick, POLL)
    return () => {
      on = false
      clearInterval(t)
    }
  }, [s.stage])

  const chain = chainName(s.chain)
  const txLink = s.swapTxid ? <a href={EXPLORER_TX + s.swapTxid} target="_blank" rel="noreferrer" className="mono">{short(s.swapTxid, 8)}</a> : null
  const finished = s.stage === 'done' || s.stage === 'failed'

  return (
    <>
      {s.stage === 'done' ? (
        <>
          <h1 className="page-title pay-title-sm">{s.dir === 'in' ? `${fromUnits(BigInt(s.pusd ?? '0'), PUSD_DECIMALS)} PUSD sent` : `${s.amountOut} ${s.symbol} sent`}</h1>
          <p className="page-sub">{s.dir === 'in' ? `to ${short(s.bch)}` : `to ${short(s.other)} on ${chain}`}</p>
          <p className="help">BCH transaction: {txLink}</p>
        </>
      ) : s.stage === 'failed' ? (
        <>
          <h1 className="page-title pay-title-sm">The bridge didn't finish</h1>
          <Notice>{s.note}</Notice>
        </>
      ) : s.dir === 'in' && s.depositAddress ? (
        <>
          <h1 className="page-title pay-title-sm">Send {s.amount} {s.symbol}</h1>
          <p className="page-sub">on {chain}, exactly this amount, once</p>
          <div className="center"><div className="pay-qr"><QRCodeSVG value={s.depositAddress} size={220} level="M" fgColor="#0b0d14" aria-label={`Deposit address on ${chain}`} /></div></div>
          <div className="link-box">
            <span className="url mono pay-addr">{s.depositAddress}</span>
            <CopyButton text={s.depositAddress} label="Copy deposit address" />
          </div>
          {s.depositMemo && (
            <div className="link-box">
              <span className="url mono pay-addr">Memo {s.depositMemo}</span>
              <CopyButton text={s.depositMemo} label="Copy memo" />
            </div>
          )}
          <LiveStatus>
            {status === 'KNOWN_DEPOSIT_TX' || status === 'PROCESSING' ? 'Deposit seen. NEAR Intents is swapping it to BCH.' : status === 'SUCCESS' ? 'BCH arrived. Swapping it to PUSD on Cauldron.' : 'Waiting for your deposit.'}
          </LiveStatus>
          <p className="help">You get about {s.amountOut} BCH worth of PUSD at {short(s.bch)}.</p>
        </>
      ) : s.stage === 'bridging' ? (
        <>
          <h1 className="page-title pay-title-sm">{fromUnits(BigInt(s.pusd ?? '0'), PUSD_DECIMALS)} PUSD swapped</h1>
          <p className="page-sub">NEAR Intents is sending about {s.amountOut} {s.symbol} to {short(s.other)} on {chain}</p>
          <LiveStatus>{status === 'PROCESSING' || status === 'KNOWN_DEPOSIT_TX' ? 'NEAR Intents is processing the swap.' : 'Waiting for NEAR Intents to see the BCH deposit.'}</LiveStatus>
          <p className="help">BCH transaction: {txLink}</p>
        </>
      ) : (
        <>
          <h1 className="page-title pay-title-sm">Send {s.amount} PUSD</h1>
          <p className="page-sub">from a CashTokens wallet such as Cashonize or Paytaca</p>
          {addr && (
            <>
              <div className="center"><div className="pay-qr"><QRCodeSVG value={addr.token} size={220} level="M" fgColor="#0b0d14" aria-label="PUSD deposit address" /></div></div>
              <div className="link-box">
                <span className="url mono pay-addr">{addr.token}</span>
                <CopyButton text={addr.token} label="Copy PUSD address" />
              </div>
            </>
          )}
          <LiveStatus>Waiting for your PUSD. Once it arrives, the swap and the NEAR deposit go out in one transaction.</LiveStatus>
          <p className="help">{s.symbol} goes to {short(s.other)} on {chain}. Refunds and change go to {short(s.bch)}.</p>
        </>
      )}
      {error && !finished && <Notice tone="info" role="status">{error}</Notice>}
      <details className="help" style={{ marginTop: 16 }}>
        <summary>Recovery key</summary>
        <p>This run uses a key saved in this browser. If the page can't finish, import this key into a BCH wallet to get the funds back.</p>
        {wif ? (
          <div className="link-box"><span className="url mono pay-addr">{wif}</span><CopyButton text={wif} label="Copy recovery key" /></div>
        ) : (
          <button type="button" className="btn sm btn-secondary" onClick={() => recoveryWif(s.keyHex).then(setWif)}>Show key</button>
        )}
      </details>
      <button type="button" className={`btn block ${finished ? 'btn-primary' : 'btn-secondary'}`} style={{ marginTop: 16 }} onClick={() => update(null)}>
        {finished ? 'Start another' : 'Cancel and start over'}
      </button>
    </>
  )
}
