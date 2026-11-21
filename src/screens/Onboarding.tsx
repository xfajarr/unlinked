import { useEffect, useMemo, useRef, useState } from 'react'
import { generateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { ArrowLeft, Check, Eye, KeyRound, Lock, Plus, ShieldCheck, Unlink, Wallet } from 'lucide-react'
import { ChainIcon, CopyButton, Logo, Switch, SuccessMark, XIcon } from '../ui'
import { go, useStore } from '../App'

const TAKEN = ['admin', 'satoshi', 'unlinked', 'bch']

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
  </svg>
)

/** 6 boxes (3 · 3) driven by one hidden numeric input, so typing, paste and backspace just work. */
function PinInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  // show the digit just typed for 2s, then mask it; typing the next digit masks it at once
  const [peek, setPeek] = useState<number | null>(null)
  const prevLen = useRef(value.length)
  useEffect(() => {
    if (value.length > prevLen.current) {
      setPeek(value.length - 1)
      const t = setTimeout(() => setPeek(null), 2000)
      prevLen.current = value.length
      return () => clearTimeout(t)
    }
    prevLen.current = value.length
    setPeek(null)
  }, [value])
  const boxes = Array.from({ length: 6 }, (_, i) => value[i])
  return (
    <div className={`pin${error ? ' err' : ''}`} onClick={() => ref.current?.focus()}>
      <input
        ref={ref} className="pin-hidden" inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="6-digit PIN"
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
      {boxes.map((d, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i === 3 && <span className="pin-sep" aria-hidden>–</span>}
          <span className={`pin-box${d ? ' filled' : ''}${i === value.length ? ' active' : ''}`} aria-hidden>
            {d ? (peek === i ? <span key="d" className="pin-digit">{d}</span> : <span key="m" className="pin-dot">•</span>) : ''}
          </span>
        </span>
      ))}
    </div>
  )
}

