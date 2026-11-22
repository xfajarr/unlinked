import { useState } from 'react'
import { ChevronDown, ChevronRight, KeyRound, Loader2, Lock, LogOut, RefreshCw, Server, Timer } from 'lucide-react'
import { Avatar, CopyButton, Modal, ModalCancel, Switch } from '../ui'
import { go } from '../App'
import { useAccount } from '../app/account'
import { clearHistory } from '../app/history'
import { errMsg, fmtBch, linkHost } from '../app/format'
import { PinEntry } from '../app/Pin'
import { revealWords } from '../app/vaultio'
import { FULCRUM_SERVERS, NETWORK } from '../lib/config'
import { AUTOLOCK_OPTIONS, getAutoLock } from '../lib/session'
import { forget, lock, markBackedUp, setAutoLock, vaultKind, type VaultKind } from '../lib/vault'

function RecoveryPhrase({ backedUp, kind, onDone }: { backedUp: boolean; kind: VaultKind; onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [words, setWords] = useState<string | null>(null)
  const [saved, setSaved] = useState(backedUp)

  async function reveal(e: React.FormEvent) {
    e.preventDefault()
    if (!pw || busy) return
    setBusy(true)
    setError(null)
    try {
      setWords(await revealWords(pw))
      setPw('')
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  if (!words && kind === 'pin') {
    return (
      <div className="stack center" style={{ gap: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>Enter your PIN to see your 12 words.</p>
        <PinEntry verify={async (pin) => setWords(await revealWords(pin))} busyLabel="Checking" />
      </div>
    )
  }
  if (!words) {
    return (
      <form className="stack" style={{ gap: 12 }} onSubmit={reveal}>
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>Enter your password to see your 12 words.</p>
        <input className="field" type="password" placeholder="Password" aria-label="Password" value={pw} onChange={(e) => { setPw(e.target.value); setError(null) }} autoComplete="current-password" autoFocus />
        {error && <p className="ap-err" role="alert">{error}</p>}
        <button className="btn btn-primary block" type="submit" disabled={!pw || busy}>{busy ? <><Loader2 size={18} className="spin" />Checking</> : 'Show words'}</button>
      </form>
    )
  }
  return (
    <>
      <div className="words">
        {words.split(' ').map((w, i) => <div className="word" key={i}><span>{i + 1}</span>{w}</div>)}
      </div>
      <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        <span className="muted" style={{ fontSize: 15 }}>Anyone with these words owns your money.</span>
        <CopyButton text={words} label="Copy recovery phrase" />
      </div>
      {!backedUp && (
        <>
          <label className="card flat hstack" style={{ padding: '16px 18px', borderRadius: 20, cursor: 'pointer', justifyContent: 'space-between', marginTop: 18 }}>
            <span>I saved these words somewhere safe</span>
            <Switch on={saved} onChange={setSaved} label="I saved my recovery phrase" />
          </label>
          <button className="btn btn-primary block" style={{ marginTop: 14 }} disabled={!saved} onClick={() => { markBackedUp(); onDone() }}>Done</button>
        </>
      )}
    </>
  )
}

export default function Settings() {
  const { stored, history, rescan, items } = useAccount()
  const [modal, setModal] = useState<'phrase' | 'servers' | 'forget' | null>(() =>
    new URLSearchParams(window.location.search).has('backup') ? 'phrase' : null,
  )
  const [rescanning, setRescanning] = useState(false)
  const [autoLock, setAutoLockState] = useState(getAutoLock)
  const received = history.filter((e) => e.kind === 'in')
  const total = received.reduce((s, e) => s + (e.kind === 'in' ? e.sats : 0), 0)

  return (
    <main className="main narrow" style={{ maxWidth: 600 }}>
      <div className="center" style={{ margin: '16px 0 24px' }}>
        <div style={{ display: 'inline-block', marginBottom: 16 }}><Avatar handle={stored.handle} size={88} /></div>
        <h1 className="page-title">@{stored.handle}</h1>
        <p className="page-sub">{linkHost()}/@{stored.handle}</p>
        <div className="mini-stats">
          <span><b className="tnum">{received.length}</b> payment{received.length === 1 ? '' : 's'}</span>
          <i aria-hidden />
          <span><b className="tnum">{fmtBch(total)}</b> BCH received</span>
        </div>
      </div>

      <button className="btn btn-primary block" onClick={() => go('/link')}>Share your link</button>

      <h2 className="soft" style={{ fontSize: 19, fontWeight: 500, letterSpacing: '-0.015em', margin: '40px 4px 14px' }}>Account</h2>
      <div className="list-card">
        <button className="nav-row" onClick={() => setModal('phrase')}>
          <span className="ico"><KeyRound size={24} /></span>Recovery phrase
          {!stored.backedUp && <span className="badge ap-tone-warn" style={{ marginLeft: 'auto' }}>Not backed up</span>}
          <ChevronRight className="chev" size={22} style={stored.backedUp ? undefined : { marginLeft: 8 }} />
        </button>
        <button
          className="nav-row"
          disabled={rescanning}
          onClick={() => {
            setRescanning(true)
            rescan()
            setTimeout(() => setRescanning(false), 2500)
          }}
        >
          <span className="ico"><RefreshCw size={24} className={rescanning || items === null ? 'spin' : undefined} /></span>Rescan for payments
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 16 }}>{rescanning || items === null ? 'Scanning' : 'Up to date'}</span>
        </button>
        <button className="nav-row" onClick={() => setModal('servers')}>
          <span className="ico"><Server size={24} /></span>Bitcoin Cash servers
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 16 }}>{NETWORK}</span>
          <ChevronRight className="chev" size={22} style={{ marginLeft: 8 }} />
        </button>
        <label className="nav-row" style={{ cursor: 'pointer' }}>
          <span className="ico"><Timer size={24} /></span>Auto-lock
          <select
            className="muted"
            style={{ marginLeft: 'auto', appearance: 'none', background: 'transparent', border: 0, font: 'inherit', fontSize: 16, textAlign: 'right', cursor: 'pointer', padding: '4px 0' }}
            value={autoLock}
            onChange={(e) => {
              const min = Number(e.target.value)
              setAutoLockState(min)
              setAutoLock(min)
            }}
          >
            {AUTOLOCK_OPTIONS.map((o) => <option key={o.min} value={o.min}>{o.label}</option>)}
          </select>
          <ChevronDown className="chev" size={22} style={{ marginLeft: 8, pointerEvents: 'none' }} />
        </label>
        <button className="nav-row" onClick={lock}>
          <span className="ico"><Lock size={24} /></span>Lock
        </button>
        <button className="nav-row" style={{ color: 'var(--red-11)' }} onClick={() => setModal('forget')}>
          <span className="ico" style={{ color: 'var(--red-11)' }}><LogOut size={24} /></span>Forget this device
        </button>
      </div>

      {modal === 'phrase' && (
        <Modal title="Recovery phrase" onClose={() => setModal(null)}>
          <RecoveryPhrase backedUp={stored.backedUp} kind={vaultKind(stored)} onDone={() => setModal(null)} />
        </Modal>
      )}
      {modal === 'servers' && (
        <Modal title="Bitcoin Cash servers" onClose={() => setModal(null)}>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 15 }}>Your app asks these Fulcrum servers about your addresses directly. Our server never sees them.</p>
          <div className="rows">
            {FULCRUM_SERVERS.map((s) => <div className="row" key={s}><span className="row-main mono" style={{ fontSize: 15 }}>{s}</span></div>)}
          </div>
        </Modal>
      )}
      {modal === 'forget' && (
        <Modal title="Forget this device?" onClose={() => setModal(null)}>
          <p className="muted" style={{ margin: 0, fontSize: 16 }}>Your keys are removed from this browser. You need your 12 words to get back in.{!stored.backedUp && ' You haven’t backed them up yet.'}</p>
          <div className="hstack" style={{ marginTop: 24 }}>
            <ModalCancel className="btn btn-secondary md" style={{ flex: 1 }}>Cancel</ModalCancel>
            <button className="btn md" style={{ flex: 1, background: 'var(--red-11)', color: '#fff' }} onClick={() => { go('/onboarding'); clearHistory(stored.handle); forget() }}>Forget</button>
          </div>
        </Modal>
      )}
    </main>
  )
}
