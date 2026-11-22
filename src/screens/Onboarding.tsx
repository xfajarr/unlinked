import { useEffect, useRef, useState } from 'react'
import { validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { ArrowLeft, Check, Eye, KeyRound, Loader2, Lock, RotateCcw, ShieldCheck, Unlink, UserPlus } from 'lucide-react'
import { ChainIcon, CopyButton, Logo, Switch, SuccessMark } from '../ui'
import { go } from '../App'
import { checkHandle, claimHandle } from '../lib/api'
import { XCHAIN_ENABLED } from '../lib/config'
import { createVault, forget, markBackedUp, useVault } from '../lib/vault'
import { HANDLE_RE, errMsg, linkFor, linkHost, normalizeHandleInput } from '../app/format'
import { clearPinFails, PIN_LENGTH, PinInput } from '../app/Pin'
import { restoreVault } from '../app/vaultio'

type Step = 'welcome' | 'claim' | 'pin' | 'confirm' | 'working' | 'backup' | 'done' | 'restore'
type HandleStatus = 'invalid' | 'checking' | 'available' | 'taken' | 'error'

function useHandleStatus(handle: string): [HandleStatus, (s: HandleStatus) => void] {
  const [status, setStatus] = useState<HandleStatus>('invalid')
  useEffect(() => {
    if (!HANDLE_RE.test(handle)) return setStatus('invalid')
    setStatus('checking')
    let live = true
    const t = setTimeout(() => {
      checkHandle({ data: { handle } })
        .then((r) => live && setStatus(r.available ? 'available' : 'taken'))
        .catch(() => live && setStatus('error'))
    }, 400)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [handle])
  return [status, setStatus]
}

export default function Onboarding() {
  const { stored } = useVault()
  const restoring = new URLSearchParams(window.location.search).has('restore')
  const [step, setStep] = useState<Step>(restoring ? 'restore' : 'welcome')
  const [handle, setHandle] = useState('')
  const [status, setStatus] = useHandleStatus(handle)
  const [flow, setFlow] = useState<'create' | 'restore'>(restoring ? 'restore' : 'create')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [pinErr, setPinErr] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mnemonic, setMnemonic] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [saved, setSaved] = useState(false)
  const [words, setWords] = useState('')
  const started = useRef(false)

  // an account already lives on this device: go to it (but not mid-claim, when the vault was just written)
  useEffect(() => {
    if (stored && !started.current && !restoring) go('/dashboard')
  }, [stored, restoring])

  const clearPins = () => {
    setPin('')
    setPin2('')
    setPinErr(false)
  }
  const back = () => {
    setError(null)
    clearPins()
    if (step === 'restore') return restoring ? go('/dashboard') : setStep('welcome')
    if (step === 'pin') return setStep(flow === 'restore' ? 'restore' : 'claim')
    const prev = { claim: 'welcome', confirm: 'pin' } as const
    if (step in prev) setStep(prev[step as keyof typeof prev])
  }
  const toPin = (f: 'create' | 'restore') => {
    setFlow(f)
    clearPins()
    setStep('pin')
  }

  async function claim(newPin: string) {
    if (newPin.length !== PIN_LENGTH || status !== 'available') return
    started.current = true
    setError(null)
    setStep('working')
    try {
      // the mnemonic stays on this device: only the public keys (and the Shield key) go to the server
      const { mnemonic, ...pub } = await createVault(handle, newPin)
      const r = await claimHandle({ data: { handle, ...pub } }).catch((err) => ({ ok: false as const, error: errMsg(err) }))
      if (!r.ok) {
        forget()
        started.current = false
        setError(r.error)
        if (/taken/i.test(r.error)) setStatus('taken')
        clearPins()
        setStep('claim')
        return
      }
      clearPins()
      clearPinFails()
      setMnemonic(mnemonic)
      setStep('backup')
    } catch (err) {
      forget()
      started.current = false
      setError(errMsg(err))
      clearPins()
      setStep('claim')
    }
  }

  const phrase = words.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
  const wordCount = phrase ? phrase.split(' ').length : 0
  const phraseOk = wordCount === 12 && validateMnemonic(phrase, wordlist)
  const restoreReady = HANDLE_RE.test(handle) && phraseOk

  async function restore(newPin: string) {
    if (!restoreReady || newPin.length !== PIN_LENGTH) return
    started.current = true
    setError(null)
    setStep('working')
    try {
      await restoreVault(handle, phrase, newPin)
      clearPinFails()
      setWords('')
      go('/dashboard')
    } catch (err) {
      started.current = false
      setError(errMsg(err))
      clearPins()
      setStep('restore')
    }
  }

  const face = (handle[0] || 'u').toUpperCase()

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          {step === 'claim' || step === 'pin' || step === 'confirm' || step === 'restore' ? (
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
              <p className="page-sub">Get paid on Bitcoin Cash. Nobody can see who paid you or how much.</p>
            </div>
            <div className="stack" style={{ gap: 10, width: '100%' }}>
              <button className="auth-btn tall" onClick={() => setStep('claim')}>
                <UserPlus size={20} strokeWidth={2} />
                <span style={{ textAlign: 'left' }}><span style={{ display: 'block' }}>Create your link</span><span className="muted" style={{ fontSize: 13 }}>Pick a username, get paid privately</span></span>
              </button>
              <button className="auth-btn tall" onClick={() => setStep('restore')}>
                <RotateCcw size={20} strokeWidth={2} />
                <span style={{ textAlign: 'left' }}><span style={{ display: 'block' }}>Restore with 12 words</span><span className="muted" style={{ fontSize: 13 }}>Already have an account</span></span>
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Your keys are created and kept on this device.</p>
          </div>
        )}

        {step === 'claim' && (
          <div className="stack center" style={{ gap: 0 }}>
            <span className="avatar-pick" style={{ cursor: 'default' }} aria-hidden><span className="avatar-pick-face">{face}</span></span>
            <h1 className="page-title">Pick your username</h1>
            <p className="page-sub">This is the name people pay.</p>

            <div className="field-wrap" style={{ marginTop: 28 }}>
              <span className="field-prefix">@</span>
              <input
                className="field pre"
                autoFocus
                placeholder="username"
                value={handle}
                maxLength={20}
                onChange={(e) => { setHandle(normalizeHandleInput(e.target.value)); setError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && status === 'available' && toPin('create')}
                aria-label="Username"
                aria-describedby="handle-status"
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
              />
              <span className="field-end" id="handle-status" aria-live="polite">
                {status === 'checking' && <span className="badge neutral"><Loader2 size={13} className="spin" />Checking</span>}
                {status === 'available' && <span className="badge green"><Check size={14} strokeWidth={2.8} />Available</span>}
                {status === 'taken' && <span className="badge ap-bad">Taken</span>}
                {status === 'error' && <span className="badge ap-bad">Can’t check</span>}
              </span>
            </div>
            <p className={error ? 'ap-err' : 'ap-hint'}>{error ?? '3 to 20 letters, numbers or underscores.'}</p>

            <div className="paypage-label">Your pay page</div>
            <div className="frame">
              <div className="panel paypage" aria-live="polite">
                <span className="paypage-avatar">{face}</span>
                <div className="paypage-title">Pay <b>@{handle || 'username'}</b></div>
                <div className="paypage-url">{linkHost()}/@{handle || 'username'}</div>
                <div className="paypage-chains" aria-hidden>
                  {(XCHAIN_ENABLED ? (['bch', 'ethereum', 'base', 'solana', 'tron'] as const) : (['bch'] as const)).map((c) => <span key={c}><ChainIcon chain={c} size={22} /></span>)}
                  {XCHAIN_ENABLED && <em>+34</em>}
                </div>
                <span className="paypage-btn" aria-hidden>{XCHAIN_ENABLED ? 'Pay with any token' : 'Pay with BCH'}</span>
              </div>
            </div>

            <div className="sticky-cta">
              <button className="btn btn-primary block" disabled={status !== 'available'} onClick={() => toPin('create')}>
                Continue
              </button>
            </div>
          </div>
        )}

        {(step === 'pin' || step === 'confirm') && (
          <div className="stack center pin-step">
            <div>
              <h1 className="page-title">{step === 'confirm' ? 'Confirm your PIN' : flow === 'restore' ? 'Set a new PIN' : 'Set a PIN'}</h1>
              <p className="page-sub">{step === 'confirm' ? 'Enter the same 6 digits again.' : '6 digits that unlock Unlinked on this device.'}</p>
            </div>
            <div className="pin-wrap">
              <PinInput
                key={step}
                value={step === 'pin' ? pin : pin2}
                error={pinErr}
                label={step === 'pin' ? 'New 6-digit PIN' : 'Confirm your PIN'}
                onChange={(v) => {
                  setPinErr(false)
                  if (step === 'pin') {
                    setPin(v)
                    if (v.length === PIN_LENGTH) setTimeout(() => setStep('confirm'), 180)
                    return
                  }
                  setPin2(v)
                  if (v.length < PIN_LENGTH) return
                  if (v !== pin) return void setTimeout(() => { setPinErr(true); setPin2('') }, 180)
                  setTimeout(() => void (flow === 'restore' ? restore(v) : claim(v)), 180)
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
                <li><Lock size={16} strokeWidth={2.2} /><span>It unlocks the app on this device and keeps your keys encrypted here, so nobody else can move your money.</span></li>
                <li><KeyRound size={16} strokeWidth={2.2} /><span>Your <b>12-word recovery phrase</b> is the real backup. Forgot the PIN? The 12 words get you back in.</span></li>
              </ul>
            </div>
          </div>
        )}

        {step === 'working' && (
          <div className="stack center onb-welcome" aria-live="polite">
            <Loader2 size={40} className="spin" style={{ color: 'var(--blue-9)' }} />
            <div>
              <h1 className="page-title">{flow === 'restore' ? 'Restoring your account' : 'Creating your keys'}</h1>
              <p className="page-sub">This takes a few seconds. Your keys never leave this device.</p>
            </div>
          </div>
        )}

        {step === 'backup' && (
          <div className="stack">
            <div className="center">
              <span className="badge green" style={{ marginBottom: 12 }}><Check size={14} strokeWidth={2.8} />@{handle} is yours</span>
              <h1 className="page-title">Save your recovery phrase</h1>
              <p className="page-sub">These 12 words are the only way back into your money. We never see them.</p>
            </div>

            <div className="card" style={{ position: 'relative' }}>
              <div className={`words${revealed ? '' : ' blur'}`} aria-hidden={!revealed}>
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
                  <span className="muted" style={{ fontSize: 15 }}>Write them down in order. Don’t screenshot.</span>
                  <CopyButton text={mnemonic} label="Copy recovery phrase" />
                </div>
              )}
            </div>

            <label className="card flat hstack" style={{ padding: '18px 20px', borderRadius: 22, cursor: 'pointer', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 17, letterSpacing: '-0.015em' }}>I saved these words somewhere safe</span>
              <Switch on={saved} onChange={setSaved} label="I saved my recovery phrase" />
            </label>

            <div className="stack" style={{ gap: 12 }}>
              <button className="btn btn-primary block" disabled={!saved || !revealed} onClick={() => { markBackedUp(); setMnemonic(''); setStep('done') }}>
                Continue
              </button>
              <button className="btn-ghost" onClick={() => { setMnemonic(''); setStep('done') }}>Remind me later</button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="stack center" style={{ alignItems: 'center' }}>
            <SuccessMark size={160} />
            <div>
              <h1 className="page-title">You’re live, @{handle}</h1>
              <p className="page-sub">Share this link. Every payment lands in a fresh address only you can find.</p>
            </div>
            <div className="link-box" style={{ width: '100%', textAlign: 'left' }}>
              <span className="url"><span className="dim">{linkHost()}/</span>@{handle}</span>
              <CopyButton text={linkFor(handle)} label="Copy link" />
            </div>
            <button className="btn btn-primary block" onClick={() => go('/dashboard')}>Go to home</button>
          </div>
        )}

        {step === 'restore' && (
          <div className="stack center pin-step">
            <div>
              <h1 className="page-title">Restore your account</h1>
              <p className="page-sub">Enter your username and your 12 words, then set a new PIN for this device.</p>
            </div>
            <div className="stack" style={{ gap: 10, width: '100%' }}>
              <div className="field-wrap">
                <span className="field-prefix">@</span>
                <input className="field pre" placeholder="username" aria-label="Username" value={handle} maxLength={20} onChange={(e) => { setHandle(normalizeHandleInput(e.target.value)); setError(null) }} spellCheck={false} autoCapitalize="off" autoComplete="off" autoFocus />
              </div>
              <textarea
                className="field ap-words-input"
                placeholder="Your 12 words, separated by spaces"
                aria-label="Recovery phrase"
                value={words}
                onChange={(e) => { setWords(e.target.value); setError(null) }}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                rows={3}
              />
              <p className={wordCount === 12 && !phraseOk ? 'ap-err' : 'ap-hint'}>
                {wordCount === 12 && !phraseOk ? 'One of these words is wrong. Check the spelling and order.' : `${wordCount} of 12 words`}
              </p>
            </div>
            {error && <p className="ap-err" role="alert">{error}</p>}
            <button className="btn btn-primary block" disabled={!restoreReady} onClick={() => toPin('restore')}>Continue</button>
            {stored && <p className="ap-hint">This replaces the account saved on this device (@{stored.handle}).</p>}
          </div>
        )}
      </main>
    </div>
  )
}
