import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { PAYMENTS, SENT, TOKENS, type Payment, type TokenId } from '../../data'
import { PaymentModal, PaymentRow } from './PaymentParts'
import { TokenIcon } from '../../ui'

const PAGE = 10

function dayKey(minutesAgo: number) {
  const d = new Date(Date.now() - minutesAgo * 60_000)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
function dayLabel(key: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - key) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return new Date(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function Transactions() {
  const [token, setToken] = useState<TokenId | 'all'>(() => (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('token') as TokenId | null) ?? 'all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<Payment | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const all = [...SENT.map((s) => ({ ...s, minutesAgo: Math.max(0, Math.round((Date.now() - s.out!.at) / 60000)) })), ...PAYMENTS]
    return all.filter((p) => (token === 'all' || p.token === token) && (!needle || (p.note ?? 'payment received').toLowerCase().includes(needle)))
  }, [token, q])
  const sentCount = filtered.filter((p) => p.out).length
  const recvCount = filtered.length - sentCount
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  const summary = q.trim()
    ? `${plural(filtered.length, 'result')} for “${q.trim()}”`
    : (sentCount
        ? [recvCount && `${recvCount} received`, `${sentCount} sent`].filter(Boolean).join(' · ')
        : recvCount ? `${plural(recvCount, 'payment')} received` : 'No payments') + (token === 'all' || !filtered.length ? '' : ` in ${token}`)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const visible = filtered.slice(page * PAGE, page * PAGE + PAGE)
  const goPage = (n: number) => {
    setPage(n)
    document.querySelector('.frame')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const groups: { key: number; items: Payment[]; sum: number }[] = []
  for (const p of visible) {
    const key = dayKey(p.minutesAgo)
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) {
      g = { key, items: [], sum: filtered.filter((x) => dayKey(x.minutesAgo) === key).reduce((s, x) => s + x.bch, 0) }
      groups.push(g)
    }
    g.items.push(p)
  }

  const counts = PAYMENTS.reduce<Record<string, number>>((m, p) => ({ ...m, [p.token]: (m[p.token] ?? 0) + 1 }), {})
  const filters: (TokenId | 'all')[] = ['all', ...(Object.keys(TOKENS) as TokenId[]).filter((t) => counts[t])]

  return (
    <main className="main" style={{ maxWidth: 720 }}>
      <div className="page-head inline">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-sub tnum">{summary}</p>
        </div>
      </div>

      <div className="frame">
        <div className="frame-bar pay-filters">
          <div className="field-wrap search">
            <Search size={18} className="field-prefix" style={{ left: 16 }} />
            <input className="field" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Search notes" aria-label="Search notes" />
            {q && <button className="field-end orb sm" style={{ width: 32, height: 32 }} onClick={() => setQ('')} aria-label="Clear search"><X size={16} /></button>}
          </div>
          <div className="chip-row" role="tablist" aria-label="Filter by token">
            {filters.map((t) => (
              <button key={t} role="tab" aria-selected={token === t} className={`chip${token === t ? ' on' : ''}`} onClick={() => { setToken(t); setPage(0) }}>
                {t !== 'all' && <TokenIcon token={t} size={20} />}
                {t === 'all' ? 'All' : t}<span className="chip-count tnum">{t === 'all' ? PAYMENTS.length : counts[t]}</span>
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="panel center" style={{ padding: 40 }}>
            <div className="soft" style={{ fontSize: 17 }}>No payments match</div>
            <p className="muted" style={{ margin: '4px 0 16px' }}>Try another token or search.</p>
            <button className="btn btn-secondary md" onClick={() => { setToken('all'); setQ('') }}>Clear filters</button>
          </div>
        ) : (
          <div className="panel" style={{ padding: '6px 24px 10px' }}>
            {groups.map((g) => (
              <div key={g.key} className="day-group">
                <div className="day-head">
                  <span>{dayLabel(g.key)}</span>
                </div>
                <div className="rows">
                  {g.items.map((p) => <PaymentRow key={p.id} p={p} onOpen={setOpen} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {pages > 1 && (
          <nav className="pager" aria-label="Pages">
            <span className="pager-info tnum">{page * PAGE + 1}–{Math.min(filtered.length, page * PAGE + PAGE)} of {filtered.length}</span>
            <div className="pager-nums">
              <button className="pager-btn" onClick={() => goPage(page - 1)} disabled={page === 0} aria-label="Previous page"><ChevronLeft size={18} strokeWidth={2.4} /></button>
              {Array.from({ length: pages }, (_, i) => (
                <button key={i} className={`pager-btn tnum${i === page ? ' on' : ''}`} onClick={() => goPage(i)} aria-current={i === page ? 'page' : undefined} aria-label={`Page ${i + 1}`}>{i + 1}</button>
              ))}
              <button className="pager-btn" onClick={() => goPage(page + 1)} disabled={page === pages - 1} aria-label="Next page"><ChevronRight size={18} strokeWidth={2.4} /></button>
            </div>
          </nav>
        )}
      </div>

      {open && <PaymentModal p={open} onClose={() => setOpen(null)} />}
    </main>
  )
}
