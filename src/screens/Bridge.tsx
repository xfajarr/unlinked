import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowDownUp, Check, ChevronDown, Search } from 'lucide-react'
import { BCH_ASSET, xchainQuote, xchainStatus, xchainSubmit, type XStatus, type XToken } from '../lib/api'
import { EXPLORER_TX } from '../lib/config'
import {
  BCH_ASSETS, BUY_RESERVE, bchAsset, buyAndPay, estimateBuy, estimateSell, fromUnits, holdings, keyInfo, newKey, parseBchAddress, planSell, quoteSell,
  recoveryWif, sellAndDeposit, toUnits, type BchAsset, type BchAssetId,
} from '../lib/bridge'
import { CopyButton, Modal } from '../ui'
import { EVM_CHAIN_ID, WC_PROJECT_ID, connectInjected, connectWalletConnect, hasInjected, sendErc20, type EvmWallet } from '../lib/evm'
import { sendWithWallet, walletAddress } from '../lib/wallet'
import { cleanAmount } from './pay/format'
import { LiveStatus, Notice } from './pay/PayShell'
import { MAIN_CHAINS, chainName, groupByChain, useXTokens } from './pay/tokens'
import { DRY_RECIPIENT, EVM, friendlyQuoteError, refundLooksValid } from './pay/xchain'
import { SiteNav } from './SiteNav'
import '../styles/bridge.css'

const ChainLogo = lazy(() => import('./pay/xicons').then((m) => ({ default: m.ChainLogo })))
const TokenLogo = lazy(() => import('./pay/xicons').then((m) => ({ default: m.TokenLogo })))
const Blank = ({ size }: { size: number }) => <span className="pay-chain-letter" style={{ width: size, height: size }} aria-hidden />
const Chain = ({ id, size = 20 }: { id: string; size?: number }) => <Suspense fallback={<Blank size={size} />}><ChainLogo id={id} size={size} /></Suspense>
const Token = ({ symbol, size = 28 }: { symbol: string; size?: number }) => <Suspense fallback={<Blank size={size} />}><TokenLogo symbol={symbol} size={size} /></Suspense>

const STORE = 'unlinked:bridge'
const STABLES = new Set(['USDC', 'USDT', 'DAI'])
const POLL = 8000
// dry quotes move nothing, but NEAR still checks address formats; these stand in until the user types their own
const dryAddress = (chain: string) => (EVM.has(chain) ? '0x1111111111111111111111111111111111111111' : chain === 'sol' ? 'So11111111111111111111111111111111111111112' : chain === 'tron' ? 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' : '')
const TINT: Record<BchAssetId, string> = { PUSD: '#16a34a', MUSD: '#7c3aed', BCH: '#0ac18e' }

type Dir = 'in' | 'out'
type Saved = {
  dir: Dir
  asset: BchAssetId
  keyHex?: string
  chain: string
  assetId: string
  symbol: string
  amount: string
  bch: string
  other: string
  depositAddress?: string
  depositMemo?: string
  amountOut?: string
  contract?: string
  inUnits?: string
  sentTx?: string
  swapTxid?: string
  units?: string
  stage: 'deposit' | 'bridging' | 'done' | 'failed'
  note?: string
}

const load = (): Saved | null => {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Saved | null
    return s && s.asset ? s : null
  } catch {
    return null
  }
}
const short = (a: string, n = 6) => (a.length > 2 * n + 14 ? `${a.slice(0, n + 12)}…${a.slice(-n)}` : a)

function AssetMark({ a, size = 28 }: { a: BchAsset; size?: number }) {
  if (a.id === 'BCH') return <Token symbol="BCH" size={size} />
  return <span className="br-letter" style={{ width: size, height: size, background: TINT[a.id], fontSize: size * 0.42 }} aria-hidden>{a.id[0]}</span>
}

