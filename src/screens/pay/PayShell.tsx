import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '../../ui'

export function PayShell({ onBack, children, bare }: { onBack?: () => void; children: ReactNode; bare?: boolean }) {
  return (
    <div className="pay-root">
      <header className="topbar">
        <div className="topbar-left">
          {onBack ? (
            <button className="orb" onClick={onBack} aria-label="Back"><ArrowLeft size={22} strokeWidth={2.2} /></button>
          ) : <Logo />}
        </div>
        <div />
        <div className="topbar-right">
          <a className="btn btn-white md" href="/onboarding" style={{ textDecoration: 'none' }}>Get <span className="hide-sm">your own </span>link</a>
        </div>
      </header>
      <main className="main narrow">
        {bare ? children : <div className="card pay-card">{children}</div>}
      </main>
    </div>
  )
}

export function Notice({ children, tone = 'warn', role = 'alert' }: { children: ReactNode; tone?: 'warn' | 'info'; role?: 'alert' | 'status' }) {
  return <div className={`pay-notice ${tone}`} role={role}>{children}</div>
}

export function LiveStatus({ children }: { children: ReactNode }) {
  return (
    <p className="pay-live" role="status">
      <span className="pay-pulse" aria-hidden />{children}
    </p>
  )
}
