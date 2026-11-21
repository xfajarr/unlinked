import type React from 'react'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Check, Copy, Unlink, X } from 'lucide-react'
import { Lottie } from 'lottie-react'
import successAnim from './success.json'
import {
  TokenBCH, TokenUSDC, TokenUSDT, TokenETH, TokenSOL,
  NetworkBase, NetworkBitcoinCash, NetworkEthereum, NetworkArbitrumOne, NetworkSolana, NetworkTron,
} from '@web3icons/react'
import { CHAINS, TOKENS, type ChainId, type TokenId } from './data'

export function Logo() {
  return (
    <a href="#/dashboard" className="logo" style={{ textDecoration: 'none', color: 'inherit' }}>
      <span className="logo-mark"><Unlink size={18} strokeWidth={2.4} /></span>
      unlinked
    </a>
  )
}

export function Avatar({ handle, size = 52, src, children }: { handle: string; size?: number; src?: string; children?: ReactNode }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src ? <img src={src} alt="" className="avatar-img" /> : (handle[0] || '?').toUpperCase()}
      {children}
    </span>
  )
}

const TOKEN_LOGO: Record<TokenId, typeof TokenBCH> = { BCH: TokenBCH, USDC: TokenUSDC, USDT: TokenUSDT, ETH: TokenETH, SOL: TokenSOL }
const CHAIN_LOGO: Record<ChainId, typeof NetworkBase> = {
  bch: NetworkBitcoinCash, base: NetworkBase, ethereum: NetworkEthereum, arbitrum: NetworkArbitrumOne, solana: NetworkSolana, tron: NetworkTron,
}

export function ChainIcon({ chain, size = 20 }: { chain: ChainId; size?: number }) {
  const C = CHAIN_LOGO[chain]
  return <C variant="background" size={size} aria-label={CHAINS[chain].name} style={{ display: 'block' }} />
}

export function TokenIcon({ token, chain, size = 44 }: { token: TokenId; chain?: ChainId; size?: number }) {
  const T = TOKEN_LOGO[token]
  const badge = Math.round(size * 0.42)
  return (
    <span className="token" style={{ width: size, height: size }}>
      <span className="coin"><T variant="background" size={size} aria-label={TOKENS[token].name} style={{ display: 'block' }} /></span>
      {chain && chain !== 'bch' && (
        <span className="chain" style={{ width: badge, height: badge }} title={CHAINS[chain].name}>
          <ChainIcon chain={chain} size={badge} />
        </span>
      )}
    </span>
  )
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const t = setTimeout(() => setState('idle'), 1400)
    return () => clearTimeout(t)
  }, [state])
  return (
    <button
      className="btn-copy"
      aria-label={label ?? 'Copy'}
      onClick={() => {
        setState('ok')
        navigator.clipboard?.writeText(text).catch(() => setState('fail'))
      }}
    >
      {state === 'ok' ? <Check size={20} strokeWidth={2.6} /> : state === 'fail' ? <span style={{ fontSize: 13 }}>Copy failed</span> : <Copy size={20} strokeWidth={2.2} />}
    </button>
  )
}

const ModalCtx = createContext<() => void>(() => {})
/** Close the surrounding Modal with its exit animation (use for Cancel / Back buttons inside a dialog). */
export const useModalClose = () => useContext(ModalCtx)