export default function Bridge() {
  const [run, setRun] = useState<Saved | null>(load)
  const update = (s: Saved | null) => {
    // a cancelled token run may still receive funds, so its key is kept
    if (!s && run?.keyHex && run.stage !== 'done') {
      try {
        const old = JSON.parse(localStorage.getItem(STORE + ':keys') ?? '[]') as string[]
        localStorage.setItem(STORE + ':keys', JSON.stringify([...old, run.keyHex]))
      } catch { /* storage unavailable */ }
    }
    try {
      if (s) localStorage.setItem(STORE, JSON.stringify(s))
      else localStorage.removeItem(STORE)
    } catch { /* private mode: the run still works until the tab closes */ }
    setRun(s)
  }
  return (
    <div className="br-root">
      <SiteNav page="bridge" />
      <main className="br-main">
        <div className="br-head">
          <h1>Bridge</h1>
          <p>Move stablecoins between other chains and Bitcoin Cash. No account needed.</p>
        </div>
        <div className="br-card">{run ? <Run s={run} update={update} /> : <Form onStart={update} />}</div>
      </main>
    </div>
  )
}

function Side({ label, picker, children, foot }: { label: string; picker: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="br-side">
      <div className="br-side-top">
        <span className="br-side-label">{label}</span>
      </div>
      <div className="br-side-row">
        <div className="br-side-amt">{children}</div>
        {picker}
      </div>
      {foot && <div className="br-side-foot">{foot}</div>}
    </div>
  )
}

