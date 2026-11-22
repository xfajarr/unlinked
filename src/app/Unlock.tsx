import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Avatar, Logo } from '../ui'
import { go } from '../App'
import { unlock, useVault } from '../lib/vault'
import { errMsg } from './format'

export default function Unlock({ handle }: { handle: string }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { restoring } = useVault()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pw || busy) return
    setBusy(true)
    setError(null)
    try {
      await unlock(pw)
    } catch (err) {
      setError(errMsg(err))
      setBusy(false)
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left"><Logo /></div>
        <div />
        <div />
      </header>
      <main className="main narrow">
        {!restoring && <form className="stack center ap-gate" onSubmit={submit}>
          <div style={{ display: 'inline-block' }}><Avatar handle={handle} size={76} /></div>
          <div>
            <h1 className="page-title">Welcome back</h1>
            <p className="page-sub">@{handle}</p>
          </div>
          <input
            className="field"
            type="password"
            placeholder="Password"
            aria-label="Password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setError(null) }}
            autoComplete="current-password"
            autoFocus
            aria-invalid={!!error}
          />
          <p className="ap-err" role="alert">{error ?? ''}</p>
          <button type="submit" className="btn btn-primary block" disabled={!pw || busy}>
            {busy ? <><Loader2 size={18} className="spin" />Unlocking</> : 'Unlock'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => go('/onboarding?restore=1')}>Forgot your password? Use your 12 words</button>
        </form>}
      </main>
    </div>
  )
}
