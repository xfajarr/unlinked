import { useState } from 'react'
import { ChevronRight, KeyRound, LogOut, Server, ShieldCheck } from 'lucide-react'
import { PAYMENTS, fmtBch } from '../data'
import { Avatar, CopyButton, Modal, ModalCancel } from '../ui'
import { go, useStore } from '../App'

const FULCRUM = ['bch.imaginary.cash', 'electroncash.de', 'bch.loping.net']

export default function Settings() {
  const { user, setUser } = useStore()
  const [modal, setModal] = useState<'phrase' | 'servers' | 'signout' | null>(null)
  const total = PAYMENTS.reduce((s, p) => s + p.bch, 0)

  return (
    <main className="main narrow" style={{ maxWidth: 600 }}>
      <div className="center" style={{ margin: '16px 0 24px' }}>
        <div style={{ display: 'inline-block', marginBottom: 16 }}><Avatar handle={user!.handle} size={88} /></div>
        <h1 className="page-title">@{user!.handle}</h1>
        <p className="page-sub">unlinked.cash/@{user!.handle}</p>
        <div className="mini-stats">
          <span><b className="tnum">{PAYMENTS.length}</b> payments</span>
          <i aria-hidden />
          <span><b className="tnum">{fmtBch(total)}</b> BCH received</span>
        </div>
      </div>

      <button className="btn btn-primary block" onClick={() => go('/link')}>Share your link</button>

      <h2 className="soft" style={{ fontSize: 19, fontWeight: 500, letterSpacing: '-0.015em', margin: '40px 4px 14px' }}>Account</h2>
      <div className="list-card">
        <button className="nav-row" onClick={() => setModal('phrase')}>
          <span className="ico"><KeyRound size={24} /></span>Recovery phrase<ChevronRight className="chev" size={22} />
        </button>
        <button className="nav-row" onClick={() => setModal('servers')}>
          <span className="ico"><Server size={24} /></span>Fulcrum servers
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 16 }}>{FULCRUM.length} connected</span>
          <ChevronRight className="chev" size={22} style={{ marginLeft: 8 }} />
        </button>
        <div className="nav-row">
          <span className="ico"><ShieldCheck size={24} /></span>Passkey login
          <span className="badge neutral" style={{ marginLeft: 'auto' }}>Soon</span>
        </div>
        <button className="nav-row" style={{ color: 'var(--red-11)' }} onClick={() => setModal('signout')}>
          <span className="ico" style={{ color: 'var(--red-11)' }}><LogOut size={24} /></span>Sign out
        </button>
      </div>

      {modal === 'phrase' && (
        <Modal title="Recovery phrase" onClose={() => setModal(null)}>
          <div className="words">
            {user!.mnemonic.split(' ').map((w, i) => <div className="word" key={i}><span>{i + 1}</span>{w}</div>)}
          </div>
          <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 20 }}>
            <span className="muted" style={{ fontSize: 15 }}>Anyone with these words owns your money.</span>
            <CopyButton text={user!.mnemonic} label="Copy recovery phrase" />
          </div>
        </Modal>
      )}
      {modal === 'servers' && (
        <Modal title="Fulcrum servers" onClose={() => setModal(null)}>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 15 }}>Your app spreads its lookups across these, so no single server sees all your addresses.</p>
          <div className="rows">
            {FULCRUM.map((s) => (
              <div className="row" key={s}><span className="row-main mono" style={{ fontSize: 15 }}>{s}</span><span className="badge green"><span className="dot" />Online</span></div>
            ))}
          </div>
        </Modal>
      )}
      {modal === 'signout' && (
        <Modal title="Sign out?" onClose={() => setModal(null)}>
          <p className="muted" style={{ margin: 0, fontSize: 16 }}>Your keys are removed from this browser. You need your 12 words to get back in.</p>
          <div className="hstack" style={{ marginTop: 24 }}>
            <ModalCancel className="btn btn-secondary md" style={{ flex: 1 }}>Cancel</ModalCancel>
            <button className="btn md" style={{ flex: 1, background: 'var(--red-11)', color: '#fff' }} onClick={() => { setUser(null); go('/onboarding') }}>Sign out</button>
          </div>
        </Modal>
      )}
    </main>
  )
}