function Form({ onStart }: { onStart: (s: Saved) => void }) {
  const x = useXTokens()
  const pairs = useMemo(() => {
    if (!x.tokens) return null
    const out: XToken[] = []
    for (const list of groupByChain(x.tokens).values()) out.push(...list.filter((t) => STABLES.has(t.symbol.toUpperCase())))
    const rank = (c: string) => (MAIN_CHAINS.includes(c) ? MAIN_CHAINS.indexOf(c) : 99)
    return out.sort((a, b) => rank(a.blockchain) - rank(b.blockchain) || chainName(a.blockchain).localeCompare(chainName(b.blockchain)) || a.symbol.localeCompare(b.symbol))
  }, [x.tokens])
  const [dir, setDir] = useState<Dir>('in')
  const [assetId, setAssetId] = useState('')
  const [asset, setAsset] = useState<BchAssetId>('PUSD')
  const [amount, setAmount] = useState('')
  const [bch, setBch] = useState('')
  const [other, setOther] = useState('')
  const [pick, setPick] = useState<'other' | 'bch' | null>(null)
  const [estimate, setEstimate] = useState<{ key: string; out?: string; time?: number; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const token = pairs?.find((t) => t.assetId === assetId) ?? pairs?.[0]
  const chain = token?.blockchain ?? 'base'
  const A = bchAsset(asset)
  const decimals = dir === 'in' ? token?.decimals ?? 6 : A.decimals
  const units = toUnits(amount || '0', decimals)
  const usd = dir === 'in' && token ? Number(amount || 0) * token.price : null

  const otherOk = refundLooksValid(chain, other)
  const [bchInfo, setBchInfo] = useState<{ ok: boolean; tokens: boolean } | null>(null)
  useEffect(() => {
    let on = true
    if (!bch.trim()) {
      setBchInfo(null)
      return
    }
    parseBchAddress(bch).then((r) => on && setBchInfo({ ok: !!r, tokens: !!r?.tokens }))
    return () => {
      on = false
    }
  }, [bch])
  const needsZ = dir === 'in' && A.category !== null
  const bchOk = !!bchInfo?.ok && (!needsZ || bchInfo.tokens)

  const quoteOther = otherOk ? other.trim() : dryAddress(chain)
  const key = `${dir}|${asset}|${token?.assetId}|${units}|${quoteOther}`
  useEffect(() => {
    if (!token || units <= 0n || !quoteOther) return
    let on = true
    const t = setTimeout(async () => {
      try {
        if (dir === 'in') {
          const q = await xchainQuote({ data: { originAsset: token.assetId, amount: units.toString(), recipient: DRY_RECIPIENT, refundTo: quoteOther, dry: true } })
          if ('error' in q) throw new Error(friendlyQuoteError(q.error, chainName(chain)))
          const out = A.category ? fromUnits(await estimateBuy(A.category, toUnits(q.amountOut, 8)), A.decimals) : q.amountOut
          if (on) setEstimate({ key, out, time: q.timeEstimate })
        } else {
          const sats = A.category ? (await estimateSell(A.category, units)) - 3000n : units
          if (sats <= 0n) throw new Error('That amount is too small to bridge.')
          const q = await xchainQuote({ data: { originAsset: BCH_ASSET, destinationAsset: token.assetId, amount: sats.toString(), recipient: quoteOther, refundTo: DRY_RECIPIENT, dry: true } })
          if ('error' in q) throw new Error(friendlyQuoteError(q.error, chainName(chain)))
          if (on) setEstimate({ key, out: q.amountOut, time: q.timeEstimate })
        }
      } catch (e) {
        if (on) setEstimate({ key, error: e instanceof Error ? e.message : 'Could not get a price. Try again.' })
      }
    }, 600)
    return () => {
      on = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const live = estimate?.key === key ? estimate : null

  const [filling, setFilling] = useState<'bch' | 'evm' | null>(null)
  const fillBch = async () => {
    setFilling('bch')
    try {
      const w = await walletAddress()
      setBch(dir === 'in' && A.category ? w.tokenAddress : w.address)
    } catch (e) {
      if (!/cancel/i.test(String(e))) setError(e instanceof Error ? e.message : 'Could not read the wallet address.')
    } finally {
      setFilling(null)
    }
  }
  const fillEvm = async () => {
    setFilling('evm')
    try {
      setOther((await connectInjected()).account)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the wallet address.')
    } finally {
      setFilling(null)
    }
  }
  const bchFill = <button type="button" className="br-mini" disabled={!!filling} onClick={fillBch}>{filling === 'bch' ? 'Connecting…' : 'Use my BCH wallet'}</button>
  const evmFill = EVM_CHAIN_ID[chain] && hasInjected() ? <button type="button" className="br-mini" disabled={!!filling} onClick={fillEvm}>{filling === 'evm' ? 'Connecting…' : 'Use my wallet'}</button> : null

  const start = async () => {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const user = await parseBchAddress(bch)
      if (!user) throw new Error("That doesn't look like a Bitcoin Cash address.")
      const base: Saved = { dir, asset, chain, assetId: token.assetId, symbol: token.symbol, amount, bch: bch.trim(), other: other.trim(), stage: 'deposit' }
      const k = A.category ? await newKey() : null
      if (dir === 'in') {
        const q = await xchainQuote({ data: { originAsset: token.assetId, amount: units.toString(), recipient: k ? k.address : user.plain, refundTo: other.trim() } })
        if ('error' in q) throw new Error(friendlyQuoteError(q.error, chainName(chain)))
        onStart({ ...base, keyHex: k?.keyHex, depositAddress: q.depositAddress, depositMemo: q.depositMemo, amountOut: q.amountOut, contract: token.contractAddress, inUnits: units.toString() })
      } else if (!k) {
        const q = await xchainQuote({ data: { originAsset: BCH_ASSET, destinationAsset: token.assetId, amount: units.toString(), recipient: other.trim(), refundTo: user.plain } })
        if ('error' in q) throw new Error(friendlyQuoteError(q.error, chainName(chain)))
        onStart({ ...base, depositAddress: q.depositAddress, amountOut: q.amountOut })
      } else onStart({ ...base, keyHex: k.keyHex })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!pairs || !token) {
    return x.failed ? <Notice>Couldn't load tokens. <button type="button" className="btn sm btn-secondary" onClick={x.reload}>Retry</button></Notice> : <Skeleton />
  }

  const otherPicker = (
    <button type="button" className="br-sel" onClick={() => setPick('other')} aria-label={`${token.symbol} on ${chainName(chain)}, change`}>
      <span className="br-sel-ico"><Token symbol={token.symbol} /><span className="br-sel-chain"><Chain id={chain} size={14} /></span></span>
      <span className="br-sel-txt"><b>{token.symbol}</b><small>{chainName(chain)}</small></span>
      <ChevronDown size={16} />
    </button>
  )
  const bchPicker = (
    <button type="button" className="br-sel" onClick={() => setPick('bch')} aria-label={`${A.id} on Bitcoin Cash, change`}>
      <span className="br-sel-ico"><AssetMark a={A} /><span className="br-sel-chain"><Chain id="bch" size={14} /></span></span>
      <span className="br-sel-txt"><b>{A.id}</b><small>Bitcoin Cash</small></span>
      <ChevronDown size={16} />
    </button>
  )
  const amountInput = (
    <input
      className="br-amt"
      inputMode="decimal"
      autoComplete="off"
      placeholder="0"
      aria-label="Amount to send"
      value={amount}
      onChange={(e) => (setAmount(cleanAmount(e.target.value, decimals)), setError(null))}
    />
  )
  const output = (
    <span className={`br-amt br-out${live?.out ? '' : ' empty'}`} aria-live="polite">
      {units > 0n && !quoteOther ? '…' : units > 0n && !live ? '…' : live?.out ?? '0'}
    </span>
  )
  const outSym = dir === 'in' ? A.id : token.symbol
  const route = dir === 'in'
    ? [`${token.symbol} on ${chainName(chain)}`, 'NEAR Intents', ...(A.category ? ['BCH', 'Cauldron'] : []), `${A.id} on BCH`]
    : [`${A.id} on BCH`, ...(A.category ? ['Cauldron', 'BCH'] : []), 'NEAR Intents', `${token.symbol} on ${chainName(chain)}`]
  const ready = units > 0n && bchOk && otherOk && !!live?.out && !busy

  return (
    <>
      <Side label="From" picker={dir === 'in' ? otherPicker : bchPicker} foot={usd ? `≈ $${usd.toFixed(2)}` : dir === 'out' ? `${A.name} on Bitcoin Cash` : null}>
        {amountInput}
      </Side>
      <div className="br-flip-row">
        <button type="button" className="br-flip" aria-label="Switch direction" onClick={() => (setDir(dir === 'in' ? 'out' : 'in'), setAmount(''), setError(null))}>
          <ArrowDownUp size={18} strokeWidth={2.4} />
        </button>
      </div>
      <Side label="To" picker={dir === 'in' ? bchPicker : otherPicker} foot={live?.error ? <span className="br-err">{live.error}</span> : units > 0n && !quoteOther ? `Enter your ${chainName(chain)} address to see the price.` : live?.out ? `You get about ${live.out} ${outSym}` : null}>
        {output}
      </Side>

      <div className="br-fields">
        {dir === 'in' ? (
          <>
            <Field label={`Receive ${A.id} at (Bitcoin Cash)`} action={bchFill} value={bch} onChange={setBch} placeholder={A.category ? 'bitcoincash:z…' : 'bitcoincash:q…'}
              hint={bchInfo && !bchInfo.ok ? "That doesn't look like a Bitcoin Cash address." : needsZ && bchInfo?.ok && !bchInfo.tokens ? `${A.id} is a CashToken. Use your token address, it starts with bitcoincash:z.` : null} />
            <Field label={`Refund address on ${chainName(chain)}`} action={evmFill} value={other} onChange={setOther} placeholder={`${chainName(chain)} address`} hint={other.trim() && !otherOk ? `That doesn't look like a ${chainName(chain)} address.` : null} />
          </>
        ) : (
          <>
            <Field label={`Receive ${token.symbol} at (${chainName(chain)})`} action={evmFill} value={other} onChange={setOther} placeholder={`${chainName(chain)} address`} hint={other.trim() && !otherOk ? `That doesn't look like a ${chainName(chain)} address.` : null} />
            <Field label="Refund address on Bitcoin Cash" action={bchFill} value={bch} onChange={setBch} placeholder="bitcoincash:q…" hint={bchInfo && !bchInfo.ok ? "That doesn't look like a Bitcoin Cash address." : null} />
          </>
        )}
      </div>

      <div className="br-route" aria-label="Route">
        <div className="br-route-row"><span>Route</span><span className="br-route-path">{route.map((r, i) => <span key={i}>{i > 0 && <i>→</i>}{r}</span>)}</span></div>
        {live?.time ? <div className="br-route-row"><span>Time</span><span>about {Math.max(1, Math.round(live.time / 60))} min{A.category ? ', plus one BCH transaction' : ''}</span></div> : null}
        <div className="br-route-row"><span>Fees</span><span>{A.category ? 'NEAR Intents spread, Cauldron pool fee, about 1,000 sat in BCH fees' : 'NEAR Intents spread'}</span></div>
      </div>

      {error && <Notice>{error}</Notice>}
      <button type="button" className="btn btn-primary block br-go" disabled={!ready} onClick={start}>
        {busy ? 'Working…' : units <= 0n ? 'Enter an amount' : !otherOk || !bchOk ? 'Add both addresses' : dir === 'in' ? 'Get deposit address' : `Bridge ${A.id}`}
      </button>

      {pick === 'other' && (
        <OtherPicker pairs={pairs} value={token.assetId} onPick={(id) => (setAssetId(id), setPick(null), setOther(''))} onClose={() => setPick(null)} />
      )}
      {pick === 'bch' && (
        <Modal title="Asset on Bitcoin Cash" onClose={() => setPick(null)}>
          <div className="pay-chain-list">
            {BCH_ASSETS.map((a) => (
              <button key={a.id} type="button" className={`choice${a.id === asset ? ' on' : ''}`} aria-pressed={a.id === asset} onClick={() => (setAsset(a.id), setPick(null))}>
                <AssetMark a={a} size={40} />
                <div style={{ minWidth: 0 }}>
                  <div className="choice-name">{a.id}</div>
                  <div className="choice-sym">{a.name}{a.category ? ', swapped on Cauldron' : ', native'}</div>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}

function Skeleton() {
  const side = (label: string) => (
    <div className="br-side">
      <span className="br-side-label">{label}</span>
      <div className="br-side-row">
        <span className="br-sk br-sk-amt" />
        <span className="br-sk br-sk-pill"><span className="br-sk-coin" /><span className="br-sk-lines"><i /><i /></span></span>
      </div>
      <span className="br-sk br-sk-foot" />
    </div>
  )
  return (
    <div className="br-skel" role="status" aria-live="polite">
      {side('From')}
      <div className="br-flip-row"><span className="br-flip br-flip-load" aria-hidden><ArrowDownUp size={18} strokeWidth={2.4} /></span></div>
      {side('To')}
      <div className="br-skel-route" aria-hidden>
        <span className="br-skel-node"><Chain id="eth" size={22} /></span>
        <span className="br-skel-track"><i /><i /><i /></span>
        <span className="br-skel-node"><Token symbol="USDC" size={22} /></span>
        <span className="br-skel-track"><i /><i /><i /></span>
        <span className="br-skel-node bch"><Chain id="bch" size={22} /></span>
      </div>
      <p className="br-skel-note">Finding stablecoin routes<span className="br-dots"><i>.</i><i>.</i><i>.</i></span></p>
    </div>
  )
}

function Field({ label, action, value, onChange, placeholder, hint }: { label: string; action?: ReactNode; value: string; onChange: (v: string) => void; placeholder: string; hint?: string | null }) {
  const id = useId()
  return (
    <div className="pay-field">
      <div className="br-label-row">
        <label className="pay-label" htmlFor={id}>{label}</label>
        {action}
      </div>
      <input id={id} className="field mono pay-refund" spellCheck={false} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <span className="help">{hint}</span>}
    </div>
  )
}

function OtherPicker({ pairs, value, onPick, onClose }: { pairs: XToken[]; value: string; onPick: (assetId: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const hits = pairs.filter((t) => !term || t.symbol.toLowerCase().includes(term) || chainName(t.blockchain).toLowerCase().includes(term) || t.blockchain.includes(term))
  return (
    <Modal title="Stablecoin and chain" onClose={onClose}>
      <div className="field-wrap">
        <span className="field-prefix"><Search size={18} /></span>
        <input className="field pre" autoFocus placeholder="Search token or chain" aria-label="Search token or chain" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="pay-chain-list">
        {hits.map((t) => (
          <button key={t.assetId} type="button" className={`choice${t.assetId === value ? ' on' : ''}`} aria-pressed={t.assetId === value} onClick={() => onPick(t.assetId)}>
            <span className="br-sel-ico"><Token symbol={t.symbol} size={40} /><span className="br-sel-chain lg"><Chain id={t.blockchain} size={18} /></span></span>
            <div style={{ minWidth: 0 }}>
              <div className="choice-name">{t.symbol}</div>
              <div className="choice-sym">on {chainName(t.blockchain)}</div>
            </div>
          </button>
        ))}
        {hits.length === 0 && <p className="help">Nothing matches "{q}".</p>}
      </div>
    </Modal>
  )
}

function Steps({ items, at }: { items: string[]; at: number }) {
  return (
    <ol className="br-steps">
      {items.map((t, i) => (
        <li key={i} className={i < at ? 'done' : i === at ? 'now' : ''}>
          <span className="br-step-dot">{i < at ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  )
}

function Run({ s, update }: { s: Saved; update: (s: Saved | null) => void }) {
  const [status, setStatus] = useState<XStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [keyAddr, setKeyAddr] = useState<string | null>(null)
  const [wif, setWif] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [walletErr, setWalletErr] = useState<string | null>(null)
  const [wcUri, setWcUri] = useState<string | null>(null)
  const working = useRef(false)
  const latest = useRef(s)
  useEffect(() => {
    latest.current = s
  }, [s])
  const A = bchAsset(s.asset)
  const chain = chainName(s.chain)

  useEffect(() => {
    if (s.keyHex) keyInfo(s.keyHex).then((k) => setKeyAddr(k.tokenAddress))
  }, [s.keyHex])

  useEffect(() => {
    if (s.stage === 'done' || s.stage === 'failed') return
    let on = true
    const tick = async () => {
      if (working.current) return
      const cur = latest.current
      const A = bchAsset(cur.asset)
      try {
        const user = await parseBchAddress(cur.bch)
        if (!user) throw new Error('Your BCH address is not valid.')
        const near = async () => {
          if (!cur.depositAddress) return null
          const st = await xchainStatus({ data: { depositAddress: cur.depositAddress, depositMemo: cur.depositMemo } }).catch(() => null)
          if (on && st) setStatus(st)
          return st
        }
        if (cur.dir === 'in') {
          const st = await near()
          if (st === 'REFUNDED' || st === 'FAILED') return update({ ...cur, stage: 'failed', note: `NEAR Intents returned your ${cur.symbol} to your refund address.` })
          if (!cur.keyHex) {
            if (st === 'SUCCESS') update({ ...cur, stage: 'done' })
          } else {
            const k = await keyInfo(cur.keyHex)
            const h = await holdings(k.address, null)
            if (h.sats > BUY_RESERVE) {
              working.current = true
              const r = await buyAndPay(k, A.category!, user.lock)
              update({ ...cur, stage: 'done', swapTxid: r.txid, units: r.units.toString() })
            }
          }
        } else if (cur.keyHex && cur.stage === 'deposit') {
          const k = await keyInfo(cur.keyHex)
          const h = await holdings(k.address, A.category)
          if (h.tokens > 0n) {
            working.current = true
            const plan = await planSell(k, A.category!)
            const q = await quoteSell(plan, cur.assetId, cur.other, user.plain)
            const txid = await sellAndDeposit(k, A.category!, q.depositAddress, q.sats, user.lock)
            xchainSubmit({ data: { txHash: txid, depositAddress: q.depositAddress } }).catch(() => {})
            update({ ...cur, stage: 'bridging', swapTxid: txid, depositAddress: q.depositAddress, amountOut: q.amountOut, units: plan.units.toString() })
          }
        } else {
          const st = await near()
          if (st === 'SUCCESS') update({ ...cur, stage: 'done' })
          if (st === 'REFUNDED' || st === 'FAILED') update({ ...cur, stage: 'failed', note: 'NEAR Intents sent the BCH back to your refund address.' })
          if (st === 'KNOWN_DEPOSIT_TX' || st === 'PROCESSING') {
            if (cur.stage === 'deposit') update({ ...cur, stage: 'bridging' })
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.stage])

  const seen = status === 'KNOWN_DEPOSIT_TX' || status === 'PROCESSING'
  const steps =
    s.dir === 'in'
      ? A.category
        ? [`Send ${s.amount} ${s.symbol} on ${chain}`, 'NEAR Intents swaps it to BCH', `Cauldron swaps the BCH to ${A.id} and pays you`]
        : [`Send ${s.amount} ${s.symbol} on ${chain}`, 'NEAR Intents swaps it to BCH and pays you']
      : A.category
        ? [`Send ${s.amount} ${A.id} to the bridge address`, `Cauldron sells it and pays NEAR in one transaction`, `NEAR Intents sends ${s.symbol} on ${chain}`]
        : [`Send ${s.amount} BCH to the NEAR deposit address`, `NEAR Intents sends ${s.symbol} on ${chain}`]
  const at =
    s.stage === 'done' ? steps.length
    : s.dir === 'in' ? (status === 'SUCCESS' ? steps.length - 1 : seen ? 1 : 0)
    : A.category ? (s.stage === 'bridging' ? 2 : 0)
    : s.stage === 'bridging' || seen ? 1 : 0
  const finished = s.stage === 'done' || s.stage === 'failed'
  const txLink = s.swapTxid ? <a href={EXPLORER_TX + s.swapTxid} target="_blank" rel="noreferrer" className="mono">{short(s.swapTxid, 8)}</a> : null
  const sendTo = s.dir === 'in' ? s.depositAddress : A.category ? keyAddr : s.depositAddress
  const showDeposit = !finished && at === 0 && sendTo
  const qrValue = sendTo && s.dir === 'out' && !A.category ? `${sendTo}?amount=${s.amount}` : sendTo
  const chainId = EVM_CHAIN_ID[s.chain]
  const evmPay = s.dir === 'in' && chainId && s.contract?.startsWith('0x') && s.inUnits && !s.depositMemo

  const sent = (tx: string) => update({ ...latest.current, sentTx: tx })
  const payEvm = async (kind: 'injected' | 'walletconnect') => {
    setSending(kind)
    setWalletErr(null)
    try {
      const w: EvmWallet = kind === 'injected' ? await connectInjected() : await connectWalletConnect(chainId!, setWcUri)
      setWcUri(null)
      const tx = await sendErc20(w, chainId!, chain, s.contract!, s.depositAddress!, BigInt(s.inUnits!))
      xchainSubmit({ data: { txHash: tx, depositAddress: s.depositAddress! } }).catch(() => {})
      sent(tx)
      if (w.kind === 'walletconnect') w.provider.disconnect?.().catch(() => {})
    } catch (e) {
      setWcUri(null)
      setWalletErr(e instanceof Error ? e.message : 'The wallet did not send the transfer.')
    } finally {
      setSending(null)
    }
  }
  const payBch = async () => {
    if (!sendTo) return
    setSending('wizard')
    setWalletErr(null)
    try {
      const tx = await sendWithWallet({ to: sendTo, category: A.category, units: toUnits(s.amount, A.decimals), label: A.id, prompt: `Bridge ${s.amount} ${A.id} to ${s.symbol} on ${chain}` })
      if (!A.category && s.depositAddress) xchainSubmit({ data: { txHash: tx, depositAddress: s.depositAddress } }).catch(() => {})
      sent(tx)
    } catch (e) {
      if (!/cancel/i.test(String(e))) setWalletErr(e instanceof Error ? e.message : 'The wallet did not send it.')
    } finally {
      setSending(null)
    }
  }

  return (
    <>
      <div className="br-run-head">
        {s.stage === 'done' ? (
          <>
            <h2>{s.dir === 'in' ? `${s.units ? fromUnits(BigInt(s.units), A.decimals) : s.amountOut} ${A.id} sent` : `${s.amountOut} ${s.symbol} sent`}</h2>
            <p>{s.dir === 'in' ? `to ${short(s.bch)}` : `to ${short(s.other)} on ${chain}`}</p>
          </>
        ) : s.stage === 'failed' ? (
          <h2>The bridge didn't finish</h2>
        ) : showDeposit ? (
          <>
            <h2>Send {s.amount} {s.dir === 'in' ? s.symbol : A.id}</h2>
            <p>{s.dir === 'in' ? `on ${chain}, exactly this amount, once` : A.category ? 'from a CashTokens wallet such as Cashonize or Paytaca' : 'from any BCH wallet, exactly this amount'}</p>
          </>
        ) : (
          <>
            <h2>Bridging</h2>
            <p>{s.dir === 'in' ? (A.category ? `about ${s.amountOut} BCH worth of ${A.id} to ${short(s.bch)}` : `about ${s.amountOut} BCH to ${short(s.bch)}`) : `about ${s.amountOut ?? '…'} ${s.symbol} to ${short(s.other)} on ${chain}`}</p>
          </>
        )}
      </div>

      {showDeposit && (
        <>
          <div className="center"><div className="pay-qr"><QRCodeSVG value={qrValue!} size={200} level="M" fgColor="#0b0d14" aria-label="Deposit address" /></div></div>
          <div className="link-box">
            <span className="url mono pay-addr">{sendTo}</span>
            <CopyButton text={sendTo!} label="Copy address" />
          </div>
          {s.depositMemo && (
            <div className="link-box">
              <span className="url mono pay-addr">Memo {s.depositMemo}</span>
              <CopyButton text={s.depositMemo} label="Copy memo" />
            </div>
          )}
          {!s.sentTx && (
            <div className="br-wallets">
              {s.dir === 'out' ? (
                <button type="button" className="btn btn-primary block" disabled={!!sending} onClick={payBch}>{sending ? 'Waiting for your wallet…' : `Send with WizardConnect`}</button>
              ) : evmPay ? (
                <>
                  {hasInjected() && <button type="button" className="btn btn-primary block" disabled={!!sending} onClick={() => payEvm('injected')}>{sending === 'injected' ? 'Confirm in your wallet…' : `Send ${s.symbol} with browser wallet`}</button>}
                  {WC_PROJECT_ID && <button type="button" className={`btn block ${hasInjected() ? 'btn-secondary' : 'btn-primary'}`} disabled={!!sending} onClick={() => payEvm('walletconnect')}>{sending === 'walletconnect' ? 'Confirm in your wallet…' : 'Send with WalletConnect'}</button>}
                </>
              ) : null}
              <p className="help">Or send it yourself to the address above.</p>
            </div>
          )}
          {s.sentTx && <p className="help">Sent: <span className="mono">{short(s.sentTx, 8)}</span>. Waiting for it to arrive.</p>}
          {walletErr && <Notice>{walletErr}</Notice>}
        </>
      )}
      {wcUri && (
        <Modal title="Scan with your wallet" onClose={() => (setWcUri(null), setSending(null))}>
          <div className="center"><div className="pay-qr"><QRCodeSVG value={wcUri} size={220} level="M" fgColor="#0b0d14" aria-label="WalletConnect QR code" /></div></div>
          <div className="link-box"><span className="url mono pay-addr">{wcUri}</span><CopyButton text={wcUri} label="Copy link" /></div>
          <p className="help">Open a WalletConnect wallet such as MetaMask, Rainbow or Trust Wallet and scan this code.</p>
        </Modal>
      )}

      <Steps items={steps} at={at} />
      {s.stage === 'failed' && <Notice>{s.note}</Notice>}
      {!finished && <LiveStatus>{at === 0 ? 'Waiting for your deposit.' : 'Working on it. You can keep this page open or come back later.'}</LiveStatus>}
      {txLink && <p className="help">BCH transaction: {txLink}</p>}
      {error && !finished && <Notice tone="info" role="status">{error}</Notice>}

      {s.keyHex && (
        <details className="help br-recovery">
          <summary>Recovery key</summary>
          <p>This run uses a key saved in this browser. If the page can't finish, import this key into a BCH wallet to get the funds back.</p>
          {wif ? (
            <div className="link-box"><span className="url mono pay-addr">{wif}</span><CopyButton text={wif} label="Copy recovery key" /></div>
          ) : (
            <button type="button" className="btn sm btn-secondary" onClick={() => recoveryWif(s.keyHex!).then(setWif)}>Show key</button>
          )}
        </details>
      )}
      <button type="button" className={`btn block br-go ${finished ? 'btn-primary' : 'btn-secondary'}`} onClick={() => update(null)}>
        {finished ? 'Bridge again' : 'Cancel and start over'}
      </button>
    </>
  )
}
