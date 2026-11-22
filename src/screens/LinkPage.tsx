import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Download, ExternalLink, MessageCircle, MoreHorizontal, Send, X, Zap } from 'lucide-react'
import { Avatar, ChainIcon, CopyButton, XIcon } from '../ui'
import type { ChainId } from '../data'
import { useAccount } from '../app/account'
import { linkFor, linkHost } from '../app/format'
import { xchainTokens } from '../lib/api'
import { fingerprint } from '../lib/fingerprint'
import { XCHAIN_ENABLED } from '../lib/config'

function Sparkle({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#fff"><path d="M12 0c.6 6.2 5.8 11.4 12 12-6.2.6-11.4 5.8-12 12-.6-6.2-5.8-11.4-12-12C6.2 11.4 11.4 6.2 12 0z" /></svg>
  )
}

const SHOWN_CHAINS: ChainId[] = ['bch', 'ethereum', 'base', 'arbitrum', 'solana', 'tron']

export default function LinkPage() {
  const { stored } = useAccount()
  const handle = stored.handle
  const [accepts, setAccepts] = useState<{ chains: number; tokens: number } | null>(null)
  const [fp, setFp] = useState<string | null>(null)
  useEffect(() => {
    fingerprint(stored.scanPub, stored.spendPub).then(setFp, () => setFp(null))
  }, [stored.scanPub, stored.spendPub])
  useEffect(() => {
    if (!XCHAIN_ENABLED) return
    let live = true
    xchainTokens()
      .then((all) => live && setAccepts({ chains: new Set(all.map((t) => t.blockchain)).size, tokens: all.length }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const qrRef = useRef<HTMLDivElement>(null)

  const q = new URLSearchParams()
  if (Number(amount) > 0) q.set('amount', amount)
  if (note.trim()) q.set('note', note.trim())
  const path = `@${handle}${q.toString() ? `?${q}` : ''}`
  const url = linkFor(handle) + (q.toString() ? `?${q}` : '')
  const requesting = Number(amount) > 0 || note.trim() !== ''
  const msg = encodeURIComponent(
    Number(amount) > 0 ? `Pay me $${amount}${note.trim() ? ` for ${note.trim()}` : ''}, privately: ${url}` : `Pay me privately: ${url}`,
  )

  const downloadQr = () => {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
    a.download = `unlinked-${handle}.svg`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <main className="main">
      <div className="page-head">
        <div className="hstack" style={{ gap: 16 }}>
          <div>
          <h1 className="page-title">Payment link</h1>
          <p className="page-sub">One link for every client. Each payment lands in a fresh address.</p>
          </div>
        </div>
        <div className="hstack" style={{ gap: 10 }}>
          <a className="btn btn-secondary md" href={`/${path}`} style={{ textDecoration: 'none' }}><ExternalLink size={18} />Preview</a>
          <button className="btn btn-secondary md" onClick={downloadQr}><Download size={18} />Save QR</button>
        </div>
      </div>

      <section className="card link-hero">
        <div className="link-hero-qr">
          <div className="scene" aria-hidden>
            <img className="scene-ribbon" src="/art/ribbon.webp" alt="" />
            <img className="scene-ribbon two" src="/art/ribbon.webp" alt="" />
            <img className="scene-globe" src="/art/globe.webp" alt="" />
            <img className="scene-clouds" src="/art/clouds.webp" alt="" />
            <img className="coin coin-eth" src="/art/coin-eth.webp" alt="" />
            <img className="coin coin-usdt" src="/art/coin-usdt.webp" alt="" />
            <img className="coin coin-btc" src="/art/coin-btc.webp" alt="" />
            <img className="coin coin-sol" src="/art/coin-sol.webp" alt="" />
            <Sparkle className="spark s1" />
            <Sparkle className="spark s2" />
            <Sparkle className="spark s3" />
          </div>

          <div className="hstack scene-top" style={{ gap: 12 }}>
            <Avatar handle={handle} size={48} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, letterSpacing: '-0.015em' }}>@{handle}</div>
              <div className="muted" style={{ fontSize: 14 }}>Scan to pay</div>
            </div>
          </div>
          <div className="qr-halo">
            <div className="qr-tile qr-wrap" ref={qrRef}>
              <QRCodeSVG value={url} size={228} level="H" fgColor="#0b0d14" imageSettings={{ src: '/mark.svg', height: 46, width: 46, excavate: true }} />
            </div>
          </div>
          <div className="request-chip" data-on={requesting}>
            <Zap size={15} strokeWidth={2.4} />
            {requesting ? <>Asking {Number(amount) > 0 ? <b className="tnum">${amount}</b> : 'any amount'}{note.trim() && <>, {note.trim()}</>}</> : XCHAIN_ENABLED ? 'Any amount, any token' : 'Any amount'}
          </div>
        </div>

        <div className="link-hero-side">
          <div>
            <h2 className="label">Your link</h2>
            <div className="link-box" style={{ marginTop: 10 }}>
              <span className="url" title={url}><span className="dim">{linkHost()}/</span>{path}</span>
              <CopyButton text={url} label="Copy link" />
            </div>
            {fp && <p className="muted" style={{ margin: '10px 4px 0', fontSize: 14 }}>Key fingerprint <span className="mono soft">{fp}</span>. Payers see it on your pay page, so nobody can swap your keys unnoticed.</p>}
          </div>

          <div>
            <div className="hstack" style={{ justifyContent: 'space-between' }}>
              <h2 className="label">Ask for a set amount <span className="muted">(optional)</span></h2>
              {requesting && (
                <button className="btn-ghost hstack" style={{ gap: 4, fontSize: 14 }} onClick={() => { setAmount(''); setNote('') }}>
                  <X size={15} />Clear
                </button>
              )}
            </div>
            <div className="hstack stack-sm" style={{ gap: 10, marginTop: 10 }}>
              <div className="field-wrap" style={{ flex: '0 0 36%' }}>
                <span className="field-prefix">$</span>
                <input className="field pre tnum" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, '').slice(0, 9))} aria-label="Amount in USD" />
              </div>
              <input className="field" placeholder="What it’s for" value={note} maxLength={40} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
            </div>
          </div>

          <div>
            <h2 className="label">Share</h2>
            <div className="share-row">
              <a href={`https://wa.me/?text=${msg}`} target="_blank" rel="noreferrer">
                <span style={{ background: '#25d366' }}><MessageCircle size={22} strokeWidth={2.2} /></span>WhatsApp
              </a>
              <a href={`https://x.com/intent/post?text=${msg}`} target="_blank" rel="noreferrer">
                <span style={{ background: '#0b0d14' }}><XIcon size={18} /></span>X
              </a>
              <a href={`https://t.me/share/url?url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">
                <span style={{ background: '#27a7e7' }}><Send size={20} strokeWidth={2.2} style={{ marginLeft: -2 }} /></span>Telegram
              </a>
              <button onClick={() => navigator.share?.({ title: 'Pay me on Unlinked', url }).catch(() => {})}>
                <span style={{ background: 'var(--well)', color: 'var(--ink-11)' }}><MoreHorizontal size={22} /></span>More
              </button>
            </div>
          </div>

          <div className="accepts">
            <div className="chain-row" aria-label="Supported chains">
              {(XCHAIN_ENABLED ? SHOWN_CHAINS : (['bch'] as ChainId[])).map((c) => <span key={c} className="chain-dot"><ChainIcon chain={c} size={28} /></span>)}
            </div>
            <span className="muted" style={{ fontSize: 14 }}>
              {!XCHAIN_ENABLED ? 'Accepts BCH on chipnet, the test network' : accepts ? <>Accepts <b className="tnum soft">{accepts.chains}</b> chains and <b className="tnum soft">{accepts.tokens}</b> tokens, paid out in BCH</> : 'Accepts BCH and tokens from other chains, paid out in BCH'}
            </span>
          </div>
        </div>
      </section>
    </main>
  )
}
