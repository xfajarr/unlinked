import type React from 'react'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, History, House, Link2, Wallet } from 'lucide-react'
import './styles/app.css'
import { Logo } from './ui'
import Onboarding from './screens/Onboarding'
import Landing from './screens/Landing'
import Dashboard from './screens/Dashboard'
import Transactions from './screens/Transactions'
import LinkPage from './screens/LinkPage'
import Send from './screens/Send'
import Settings from './screens/Settings'
import Pay from './screens/Pay'
import DemoDashboard from './screens/demo/Dashboard'
import DemoSend from './screens/demo/Send'
import DemoTransactions from './screens/demo/Transactions'
import { ToastProvider } from './components/Toast'
import { useVault } from './lib/vault'
import { NETWORK } from './lib/config'
import { AccountProvider } from './app/account'
import Unlock from './app/Unlock'

type User = { handle: string }
const Ctx = createContext<{ user: User | null }>({ user: null })
export const useStore = () => useContext(Ctx)

// ?embed=1 renders the app as a showcase (landing page phone): fixed demo user and demo data, nothing saved
export const EMBED = new URLSearchParams(window.location.search).has('embed')
const EMBED_USER: User = { handle: 'rina' }
if (EMBED) document.documentElement.classList.add('embed')

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
  const hash = useHash()
  const { stored, keys } = useVault()
  const user = EMBED ? EMBED_USER : stored ? { handle: stored.handle } : null

  const path = hash.startsWith('/pay/') ? hash : hash.split('?')[0]
  const current = path === '/' || path === '/inbox' ? '/dashboard' : path === '/payments' ? '/transactions' : path
  const paying = hash.startsWith('/pay/')
  // no account: app routes go through /onboarding, so a claim that writes the vault mid-flow stays on it
  const toOnboarding = !EMBED && !paying && !stored && !['/', '', '/landing', '/onboarding'].includes(path)
  useEffect(() => {
    if (toOnboarding) go('/onboarding')
  }, [toOnboarding])

  let page: React.ReactNode
  let chrome = true
  if (paying) {
    page = <Pay raw={hash.slice(5)} />
    chrome = false
  } else if (path === '/landing' || (!user && (path === '/' || path === ''))) {
    page = <Landing />
    chrome = false
  } else if (!EMBED && (!stored || path === '/onboarding')) {
    page = <Onboarding />
    chrome = false
  } else if (!EMBED && !keys) {
    page = <Unlock handle={stored!.handle} />
    chrome = false
  } else if (EMBED) {
    page =
      path === '/send' ? <DemoSend key={'send' + hash} /> :
      path === '/withdraw' ? <DemoSend key={'withdraw' + hash} mode="withdraw" /> :
      path === '/transactions' || path === '/payments' ? <DemoTransactions key={hash} /> :
      <DemoDashboard />
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
    <ToastProvider>
      <Ctx.Provider value={{ user }}>
        <AccountProvider stored={EMBED ? null : stored} keys={EMBED ? null : keys}>
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
            {!EMBED && NETWORK === 'chipnet' && <span className="badge neutral demo-chip"><span className="dot" style={{ color: '#f5a524' }} /><span>Chipnet<span className="hide-sm">, test coins only</span></span></span>}
          </div>
        </AccountProvider>
      </Ctx.Provider>
    </ToastProvider>
  )
}
