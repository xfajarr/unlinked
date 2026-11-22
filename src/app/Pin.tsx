import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { errMsg } from './format'

export const PIN_LENGTH = 6

/** Six boxes driven by one hidden numeric input, so typing, paste and backspace just work. */
export function PinInput({ value, onChange, error = false, disabled = false, label = '6-digit PIN' }: {
  value: string
  onChange: (v: string) => void
  error?: boolean
  disabled?: boolean
  label?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!disabled) ref.current?.focus()
  }, [disabled])
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
  const boxes = Array.from({ length: PIN_LENGTH }, (_, i) => value[i])
  return (
    <div className={`pin${error ? ' err' : ''}${disabled ? ' locked' : ''}`} onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        className="pin-hidden"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={PIN_LENGTH}
        aria-label={label}
        aria-invalid={error}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
      />
      {boxes.map((d, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i === 3 && <span className="pin-sep" aria-hidden>–</span>}
          <span className={`pin-box${d ? ' filled' : ''}${!disabled && i === value.length ? ' active' : ''}`} aria-hidden>
            {d ? (peek === i ? <span key="d" className="pin-digit">{d}</span> : <span key="m" className="pin-dot">•</span>) : ''}
          </span>
        </span>
      ))}
    </div>
  )
}

// Wrong PINs in a row, kept across reloads so a refresh doesn't reset the wait.
const FAILS = 'unlinked:pinFails'
const MAX_TRIES = 5
const WAIT_MS = 30_000
type Fails = { n: number; until: number }

function readFails(): Fails {
  try {
    const v = JSON.parse(localStorage.getItem(FAILS) ?? 'null') as Partial<Fails> | null
    return { n: Number(v?.n) || 0, until: Number(v?.until) || 0 }
  } catch {
    return { n: 0, until: 0 }
  }
}
function writeFails(f: Fails | null) {
  try {
    if (f) localStorage.setItem(FAILS, JSON.stringify(f))
    else localStorage.removeItem(FAILS)
  } catch {
    /* storage blocked: the wait only lasts until reload */
  }
}
export const clearPinFails = () => writeFails(null)

/** PIN boxes that check on the 6th digit, clear on a wrong PIN and pause for 30 s after 5 wrong ones in a row. */
export function PinEntry({ verify, busyLabel }: { verify: (pin: string) => Promise<void>; busyLabel: string }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fails, setFails] = useState(readFails)
  const [now, setNow] = useState(() => Date.now())
  const locked = fails.until > now

  useEffect(() => {
    if (!locked) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [locked])

  async function check(v: string) {
    setBusy(true)
    setError(null)
    try {
      await verify(v)
      clearPinFails()
    } catch (err) {
      const n = readFails().n + 1
      const next = n >= MAX_TRIES ? { n: 0, until: Date.now() + WAIT_MS } : { n, until: 0 }
      writeFails(next)
      setFails(next)
      setNow(Date.now())
      const left = MAX_TRIES - n
      setError(next.until ? null : left <= 2 ? `${errMsg(err)}. ${left} ${left === 1 ? 'try' : 'tries'} left.` : errMsg(err))
      setPin('')
      setBusy(false)
    }
  }

  const secs = Math.ceil((fails.until - now) / 1000)
  return (
    <>
      <PinInput
        value={pin}
        error={!!error || locked}
        disabled={busy || locked}
        label="Your 6-digit PIN"
        onChange={(v) => {
          setPin(v)
          setError(null)
          if (v.length === PIN_LENGTH) void check(v)
        }}
      />
      {locked ? (
        <p className="ap-err" role="timer">Too many wrong PINs. Try again in {secs} s.</p>
      ) : busy ? (
        <p className="ap-hint" aria-live="polite"><Loader2 size={14} className="spin" style={{ verticalAlign: -2, marginRight: 6 }} />{busyLabel}</p>
      ) : (
        <p className="ap-err" role="alert">{error ?? ''}</p>
      )}
    </>
  )
}
