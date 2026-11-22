import { useEffect, useState } from 'react'
import { getProfile, normalizeHandle, type Profile } from '../lib/api'
import { APP_HOST } from '../lib/config'
import { Avatar } from '../ui'
import { PayPage } from './pay/PayPage'
import { PayShell } from './pay/PayShell'
import '../styles/pay.css'

const HANDLE = /^[a-z0-9_]{3,20}$/

type Load = { k: 'loading' } | { k: 'ok'; profile: Profile } | { k: 'missing' } | { k: 'error' }

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export default function Pay({ raw, step, search }: { raw: string; step: string; search: string }) {
  const handle = normalizeHandle(safeDecode(raw))
  const valid = HANDLE.test(handle)
  const params = new URLSearchParams(search)
  const usd = Number(params.get('amount'))
  const askedUsd = Number.isFinite(usd) && usd > 0 ? usd : null
  const askedNote = (params.get('note') ?? '').slice(0, 80)

  const [load, setLoad] = useState<Load>({ k: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!valid) return
    let on = true
    setLoad({ k: 'loading' })
    getProfile({ data: { handle } }).then(
      (p) => on && setLoad(p ? { k: 'ok', profile: p } : { k: 'missing' }),
      () => on && setLoad({ k: 'error' }),
    )
    return () => {
      on = false
    }
  }, [handle, valid, attempt])

  useEffect(() => {
    document.title = load.k === 'ok' ? `Pay @${load.profile.handle} on Unlinked` : 'Unlinked'
  }, [load])

  if (valid && load.k === 'ok') return <PayPage key={load.profile.handle} profile={load.profile} step={step} askedUsd={askedUsd} askedNote={askedNote} />

  if (valid && load.k === 'loading') {
    return (
      <PayShell>
        <div className="center" role="status" aria-label="Loading">
          <div className="pay-sk pay-sk-avatar" />
          <div className="pay-sk pay-sk-title" />
          <div className="pay-sk pay-sk-amount" />
          <div className="pay-sk pay-sk-row" />
          <div className="pay-sk pay-sk-row" />
        </div>
      </PayShell>
    )
  }

  if (valid && load.k === 'error') {
    return (
      <PayShell>
        <div className="center">
          <h1 className="page-title pay-title-sm">This page didn't load</h1>
          <p className="page-sub">Check your connection and try again.</p>
        </div>
        <button type="button" className="btn btn-primary block pay-gap" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
      </PayShell>
    )
  }

  return (
    <PayShell>
      <div className="center">
        <div style={{ display: 'inline-block' }}><Avatar handle="?" size={88} /></div>
        {valid ? (
          <>
            <h1 className="page-title pay-title">No one has claimed @{handle} yet</h1>
            <p className="page-sub">Take the name and get a private pay link.</p>
          </>
        ) : (
          <>
            <h1 className="page-title pay-title">This page doesn't exist</h1>
            <p className="page-sub">Pay links look like {APP_HOST}/@name.</p>
          </>
        )}
      </div>
      <a className="btn btn-primary block pay-gap" href="/onboarding" style={{ textDecoration: 'none' }}>{valid ? 'Claim it' : 'Get your own link'}</a>
    </PayShell>
  )
}
