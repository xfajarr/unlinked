import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, ArrowUpRight, Check, EyeOff, History, KeyRound, Link2, Plus, QrCode, Repeat, ShieldCheck, Unlink } from 'lucide-react'
import { CHAINS, type ChainId, type TokenId } from '../data'
import { QRCodeSVG } from 'qrcode.react'
import { Avatar, ChainIcon, CopyButton, Modal, TokenIcon } from '../ui'
import { go, useStore } from '../App'
import { DECK_URL, DEMO_HANDLE, DONATION_ADDRESS, REPO_URL } from '../lib/config'
import '../styles/landing.css'
import { SiteNav, takePendingSection } from './SiteNav'

function Sparkle({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M12 0c.6 6.2 5.8 11.4 12 12-6.2.6-11.4 5.8-12 12-.6-6.2-5.8-11.4-12-12C6.2 11.4 11.4 6.2 12 0z" /></svg>
  )
}

/** Letters drop in one after another. Words stay unbroken so wrapping is unchanged; `from` continues the stagger. */
function Chars({ text, from = 0 }: { text: string; from?: number }) {
  let i = from
  return (
    <>
      {text.split(/(\s+)/).map((w, wi) =>
        /^\s*$/.test(w) ? w : (
          <span key={wi} className="st-w" aria-hidden>
            {[...w].map((c) => <span key={i} className="st-c" style={{ ['--i' as string]: i++ }}>{c}</span>)}
          </span>
        ),
      )}
    </>
  )
}

const BELT = [
  { addr: 'bitcoincash:qz7x8m…4kfa', handle: 'ava', note: 'Logo design', amt: '+0.0524' },
  { addr: 'bitcoincash:qr9a2c…1mzt', handle: 'noah_design', note: 'Brand kit', amt: '+0.1306' },
  { addr: 'bitcoincash:qp3nd7…8c2d', handle: 'cornercafe', note: 'Coffee order', amt: '+0.0120' },
  { addr: 'bitcoincash:qq5ev0…7hyx', handle: 'leo', note: 'Consulting call', amt: '+0.6309' },
  { addr: 'bitcoincash:qz2kf1…0vwe', handle: 'mia', note: 'Poster design', amt: '+0.5063' },
  { addr: 'bitcoincash:qrm81x…3pla', handle: 'sam_writes', note: 'Website copy', amt: '+0.2815' },
]

const MORE = [
  { icon: Repeat, title: 'Any token, any chain', body: 'Payers send USDC, USDT, ETH, SOL or BCH. It arrives as BCH, swapped through NEAR Intents.' },
  { icon: ShieldCheck, title: 'Private by default', body: 'Each payment moves into Unlinked Shield, a zero-knowledge pool that Bitcoin Cash checks on-chain. Whoever paid you can’t follow where it goes next.' },
  { icon: KeyRound, title: 'Your keys, your device', body: 'Locked with a PIN on your device and backed up with 12 words. We never hold your money.' },
]

function Belt() {
  const [t, setT] = useState(6)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setT((n) => n + 1), 2200)
    return () => clearInterval(id)
  }, [])
  const cards = []
  for (let k = t - 6; k <= t; k++) {
    const slot = t - k // 0..2 above the bar, 3..5 below, 6 leaving
    const item = BELT[((k % BELT.length) + BELT.length) % BELT.length]
    const done = slot >= 3
    cards.push(
      <div key={k} className={`ld-belt-card${done ? ' done' : ''}${slot === 3 ? ' fresh' : ''}${slot === 6 ? ' out' : ''}${slot === 0 ? ' in' : ''}`} style={{ ['--slot' as string]: Math.min(slot, 6) }}>
        <span className={`ld-belt-mark${done ? ' on' : ''}`}><Check size={14} strokeWidth={3.2} /></span>
        <div className="ld-belt-main">
          <div className="ld-belt-face raw">
            <div className="ld-belt-t mono">{item.addr}</div>
            <div className="ld-belt-s">Same address for every client</div>
          </div>
          <div className="ld-belt-face ok">
            <div className="ld-belt-t">Pay link <b>@{item.handle}</b></div>
            <div className="ld-belt-s tnum">{item.amt} BCH, kept private</div>
          </div>
        </div>
        <span className="ld-belt-av"><Avatar handle={item.handle} size={36} /></span>
      </div>,
    )
  }
  return (
    <div className="ld-belt" aria-hidden>
      {cards}
      <div className="ld-belt-bar"><span className="ld-belt-badge"><span className="logo-mark"><Unlink size={14} strokeWidth={2.6} /></span>unlinked</span></div>
    </div>
  )
}

