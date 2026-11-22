import { lazy, Suspense, useState } from 'react'
import { Search } from 'lucide-react'
import type { XToken } from '../../lib/api'
import { Modal } from '../../ui'
import { chainName, MAIN_CHAINS } from './tokens'

const ChainLogo = lazy(() => import('./xicons').then((m) => ({ default: m.ChainLogo })))
const TokenLogo = lazy(() => import('./xicons').then((m) => ({ default: m.TokenLogo })))
const Blank = ({ size }: { size: number }) => <span className="pay-chain-letter" style={{ width: size, height: size }} aria-hidden />

function ChainMark({ id, size = 20 }: { id: string; size?: number }) {
  return <Suspense fallback={<Blank size={size} />}><ChainLogo id={id} size={size} /></Suspense>
}

function TokenMark({ symbol, size = 18 }: { symbol: string; size?: number }) {
  return <Suspense fallback={<Blank size={size} />}><TokenLogo symbol={symbol} size={size} /></Suspense>
}

type Props = { groups: Map<string, XToken[]>; chain: string; onChain: (id: string) => void }

export function ChainPicker({ groups, chain, onChain }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const main = MAIN_CHAINS.filter((c) => groups.has(c))
  const shown = main.includes(chain) || !groups.has(chain) ? main : [...main, chain]
  const others = [...groups.keys()].filter((c) => !main.includes(c)).sort((a, b) => chainName(a).localeCompare(chainName(b)))
  const term = q.trim().toLowerCase()
  const hits = others.filter((c) => !term || chainName(c).toLowerCase().includes(term) || c.includes(term) || groups.get(c)!.some((t) => t.symbol.toLowerCase().includes(term)))

  return (
    <>
      <div className="pay-chips left" role="group" aria-label="Chain">
        {shown.map((c) => (
          <button key={c} type="button" className={`btn sm pay-chip ${c === chain ? 'btn-tint' : 'btn-secondary'}`} aria-pressed={c === chain} onClick={() => onChain(c)}>
            <ChainMark id={c} />{chainName(c)}
          </button>
        ))}
        {others.length > 0 && (
          <button type="button" className="btn sm btn-secondary" onClick={() => setOpen(true)}>More chains ({others.length})</button>
        )}
      </div>
      {open && (
        <Modal title="More chains" onClose={() => (setOpen(false), setQ(''))}>
          <div className="field-wrap">
            <span className="field-prefix"><Search size={18} /></span>
            <input className="field pre" autoFocus placeholder="Search chain or token" aria-label="Search chain or token" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="pay-chain-list">
            {hits.map((c) => (
              <button
                key={c}
                type="button"
                className={`choice${c === chain ? ' on' : ''}`}
                aria-pressed={c === chain}
                onClick={() => {
                  onChain(c)
                  setOpen(false)
                  setQ('')
                }}
              >
                <ChainMark id={c} size={40} />
                <div style={{ minWidth: 0 }}>
                  <div className="choice-name">{chainName(c)}</div>
                  <div className="choice-sym">{groups.get(c)!.slice(0, 4).map((t) => t.symbol).join(', ')}</div>
                </div>
              </button>
            ))}
            {hits.length === 0 && <p className="help">No chain matches "{q}".</p>}
          </div>
        </Modal>
      )}
    </>
  )
}

export function TokenPicker({ tokens, token, onToken }: { tokens: XToken[]; token: string; onToken: (assetId: string) => void }) {
  const [all, setAll] = useState(false)
  const LIMIT = 4
  const sel = tokens.findIndex((t) => t.assetId === token)
  const shown = all || tokens.length <= LIMIT + 1 ? tokens : tokens.filter((_, i) => i < LIMIT || i === sel)
  const hidden = tokens.length - shown.length
  return (
    <div className="pay-chips left" role="group" aria-label="Token">
      {shown.map((t) => (
        <button key={t.assetId} type="button" className={`btn sm pay-chip ${t.assetId === token ? 'btn-tint' : 'btn-secondary'}`} aria-pressed={t.assetId === token} onClick={() => onToken(t.assetId)}><TokenMark symbol={t.symbol} />{t.symbol}</button>
      ))}
      {hidden > 0 && <button type="button" className="btn sm btn-secondary" onClick={() => setAll(true)}>+{hidden} more</button>}
    </div>
  )
}
