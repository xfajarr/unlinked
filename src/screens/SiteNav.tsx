import { useEffect, useState } from 'react'
import { Unlink } from 'lucide-react'
import { go, useStore } from '../App'

const PENDING = 'unlinked:scroll-to'
const onLanding = () => location.pathname === '/landing' || location.pathname === '/'

/** Landing reads this once on mount, so a section link clicked on another page still lands on its section. */
export function takePendingSection(): string | null {
  try {
    const id = sessionStorage.getItem(PENDING)
    sessionStorage.removeItem(PENDING)
    return id
  } catch {
    return null
  }
}

export function SiteNav({ page }: { page: 'landing' | 'bridge' }) {
  const { user } = useStore()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  const section = (id: string) => {
    if (onLanding()) return document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    try {
      sessionStorage.setItem(PENDING, id)
    } catch { /* storage off: the link still opens the landing */ }
    go('/landing')
  }

  return (
    <header className={`ld-nav${scrolled ? ' scrolled' : ''}`}>
      <div className="ld-nav-in">
        <a
          className="logo"
          href="/landing"
          style={{ textDecoration: 'none', color: 'inherit' }}
          onClick={(e) => {
            e.preventDefault()
            if (onLanding()) window.scrollTo({ top: 0, behavior: 'smooth' })
            else go('/landing')
          }}
        >
          <span className="logo-mark"><Unlink size={18} strokeWidth={2.4} /></span>unlinked
        </a>
        <nav className="ld-links" aria-label="Sections">
          <button onClick={() => section('how')}>How it works</button>
          <button onClick={() => section('privacy')}>Privacy</button>
          <button onClick={() => section('faq')}>FAQ</button>
          <button onClick={() => go('/bridge')} aria-current={page === 'bridge' ? 'page' : undefined}>Bridge</button>
        </nav>
        <button className="btn btn-primary md" onClick={() => go(user ? '/dashboard' : '/onboarding')}>{user ? 'Open app' : 'Get your link'}</button>
      </div>
    </header>
  )
}