/** A button that closes the surrounding Modal with its exit animation. */
export function ModalCancel({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const close = useModalClose()
  return <button type="button" {...rest} onClick={close}>{children}</button>
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [leaving, setLeaving] = useState(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // play the exit animation, then tell the parent to unmount
  const leavingRef = useRef(false)
  const close = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaving(true)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setTimeout(() => closeRef.current(), reduce ? 0 : 200)
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', k)
      document.body.style.overflow = ''
    }
  }, [close])
  return (
    <ModalCtx.Provider value={close}>
      <div className={`backdrop${leaving ? ' leaving' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
        <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
          <div className="modal-head">
            <h2 className="modal-title">{title}</h2>
            <button className="orb sm" onClick={close} aria-label="Close"><X size={20} strokeWidth={2.4} /></button>
          </div>
          {children}
        </div>
      </div>
    </ModalCtx.Provider>
  )
}

/** Tick slider: bars fill blue up to the thumb, and swell near it. A native range input on top keeps it accessible. */
export function TickSlider({ value, onChange, label, ticks = 44 }: { value: number; onChange: (v: number) => void; label: string; ticks?: number }) {
  // `shown` glides toward `value` when it changes from outside (the % chips); dragging stays 1:1
  const [shown, setShown] = useState(value)
  const shownRef = useRef(value)
  const dragging = useRef(false)
  useEffect(() => {
    if (dragging.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shownRef.current = value
      setShown(value)
      return
    }
    const from = shownRef.current, to = value, start = performance.now(), dur = 420
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const e = 1 - Math.pow(1 - t, 4) // strong ease-out
      shownRef.current = from + (to - from) * e
      setShown(shownRef.current)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  const p = shown / 100
  return (
    <div className="tick-slider" style={{ ['--p' as string]: p }}>
      <div className="tick-track" aria-hidden>
        {Array.from({ length: ticks }, (_, i) => {
          const t = i / (ticks - 1)
          const near = Math.max(0, 1 - Math.abs(t - p) * 7)
          return <span key={i} className={t <= p ? 'on' : ''} style={{ height: 14 + near * 18 }} />
        })}
      </div>
      <span className="tick-thumb" aria-hidden><i /></span>
      <input
        type="range" min={0} max={100} step={1} value={value} aria-label={label}
        onPointerDown={() => { dragging.current = true }}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

/**
 * Odometer-style number: each digit rolls to its new value. Columns are keyed from the
 * right, so 9.8 → 13.2 keeps the decimals in place and only grows on the left.
 */
export function RollingNumber({ value }: { value: string }) {
  const chars = value.split('')
  const n = chars.length
  return (
    <span className="roll" aria-label={value} role="text">
      {chars.map((c, i) => {
        const fromRight = n - i
        if (!/\d/.test(c)) return <span key={`s${fromRight}`} className="roll-sep" aria-hidden>{c}</span>
        return (
          <span key={`d${fromRight}`} className="roll-col" aria-hidden>
            {/* sizes the column to the digit shown, so spacing matches plain text */}
            <span className="roll-sizer">{c}</span>
            <span className="roll-strip" style={{ transform: `translateY(${-Number(c) * 10}%)`, transitionDelay: `${Math.min(fromRight, 8) * 18}ms` }}>
              {'0123456789'.split('').map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        )
      })}
    </span>
  )
}

/** Small segmented control whose white pill slides to the chosen option. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: T[]; value: T; onChange: (v: T) => void; label: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const box = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  useEffect(() => {
    const measure = () => {
      const el = refs.current[value]
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth })
    }
    measure()
    document.fonts?.ready.then(measure)
    const ro = new ResizeObserver(measure)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [value])
  return (
    <div className="seg-mini" role="tablist" aria-label={label} ref={box}>
      {pill && <span className="seg-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
      {options.map((o) => (
        <button key={o} ref={(el) => { refs.current[o] = el }} role="tab" aria-selected={value === o} data-label={o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  )
}

/** Success: our own Lottie (tile pops, tick draws, ring + burst). Static tick when motion is reduced. */
export function SuccessMark({ size = 128 }: { size?: number }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    return (
      <span className="logo-mark" style={{ width: size * 0.54, height: size * 0.54, borderRadius: size * 0.18, margin: `${size * 0.23}px auto` }}>
        <Check size={size * 0.26} strokeWidth={2.6} />
      </span>
    )
  }
  return <Lottie src={successAnim} loop={false} autoplay style={{ width: size, height: size, margin: '0 auto' }} aria-label="Done" role="img" />
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)} />
}

export const XIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)