export default function Onboarding() {
  const { setUser } = useStore()
  const [step, setStep] = useState<'welcome' | 'claim' | 'pin' | 'confirm' | 'backup' | 'done'>('welcome')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [pinErr, setPinErr] = useState(false)
  const [handle, setHandle] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const mnemonic = useMemo(() => generateMnemonic(wordlist, 128), [])
  const [revealed, setRevealed] = useState(false)
  const [saved, setSaved] = useState(false)

  const clean = handle.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
  const valid = clean.length >= 3
  const taken = TAKEN.includes(clean)
  const back = () => {
    setPinErr(false)
    const prev = { claim: 'welcome', pin: 'claim', confirm: 'pin', backup: 'confirm' } as const
    if (step === 'confirm') setPin2('')
    if (step in prev) setStep(prev[step as keyof typeof prev])
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          {step !== 'welcome' && step !== 'done' ? (
            <button className="orb" onClick={back} aria-label="Back"><ArrowLeft size={22} strokeWidth={2.2} /></button>
          ) : <Logo />}
        </div>
        <div />
        <div />
      </header>

      <main className="main narrow">
        {step === 'welcome' && (
          <div className="stack center onb-welcome">
            <span className="logo-mark onb-logo"><Unlink size={30} strokeWidth={2.4} /><span className="onb-beta">Beta</span></span>
            <div>
              <h1 className="page-title">Welcome to Unlinked</h1>
              <p className="page-sub">Get paid on Bitcoin Cash from any chain. Nobody can see who paid you or how much.</p>
            </div>
            <div className="stack" style={{ gap: 10, width: '100%' }}>
              <button className="auth-btn" onClick={() => setStep('claim')}><GoogleIcon />Continue with Google</button>
              <button className="auth-btn" onClick={() => setStep('claim')}><XIcon size={18} />Continue with X</button>
              <div className="or-sep"><span>or</span></div>
              <button className="auth-btn tall" onClick={() => setStep('claim')}>
                <Wallet size={20} strokeWidth={2} />
                <span style={{ textAlign: 'left' }}><span style={{ display: 'block' }}>Connect wallet</span><span className="muted" style={{ fontSize: 13 }}>Use your BCH wallet</span></span>
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Your keys are created and kept on this device.</p>
          </div>
        )}

        {step === 'claim' && (
          <div className="stack center" style={{ gap: 0 }}>
            <label className="avatar-pick" aria-label={photo ? 'Change profile photo' : 'Add profile photo'}>
              <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto(URL.createObjectURL(f)) }} />
              <span className="avatar-pick-face">{photo ? <img src={photo} alt="" /> : (clean[0] || 'u').toUpperCase()}</span>
              <span className="avatar-pick-badge" aria-hidden><Plus size={18} strokeWidth={2.6} /></span>
            </label>
            <h1 className="page-title">Set up your profile</h1>
            <p className="page-sub">Add a photo and pick the username people pay.</p>

            <div className="field-wrap" style={{ marginTop: 28 }}>
              <span className="field-prefix">@</span>
              <input
                className="field pre"
                autoFocus
                placeholder="username"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && valid && !taken && setStep('pin')}
                aria-label="Username"
                spellCheck={false}
                autoCapitalize="off"
              />
              <span className="field-end">
                {valid && (taken ? <span className="badge" style={{ background: '#fdecea', color: 'var(--red-11)' }}>Taken</span> : <span className="badge green"><Check size={14} strokeWidth={2.8} />Available</span>)}
              </span>
            </div>

            <div className="paypage-label">Your pay page</div>
            <div className="frame">
              <div className="panel paypage" aria-live="polite">
                <span className="paypage-avatar">{photo ? <img src={photo} alt="" /> : (clean[0] || 'u').toUpperCase()}</span>
                <div className="paypage-title">Pay <b>@{clean || 'username'}</b></div>
                <div className="paypage-url">unlinked.cash/@{clean || 'username'}</div>
                <div className="paypage-chains" aria-hidden>
                  {(['bch', 'ethereum', 'base', 'solana', 'tron'] as const).map((c) => <span key={c}><ChainIcon chain={c} size={22} /></span>)}
                  <em>+34</em>
                </div>
                <span className="paypage-btn" aria-hidden>Pay with any token</span>
              </div>
            </div>

            <div className="sticky-cta">
              <button className="btn btn-primary block" disabled={!valid || taken} onClick={() => setStep('pin')}>
                Continue
              </button>
            </div>
          </div>
        )}

        {(step === 'pin' || step === 'confirm') && (
          <div className="stack center pin-step">
            <div>
              <h1 className="page-title">{step === 'pin' ? 'Set your PIN' : 'Confirm your PIN'}</h1>
              <p className="page-sub">{step === 'pin' ? 'Create a 6-digit PIN to unlock Unlinked on this device.' : 'Enter the same 6 digits again.'}</p>
            </div>
            <div className="pin-wrap">
            <PinInput
              key={step}
              value={step === 'pin' ? pin : pin2}
              error={pinErr}
              onChange={(v) => {
                setPinErr(false)
                if (step === 'pin') {
                  setPin(v)
                  if (v.length === 6) setTimeout(() => setStep('confirm'), 180)
                } else {
                  setPin2(v)
                  if (v.length === 6) {
                    if (v === pin) setTimeout(() => setStep('backup'), 180)
                    else setTimeout(() => { setPinErr(true); setPin2('') }, 180)
                  }
                }
              }}
            />
            <p className="pin-error" aria-live="polite">{pinErr ? 'PINs don’t match. Try again.' : ''}</p>
            </div>
            <div className="pin-note">
              <div className="pin-note-head">
                <span className="pin-note-ico"><ShieldCheck size={20} strokeWidth={2.2} /></span>
                <div className="pin-note-title">What’s this PIN for?</div>
              </div>
              <ul className="pin-points">
                <li><Lock size={16} strokeWidth={2.2} /><span>Locks your keys on this device, so nobody else can move your money.</span></li>
                <li><KeyRound size={16} strokeWidth={2.2} /><span>Forgot it? Your <b>12-word recovery phrase</b> gets you back in.</span></li>
              </ul>
            </div>
          </div>
        )}

        {step === 'backup' && (
          <div className="stack">
            <div className="center">
              <h1 className="page-title">Save your recovery phrase</h1>
              <p className="page-sub">These 12 words are the only way back into your money. We never see them.</p>
            </div>

            <div className="card" style={{ position: 'relative' }}>
              <div className={`words${revealed ? '' : ' blur'}`}>
                {mnemonic.split(' ').map((w, i) => (
                  <div className="word" key={i}><span>{i + 1}</span>{w}</div>
                ))}
              </div>
              {!revealed && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                  <button className="btn btn-white md" onClick={() => setRevealed(true)}><Eye size={18} />Show words</button>
                </div>
              )}
              {revealed && (
                <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 20 }}>
                  <span className="muted" style={{ fontSize: 15 }}>Write them down. Don’t screenshot.</span>
                  <CopyButton text={mnemonic} label="Copy recovery phrase" />
                </div>
              )}
            </div>

            <label className="card flat hstack" style={{ padding: '18px 20px', borderRadius: 22, cursor: 'pointer', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 17, letterSpacing: '-0.015em' }}>I saved these words somewhere safe</span>
              <Switch on={saved} onChange={setSaved} label="I saved my recovery phrase" />
            </label>

            <button className="btn btn-primary block" disabled={!saved || !revealed} onClick={() => setStep('done')}>
              Continue
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="stack center" style={{ alignItems: 'center' }}>
            <SuccessMark size={160} />
            <div>
              <h1 className="page-title">You’re live, @{clean}</h1>
              <p className="page-sub">Share this link. Every payment lands in a fresh address only you can find.</p>
            </div>
            <div className="link-box" style={{ width: '100%', textAlign: 'left' }}>
              <span className="url"><span className="dim">unlinked.cash/</span>@{clean}</span>
              <CopyButton text={`https://unlinked.cash/@${clean}`} label="Copy link" />
            </div>
            <button
              className="btn btn-primary block"
              onClick={() => {
                setUser({ handle: clean, mnemonic })
                go('/dashboard')
              }}
            >
              Go to home
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
