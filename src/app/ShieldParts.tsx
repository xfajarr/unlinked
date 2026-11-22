import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { progressFraction, progressLabel, type ShieldTxProgress } from '../lib/shield/progress'
import { fmtBch } from './format'

function useProofProgress(progress: ShieldTxProgress | null) {
  const [now, setNow] = useState(() => Date.now())
  const started = useRef(Date.now())
  const proveStart = useRef<number | null>(null)
  const downloading = useRef(false)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  if (progress?.stage === 'download') downloading.current = true
  if (progress?.stage === 'prove' && proveStart.current === null) proveStart.current = now
  const frac = progressFraction(progress, downloading.current, proveStart.current === null ? 0 : now - proveStart.current)
  return { pct: Math.round(frac * 100), label: progressLabel(progress), secs: Math.floor((now - started.current) / 1000) }
}

const Bar = ({ pct, label }: { pct: number; label: string }) => (
  <div className="ap-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
    <span style={{ width: `${pct}%` }} />
  </div>
)

/** While a received payment moves into the private balance. Never blocks the app. */
export function ShieldingCard({ sats, progress }: { sats: number; progress: ShieldTxProgress | null }) {
  const { pct, label } = useProofProgress(progress)
  return (
    <section className="panel ap-shielding" role="status" aria-live="polite">
      <div className="hstack" style={{ gap: 10 }}>
        <span className="ap-ico"><ShieldCheck size={18} strokeWidth={2.2} /></span>
        <span className="ap-shielding-t">Making {fmtBch(sats)} BCH private</span>
        <span className="muted tnum" style={{ marginLeft: 'auto', fontSize: 14 }}>{pct}%</span>
      </div>
      <Bar pct={pct} label="Making it private" />
      <p className="muted ap-small">{label}. You can keep using the app.</p>
    </section>
  )
}

export function ShieldProgress({ progress }: { progress: ShieldTxProgress | null }) {
  const { pct, label, secs } = useProofProgress(progress)
  return (
    <div className="center ap-proof" aria-live="polite">
      <span className="ap-ico lg"><ShieldCheck size={30} strokeWidth={2.2} /></span>
      <div className="ap-proof-t">Making a private proof</div>
      <p className="muted ap-small">{label}</p>
      <Bar pct={pct} label="Proof progress" />
      <p className="muted tnum ap-small">{secs}s</p>
      <p className="muted ap-small">This takes about half a minute. Keep this tab open: the proof is made here, so your balance and keys never leave this device.</p>
    </div>
  )
}
