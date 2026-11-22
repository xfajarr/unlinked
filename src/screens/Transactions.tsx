import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { PaymentModal, PaymentRow, titleOf } from './PaymentParts'
import { go } from '../App'
import { useAccount } from '../app/account'
import type { Entry } from '../app/history'

const PAGE = 10
type Filter = 'all' | 'in' | 'out'
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'in', label: 'Received' }, { id: 'out', label: 'Sent' }]
const isOut = (e: Entry) => e.kind === 'send' || e.kind === 'withdraw'

const dayKey = (at: number) => {
  const d = new Date(at)
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
  const { history, items, error, poll } = useAccount()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<Entry | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return history.filter((e) => (filter === 'all' || (filter === 'out' ? isOut(e) : e.kind === 'in')) && (!needle || titleOf(e).toLowerCase().includes(needle) || ('to' in e && e.to.includes(needle))))
  }, [history, filter, q])
  const count = (f: Filter) => history.filter((e) => f === 'all' || (f === 'out' ? isOut(e) : e.kind === 'in')).length
  const recv = filtered.filter((e) => e.kind === 'in').length
  const sent = filtered.filter(isOut).length
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  const summary = q.trim()
    ? `${plural(filtered.length, 'result')} for “${q.trim()}”`
    : [recv && `${recv} received`, sent && `${sent} sent`].filter(Boolean).join(', ') || 'No payments yet'
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const visible = filtered.slice(page * PAGE, page * PAGE + PAGE)
  const goPage = (n: number) => {
    setPage(n)
    document.querySelector('.frame')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const groups: { key: number; items: Entry[] }[] = []
  for (const e of visible) {
    const key = dayKey(e.at)
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) groups.push((g = { key, items: [] }))
    g.items.push(e)
  }

  return (
    <main className="main" style={{ maxWidth: 720 }}>
      <div className="page-head inline">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-sub tnum">{items === null && !history.length ? 'Checking for payments' : summary}</p>
        </div>
      </div>

      <div className="frame">
        <div className="frame-bar pay-filters">
          <div className="field-wrap search">
            <Search size={18} className="field-prefix" style={{ left: 16 }} />
            <input className="field" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Search" aria-label="Search activity" />
            {q && <button className="field-end orb sm" style={{ width: 32, height: 32 }} onClick={() => setQ('')} aria-label="Clear search"><X size={16} /></button>}
          </div>
          <div className="chip-row" role="tablist" aria-label="Filter">
            {FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} className={`chip${filter === f.id ? ' on' : ''}`} onClick={() => { setFilter(f.id); setPage(0) }}>
                {f.label}<span className="chip-count tnum">{count(f.id)}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="panel ap-inline-err">
            <span className="row-main">Couldn’t check for payments right now.</span>
            <button className="btn btn-secondary sm" onClick={poll}>Retry</button>
          </div>
        )}

        {!history.length && (items === null || items.length > 0) ? (
          !error && <div className="panel">{[0, 1, 2].map((i) => <div key={i} className="ap-skel ap-skel-row" />)}</div>
        ) : !history.length ? (
          <div className="panel center" style={{ padding: 40 }}>
            <div className="soft" style={{ fontSize: 17 }}>No payments yet</div>
            <p className="muted" style={{ margin: '4px 0 16px' }}>Share your link and payments show up here.</p>
            <button className="btn btn-secondary md" onClick={() => go('/link')}>Share your link</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="panel center" style={{ padding: 40 }}>
            <div className="soft" style={{ fontSize: 17 }}>Nothing matches</div>
            <p className="muted" style={{ margin: '4px 0 16px' }}>Try another filter or search.</p>
            <button className="btn btn-secondary md" onClick={() => { setFilter('all'); setQ('') }}>Clear filters</button>
          </div>
        ) : (
          <div className="panel" style={{ padding: '6px 24px 10px' }}>
            {groups.map((g) => (
              <div key={g.key} className="day-group">
                <div className="day-head"><span>{dayLabel(g.key)}</span></div>
                <div className="rows">
                  {g.items.map((e) => <PaymentRow key={e.kind + e.id} e={e} onOpen={setOpen} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {pages > 1 && (
          <nav className="pager" aria-label="Pages">
            <span className="pager-info tnum">{page * PAGE + 1} to {Math.min(filtered.length, page * PAGE + PAGE)} of {filtered.length}</span>
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

      {open && <PaymentModal e={open} onClose={() => setOpen(null)} />}
    </main>
  )
}