function Phone({ route, className = '' }: { route: string; className?: string }) {
  return (
    <div className={`ld-phone ${className}`} aria-hidden>
      <span className="ld-btn-l b1" /><span className="ld-btn-l b2" /><span className="ld-btn-l b3" /><span className="ld-btn-r" />
      <div className="ld-phone-screen">
        <span className="ld-island" />
        <iframe src={`${route}?embed=1`} title="Unlinked app preview" tabIndex={-1} />
      </div>
    </div>
  )
}

const TOKEN_LIST: TokenId[] = ['BCH', 'USDC', 'USDT', 'ETH', 'SOL']
const CHAIN_LIST: ChainId[] = ['bch', 'ethereum', 'base', 'arbitrum', 'solana', 'tron']

const STEPS = [
  { title: 'Claim your @username', body: 'Pick a name and a PIN. Your keys are made on your device, not on our servers.' },
  { title: 'Share one link', body: 'Post your link or show the QR. Add an amount when you want a set price.' },
  { title: 'Get paid privately', body: 'Every payment lands at a fresh BCH address only you can find, then moves into your private balance.' },
]

const SHOWCASE = [
  { route: '/withdraw', side: 'left', icon: ArrowUpRight, title: 'Withdraw anytime', body: 'Move your BCH to Paytaca, Cashonize or any wallet you like, whenever you want.' },
  { route: '/dashboard', side: 'mid', icon: EyeOff, title: 'One private balance', body: 'Whatever token you’re paid in, it adds up as BCH in one private balance.' },
  { route: '/transactions', side: 'right', icon: History, title: 'Every payment in one list', body: 'See what came in, what you sent and what’s already private.' },
]

const FAQ = [
  { q: 'Who can see what I receive?', a: 'Each payment goes to a one-time address made from your keys, so on the blockchain your payments look unrelated to each other and to you. Shield then moves them into our zero-knowledge pool, so the person who paid you can’t follow where the money goes next.' },
  { q: 'What is Unlinked Shield?', a: 'Our own zero-knowledge pool on Bitcoin Cash. Payments are shielded automatically. Every send or withdraw from your private balance carries a Groth16 proof that BCH Script checks on-chain, and a transfer inside the pool hides the sender, the receiver and the amount.' },
  { q: 'Does the payer need a Bitcoin Cash wallet?', a: 'No. They can pay with stablecoins or other tokens from the wallet they already use. The swap to BCH happens on the way.' },
  { q: 'What happens if a swap fails?', a: 'NEAR Intents refunds the payer’s tokens to the refund address they entered, on their own chain.' },
  { q: 'Is Unlinked custodial?', a: 'No. Your keys are created and stored on your device. If you lose it, your username and 12 words get you back in.' },
  { q: 'Which tokens can people pay with?', a: 'BCH, USDC, USDT, ETH and SOL across Bitcoin Cash, Ethereum, Base, Arbitrum, Solana and Tron. Everything arrives as BCH.' },
  { q: 'What does it cost?', a: 'A plain BCH payment costs a fraction of a cent. Shielding costs about 32,000 sats (a few cents) per transaction, so payments under about 37,000 sats stay at their one-time address.' },
]

