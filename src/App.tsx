import type React from 'react'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, History, House, Link2, Wallet } from 'lucide-react'
import { Logo } from './ui'
import Onboarding from './screens/Onboarding'
import Dashboard from './screens/Dashboard'
import Transactions from './screens/Transactions'
import LinkPage from './screens/LinkPage'
import Send from './screens/Send'
import Settings from './screens/Settings'
import Pay from './screens/Pay'

type User = { handle: string; mnemonic: string }
type Store = { user: User | null; setUser: (u: User | null) => void }
const Ctx = createContext<Store>({ user: null, setUser: () => {} })
export const useStore = () => useContext(Ctx)

const KEY = 'unlinked:user'
function load(): User | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/')
  useEffect(() => {
    const f = () => {
      setHash(window.location.hash.slice(1) || '/')
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return hash
}

export const go = (path: string) => (window.location.hash = path)

const NAV = [
  { path: '/dashboard', label: 'Home', short: 'Home', icon: House },
  { path: '/send', label: 'Send', short: 'Send', icon: ArrowUpRight },
  { path: '/transactions', label: 'Activity', short: 'Activity', icon: History },
  { path: '/settings', label: 'Wallet', short: 'Wallet', icon: Wallet },
]

// solid versions of the nav icons, shown on the active bottom-nav item
const SOLID: Record<string, React.ReactNode> = {
  '/dashboard': (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
      <path d="M3.5 10.2 12 3.3l8.5 6.9V19.5a1.5 1.5 0 0 1-1.5 1.5h-4.2v-5.6a1 1 0 0 0-1-1h-3.6a1 1 0 0 0-1 1V21H5a1.5 1.5 0 0 1-1.5-1.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  '/transactions': (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" />
      <path d="M12 7.2V12l3.2 2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  '/settings': (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
      <path d="M5.5 4h11A1.5 1.5 0 0 1 18 5.5V7H5.5a1.5 1.5 0 0 1 0-3z" fill="currentColor" opacity="0.55" />
      <rect x="2.5" y="6" width="19" height="14.5" rx="3.5" fill="currentColor" />
      <circle cx="16.8" cy="13.2" r="1.6" fill="#fff" />
    </svg>
  ),
}

function Tabs({ active }: { active: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const nav = useRef<HTMLElement>(null)
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[active]
      setPill(el ? { x: el.offsetLeft, w: el.offsetWidth } : null)
    }
    measure()
    document.fonts?.ready.then(measure)
    const ro = new ResizeObserver(measure)
    if (nav.current) ro.observe(nav.current)
    return () => ro.disconnect()
  }, [active])
  return (
    <nav className="tabs" aria-label="Main" ref={nav}>
      {pill && <span className="tabs-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
      {NAV.map(({ path, label }) => (
        <button
          key={path}
          ref={(el) => { refs.current[path] = el }}
          className={active === path ? 'on' : ''}
          aria-current={active === path ? 'page' : undefined}
          data-label={label}
          onClick={() => go(path)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}

export default function App() {
  const [user, setUserState] = useState<User | null>(load)
  const hash = useHash()
  const setUser = (u: User | null) => {
    setUserState(u)
    try {
      if (u) localStorage.setItem(KEY, JSON.stringify(u))
      else localStorage.removeItem(KEY)
    } catch { /* storage unavailable: keep in memory */ }
  }

  const path = hash.startsWith('/pay/') ? hash : hash.split('?')[0]
  const current = path === '/' || path === '/inbox' ? '/dashboard' : path === '/payments' ? '/transactions' : path
  let page: React.ReactNode
  let chrome = true
  if (hash.startsWith('/pay/')) {
    page = <Pay raw={hash.slice(5)} />
    chrome = false
  } else if (!user || path === '/onboarding') {
    page = <Onboarding />
    chrome = false
  } else {
    page =
      path === '/link' ? <LinkPage /> :
      path === '/send' ? <Send key={'send' + hash} /> :
      path === '/withdraw' ? <Send key={'withdraw' + hash} mode="withdraw" /> :
      path === '/settings' ? <Settings /> :
      path === '/transactions' || path === '/payments' ? <Transactions key={hash} /> :
      <Dashboard />
  }

  return (
    <Ctx.Provider value={{ user, setUser }}>
      <div className="shell">
        {chrome && user && (
          <header className="topbar nav-bar">
            <div className="topbar-left"><Logo /></div>
            <Tabs active={current} />
            <div className="topbar-right">
              <button className="btn btn-primary md cta-create" onClick={() => go('/link')} aria-label="Create link">
                <Link2 size={18} strokeWidth={2.4} /><span className="hide-narrow">Create link</span>
              </button>
            </div>
          </header>
        )}
        {chrome && user && (
          <nav className={`bottom-nav${NAV.some((n) => n.path === current) ? '' : ' no-pill'}`} aria-label="Main" style={{ ['--i' as string]: Math.max(0, NAV.findIndex((n) => n.path === current)) }}>
            <span className="bottom-pill" aria-hidden />
            {NAV.map(({ path, label, icon: I }) => {
              const on = current === path
              return (
                <button key={path} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} aria-label={label} title={label} onClick={() => go(path)}>
                  {on && SOLID[path] ? SOLID[path] : <I size={24} strokeWidth={on ? 2.6 : 2} />}
                </button>
              )
            })}
          </nav>
        )}
        {page}
        <span className="badge neutral demo-chip"><span className="dot" style={{ color: '#f5a524' }} />Demo<span className="hide-sm"> · no real funds</span></span>
      </div>
    </Ctx.Provider>
  )
}
