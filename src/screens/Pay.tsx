import { useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, ChevronDown, Loader2, Wallet } from 'lucide-react'
import { BCH_USD, CHAINS, TOKENS, fmtBch, randHex, type ChainId, type TokenId } from '../data'
import { Avatar, CopyButton, Logo, Modal, TokenIcon, SuccessMark } from '../ui'

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const b58 = (n: number) => Array.from({ length: n }, () => B58[Math.floor(Math.random() * B58.length)]).join('')
function depositAddress(chain: ChainId) {
  if (chain === 'bch') return `bitcoincash:q${Array.from({ length: 41 }, () => 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'[Math.floor(Math.random() * 32)]).join('')}`
  if (chain === 'solana') return b58(44)
  if (chain === 'tron') return `T${b58(33)}`
  return `0x${randHex(40)}`
}

export default function Pay({ raw }: { raw: string }) {
  const [h, qs] = raw.split('?')
  const handle = decodeURIComponent(h).replace(/^@/, '') || 'someone'
  const params = new URLSearchParams(qs ?? '')
  const note = params.get('note')
  const [usd, setUsd] = useState(params.get('amount') ?? '10')
  const [token, setToken] = useState<TokenId>('USDC')
  const [chain, setChain] = useState<ChainId>('base')
  const [picker, setPicker] = useState(false)
  const [phase, setPhase] = useState<'form' | 'deposit' | 'swapping' | 'done'>('form')

  const amountUsd = Number(usd) || 0
  const t = TOKENS[token]
  const sendAmt = amountUsd / t.usd
  const sendStr = sendAmt.toLocaleString('en-US', { maximumFractionDigits: t.usd > 100 ? 6 : 2 })
  const bchOut = token === 'BCH' ? sendAmt : (amountUsd * 0.997) / BCH_USD
  const eta = chain === 'bch' ? 'Instant' : chain === 'ethereum' ? '~4 min' : '~2.5 min'
  const addr = useMemo(() => depositAddress(chain), [chain, phase === 'deposit'])

  const pickToken = (id: TokenId) => {
    setToken(id)
    setChain(TOKENS[id].chains[0])
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          {phase === 'deposit' ? (
            <button className="orb" onClick={() => setPhase('form')} aria-label="Back"><ArrowLeft size={22} strokeWidth={2.2} /></button>
          ) : <Logo />}
        </div>
        <div />
        <div className="topbar-right">
          <a className="btn btn-white md" href="#/onboarding" style={{ textDecoration: 'none' }}>Get <span className="hide-sm">your own </span>link</a>
        </div>
      </header>

      <main className="main narrow">
        {phase === 'form' && (
          <div className="card" style={{ padding: 32 }}>
            <div className="center">
              <div style={{ display: 'inline-block' }}><Avatar handle={handle} size={96} /></div>
              <h1 className="page-title" style={{ marginTop: 16, fontSize: 28 }}>Pay @{handle}</h1>
              {note && <span className="badge blue" style={{ marginTop: 10 }}>{note}</span>}
            </div>

            <div className="center" style={{ margin: '28px 0 8px' }}>
              <label className="hero-num" style={{ display: 'inline-flex', alignItems: 'baseline', fontSize: 56, lineHeight: '64px', cursor: 'text' }}>
                $
                <input
                  value={usd}
                  onChange={(e) => setUsd(e.target.value.replace(/[^0-9.]/g, '').slice(0, 9))}
                  inputMode="decimal"
                  aria-label="Amount in USD"
                  className="hero-num"
                  style={{ border: 0, outline: 0, background: 'none', fontSize: 'inherit', lineHeight: 'inherit', width: `${Math.max(1, usd.length) * 0.62}em`, padding: 0 }}
                />
              </label>
              <div className="hero-sub" style={{ fontSize: 17 }}>≈ {fmtBch(bchOut)} BCH to @{handle}</div>
            </div>

            <h2 className="soft" style={{ fontSize: 15, fontWeight: 500, margin: '24px 4px 10px' }}>Pay with</h2>
            <button className="choice" onClick={() => setPicker(true)}>
              <TokenIcon token={token} chain={chain} size={48} />
              <div style={{ flex: 1 }}>
                <div className="choice-name">{t.name}</div>
                <div className="choice-sym">{token} on {CHAINS[chain].name}</div>
              </div>
              <ChevronDown size={22} className="muted" />
            </button>

            <div className="rows" style={{ marginTop: 12 }}>
              <div className="row"><span className="row-main muted">You send</span><span className="tnum">{sendStr} {token}</span></div>
              <div className="row"><span className="row-main muted">@{handle} gets</span><span className="tnum">≈ {fmtBch(bchOut)} BCH</span></div>
              <div className="row"><span className="row-main muted">Arrives</span><span>{eta}</span></div>
            </div>

            <button className="btn btn-primary block" style={{ marginTop: 20 }} disabled={amountUsd <= 0} onClick={() => setPhase('deposit')}>
              Pay {sendStr} {token}
            </button>
            <p className="help">@{handle} gets a fresh address only they can find. Nobody, including us, can see who paid them.</p>
          </div>
        )}

        {phase === 'deposit' && (
          <div className="card center" style={{ padding: 32 }}>
            <h1 className="page-title" style={{ fontSize: 28 }}>Send {sendStr} {token}</h1>
            <p className="page-sub">on {CHAINS[chain].name}, from any wallet</p>
            <div className="qr-wrap" style={{ display: 'inline-block', padding: 18, borderRadius: 28, background: '#fff', boxShadow: 'var(--shadow-card)', margin: '28px 0 20px' }}>
              <QRCodeSVG value={addr} size={220} level="M" fgColor="#0b0d14" />
            </div>
            <div className="link-box" style={{ textAlign: 'left', marginTop: 0 }}>
              <span className="url mono" style={{ fontSize: 14 }}>{addr}</span>
              <CopyButton text={addr} label="Copy deposit address" />
            </div>
            <div className="badge blue" style={{ marginTop: 20, height: 36, padding: '0 16px', fontSize: 15 }}>
              <Loader2 size={16} className="spin" />Waiting for payment
            </div>
            <div className="hstack" style={{ marginTop: 24 }}>
              {chain === 'bch' && <button className="btn btn-secondary md" style={{ flex: 1 }}><Wallet size={18} />Open wallet</button>}
              <button className="btn btn-primary md" style={{ flex: 1 }} onClick={() => { setPhase('swapping'); setTimeout(() => setPhase('done'), 2200) }}>
                Simulate payment
              </button>
            </div>
            {chain !== 'bch' && <p className="help">If the swap fails, your {token} is refunded to a fresh address.</p>}
          </div>
        )}

        {phase === 'swapping' && (
          <div className="card center" style={{ padding: 48 }}>
            <Loader2 size={40} className="spin" style={{ color: 'var(--blue-9)' }} />
            <h1 className="page-title" style={{ fontSize: 28, marginTop: 20 }}>{chain === 'bch' ? 'Confirming' : `Swapping ${token} to BCH`}</h1>
            <p className="page-sub">This takes {eta.toLowerCase()}. You can close this page.</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="card center" style={{ padding: 40 }}>
            <SuccessMark size={150} />
            <h1 className="page-title" style={{ fontSize: 30, marginTop: 24 }}>Paid</h1>
            <p className="page-sub">@{handle} received ≈ {fmtBch(bchOut)} BCH at an address nobody else can link to them.</p>
            <a className="btn btn-secondary block" href="#/onboarding" style={{ marginTop: 28, textDecoration: 'none' }}>Get your own link</a>
          </div>
        )}
      </main>

      {picker && (
        <Modal title="Choose currency" onClose={() => setPicker(false)}>
          <div className="stack" style={{ gap: 12 }}>
            {(Object.keys(TOKENS) as TokenId[]).map((id) => (
              <button key={id} className={`choice${token === id ? ' on' : ''}`} onClick={() => pickToken(id)}>
                <TokenIcon token={id} size={52} />
                <div>
                  <div className="choice-name">{TOKENS[id].name}</div>
                  <div className="choice-sym">{id}</div>
                </div>
              </button>
            ))}
          </div>
          {TOKENS[token].chains.length > 1 && (
            <>
              <h3 className="soft" style={{ fontSize: 15, fontWeight: 500, margin: '22px 4px 10px' }}>Network</h3>
              <div className="hstack" style={{ flexWrap: 'wrap', gap: 8 }}>
                {TOKENS[token].chains.map((c) => (
                  <button key={c} className={`btn sm ${chain === c ? 'btn-tint' : 'btn-secondary'}`} onClick={() => setChain(c)}>
                    <span className="dot" style={{ color: CHAINS[c].color }} />{CHAINS[c].name}
                  </button>
                ))}
              </div>
            </>
          )}
          <button className="btn btn-primary block md" style={{ marginTop: 24, height: 52 }} onClick={() => setPicker(false)}>Done</button>
        </Modal>
      )}
    </div>
  )
}