function BlazeBanner() {
  const [open, setOpen] = useState(false)
  return (
    <div className="blaze-banner" role="region" aria-label="BCH BLAZE 2026">
      <span className="blaze-tag">BCH BLAZE 2026 entry</span>
      <a href={DECK_URL} target="_blank" rel="noopener">Pitch deck<ArrowUpRight size={14} /></a>
      <a href={REPO_URL} target="_blank" rel="noopener">Source code<ArrowUpRight size={14} /></a>
      <button className="blaze-addr" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span>Vote with EMBER2026</span>
        <code>{DONATION_ADDRESS}</code>
        <QrCode size={14} strokeWidth={2.4} />
      </button>
      {open && createPortal(
        <Modal title="Vote with EMBER2026" onClose={() => setOpen(false)}>
          <p className="blaze-modal-p">Send EMBER2026 tokens to this CashTokens address to vote for Unlinked in the BCH BLAZE community choice. Any CashTokens wallet works, like Cashonize, Paytaca or Selene.</p>
          <div className="qr-halo blaze-modal-qr">
            <div className="qr-tile qr-wrap"><QRCodeSVG value={DONATION_ADDRESS} size={228} level="M" fgColor="#0b0d14" aria-label="QR code of the CashTokens address" /></div>
          </div>
          <div className="link-box blaze-modal-addr">
            <span className="url mono" title={DONATION_ADDRESS}>{DONATION_ADDRESS}</span>
            <CopyButton text={DONATION_ADDRESS} label="Copy address" />
          </div>
        </Modal>,
        document.body,
      )}
    </div>
  )
}

export default function Landing() {
  const { user } = useStore()
  const [open, setOpen] = useState<number | null>(0)
  const start = () => go(user ? '/dashboard' : '/onboarding')
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = takePendingSection()
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  }, [])

  // parallax: each .px-scope gets --p (-1 above centre … 1 below); layers move by their own factor in CSS
  useEffect(() => {
    const el = root.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scopes = [...el.querySelectorAll<HTMLElement>('.px-scope')]
    let raf = 0
    const update = () => {
      raf = 0
      const vh = window.innerHeight
      for (const s of scopes) {
        const r = s.getBoundingClientRect()
        if (r.bottom < -vh || r.top > vh * 2) continue
        const p = Math.max(-1.5, Math.min(1.5, (r.top + r.height / 2 - vh / 2) / vh))
        s.style.setProperty('--p', p.toFixed(4))
      }
      el.style.setProperty('--sy', String(Math.min(window.scrollY, 1200)))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    if (!reduce) {
      update()
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('resize', onScroll)
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting || e.boundingClientRect.top < 0) { e.target.classList.add('in'); io.unobserve(e.target) }
    }, { rootMargin: '0px 0px -12% 0px' })
    el.querySelectorAll('.reveal').forEach((n) => io.observe(n))
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [])

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="ld" ref={root}>
      <BlazeBanner />
      <SiteNav page="landing" />

      <section className="ld-hero2 px-scope">
        <div className="scene" aria-hidden>
          <img className="scene-ribbon" src="/art/ribbon.webp" alt="" />
          <img className="scene-ribbon two" src="/art/ribbon.webp" alt="" />
          <img className="scene-globe" src="/art/globe.webp" alt="" />
          <img className="coin coin-eth" src="/art/coin-eth.webp" alt="" />
          <img className="coin coin-usdt" src="/art/coin-usdt.webp" alt="" />
          <img className="coin coin-btc" src="/art/coin-btc.webp" alt="" />
          <img className="coin coin-sol" src="/art/coin-sol.webp" alt="" />
          <Sparkle className="spark s1" />
          <Sparkle className="spark s2" />
          <Sparkle className="spark s3" />
        </div>

        <div className="ld-hero2-copy px-copy">
          <span className="ld-eyebrow glass"><span className="dot" />Live on Bitcoin Cash mainnet</span>
          <h1 className="ld-h1 st" aria-label="Get paid from any chain. Stay unlinked."><Chars text="Get paid from any chain." /><br /><Chars text="Stay " from={24} /><span className="ld-pill"><Chars text="unlinked." from={28} /></span></h1>
          <p className="ld-lead">One link, any token. Every payment lands privately as BCH.</p>
          <div className="ld-ctas">
            <button className="btn ld-btn-white" onClick={start}>{user ? 'Open app' : 'Claim your link'}<ArrowRight size={18} strokeWidth={2.4} /></button>
            {DEMO_HANDLE && <button className="btn ld-btn-glass" onClick={() => go(`/@${DEMO_HANDLE}`)}>See a pay page</button>}
          </div>
        </div>

        <div className="ld-stage">
          <div className="px-card">
            <div className="ld-phone" aria-hidden>
              <span className="ld-btn-l b1" /><span className="ld-btn-l b2" /><span className="ld-btn-l b3" /><span className="ld-btn-r" />
              <div className="ld-phone-screen">
                <span className="ld-island" />
                <iframe src="/dashboard?embed=1" title="Unlinked app preview" tabIndex={-1} />
              </div>
            </div>
          </div>

          <div className="ld-float f1" aria-hidden>
            <div className="ld-f-label">Just now</div>
            <div className="ld-f-row">
              <span className="ld-toast-ico"><Check size={16} strokeWidth={3} /></span>
              <div>
                <div className="ld-f-big tnum">+0.6247 BCH</div>
                <div className="ld-f-sub">at a fresh address</div>
              </div>
            </div>
          </div>
          <div className="ld-float f2" aria-hidden>
            <div className="ld-f-label">Paid with</div>
            <div className="ld-f-swap">
              <TokenIcon token="USDC" chain="base" size={36} />
              <ArrowRight size={16} strokeWidth={2.4} className="ld-f-arrow" />
              <TokenIcon token="BCH" size={36} />
            </div>
            <div className="ld-f-sub">120 USDC on Base → BCH</div>
          </div>
          <div className="ld-float f3" aria-hidden>
            <div className="ld-f-label">Fresh addresses</div>
            <div className="ld-f-big tnum">34</div>
            <div className="ld-f-chip"><EyeOff size={13} strokeWidth={2.4} />0 linked</div>
          </div>
          <div className="ld-float f4" aria-hidden>
            <div className="ld-f-label">Pay with any token</div>
            <div className="ld-token-stack">{TOKEN_LIST.map((t) => <TokenIcon key={t} token={t} size={30} />)}</div>
          </div>
        </div>
      </section>

      <section className="ld-strip2 reveal" aria-label="Supported chains">
        <span className="ld-strip-label">Payers can send from</span>
        <div className="ld-strip-row">
          {CHAIN_LIST.map((c) => (
            <span key={c} className="ld-chain2"><ChainIcon chain={c} size={26} />{CHAINS[c].name}</span>
          ))}
        </div>
      </section>

      <section className="ld-section reveal">
        <div className="ld-head">
          <h2 className="ld-h2 st" aria-label="Everything you need to get paid privately"><Chars text="Everything you need to get paid privately" /></h2>
          <p className="ld-sub">Claim a name, share one link, watch payments arrive. All from your browser.</p>
        </div>
        <div className="frame ld-show-frame px-scope">
          <div className="ld-showcase">
            <Sparkle className="spark s1" />
            <Sparkle className="spark s2" />
            <Sparkle className="spark s3" />
            <div className="ld-phones">
              {SHOWCASE.map((c) => (
                <div key={c.route} className={`ld-ph ${c.side === 'mid' ? 'mid' : `side ${c.side}`}`}><Phone route={c.route} /></div>
              ))}
            </div>
          </div>
          <div className="ld-show-cards">
            {[...SHOWCASE, ...MORE].map(({ icon: I, title, body }) => (
              <div key={title} className="panel ld-feature2">
                <span className="ld-ico2"><I size={20} strokeWidth={2.4} /></span>
                <h3 className="ld-h3">{title}</h3>
                <p className="ld-p">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ld-section reveal" id="how">
        <div className="ld-head">
          <h2 className="ld-h2 st" aria-label="Three steps to private payments"><Chars text="Three steps to private payments" /></h2>
          <p className="ld-sub">Set up in a minute. No wallet to install, no address to copy around.</p>
        </div>
        <div className="ld-steps2">
          {STEPS.map(({ title, body }, i) => (
            <div key={title} className="ld-step2">
              <div className="ld-step2-vis" aria-hidden>
                {i === 0 && (
                  <div className="ld-mini-field">
                    <span className="ld-mini-at">@</span><span className="ld-mini-name">ava</span>
                    <span className="ld-mini-ok"><Check size={12} strokeWidth={3} />Available</span>
                  </div>
                )}
                {i === 1 && (
                  <div className="ld-mini-stack">
                    <div className="ld-mini-link"><span>@ava</span><span className="ld-mini-copy"><Link2 size={14} strokeWidth={2.4} /></span></div>
                    <div className="ld-mini-chips"><span><QrCode size={13} strokeWidth={2.4} />QR code</span><span>$120 for a logo</span></div>
                  </div>
                )}
                {i === 2 && (
                  <div className="ld-mini-pay">
                    <span className="ld-toast-ico"><Check size={14} strokeWidth={3} /></span>
                    <div><div className="ld-mini-amt tnum">+0.0524 BCH</div><div className="ld-mini-sub">fresh address, just now</div></div>
                  </div>
                )}
              </div>
              <div className="ld-step2-rail"><span className="ld-step2-n tnum">{i + 1}</span>{i < STEPS.length - 1 && <span className="ld-step2-line" />}</div>
              <h3 className="ld-h3">{title}</h3>
              <p className="ld-p">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-section reveal" id="privacy">
        <div className="ld-belt-wrap">
          <div className="ld-belt-copy">
            <h2 className="ld-h1 ld-belt-h st" aria-label="Still pasting wallet addresses?"><Chars text="Still pasting wallet addresses?" /></h2>
            <p className="ld-sub">Every time you share the same address, anyone can add up who paid you and how much. Unlinked gives you one @username, and every payment still lands at a fresh address.</p>
          </div>
          <Belt />
        </div>
      </section>

      <section className="ld-section ld-faq-sec reveal" id="faq">
        <div className="ld-faq-side">
          <h2 className="ld-h2 st" aria-label="Questions, answered"><Chars text="Questions, answered" /></h2>
          <p className="ld-sub">The short version of how privacy, payments and keys work.</p>
        </div>
        <div className="frame ld-faq2">
          {FAQ.map(({ q, a }, i) => (
            <div key={q} className={`panel ld-qa2${open === i ? ' on' : ''}`}>
              <button className="ld-q2" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                <span className="ld-q2-n tnum">{String(i + 1).padStart(2, '0')}</span>
                <span className="ld-q2-t">{q}</span>
                <span className="ld-q2-ico" aria-hidden><Plus size={18} strokeWidth={2.4} /></span>
              </button>
              <div className="ld-a2"><div><p className="ld-p">{a}</p></div></div>
            </div>
          ))}
        </div>
      </section>

      <footer className="ld-final ld-footer px-scope reveal">
        <div className="scene" aria-hidden>
          <img className="scene-globe" src="/art/globe.webp" alt="" />
          <img className="scene-clouds" src="/art/clouds.webp" alt="" />
          <img className="coin coin-eth" src="/art/coin-eth.webp" alt="" />
          <img className="coin coin-sol" src="/art/coin-sol.webp" alt="" />
          <Sparkle className="spark s1" />
          <Sparkle className="spark s3" />
        </div>
        <div className="ld-final-copy">
          <h2 className="ld-h2 st" aria-label="Your private link is a minute away"><Chars text="Your private link is a minute away" /></h2>
          <p className="ld-sub">Claim your @username and start getting paid from any chain.</p>
          <button className="btn ld-btn-white" onClick={start}>{user ? 'Open app' : 'Claim your link'}<ArrowRight size={18} strokeWidth={2.4} /></button>
        </div>
        <div className="ld-foot-row">
          <span className="logo ld-foot-logo"><span className="logo-mark"><Unlink size={16} strokeWidth={2.4} /></span>unlinked</span>
          <nav className="ld-foot-links" aria-label="Footer">
            <button onClick={() => scrollTo('how')}>How it works</button>
            <button onClick={() => scrollTo('privacy')}>Privacy</button>
            <button onClick={() => scrollTo('faq')}>FAQ</button>
            <button onClick={() => go('/bridge')}>Bridge</button>
          </nav>
          <span className="ld-foot-credit">Built for BCH BLAZE 2026</span>
        </div>
      </footer>
    </div>
  )
}
