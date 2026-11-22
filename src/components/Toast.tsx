import { createContext, useCallback, useContext, useState } from 'react'

type Toast = { id: number; text: string; error?: boolean }
const Ctx = createContext<(text: string, opts?: { error?: boolean }) => void>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const show = useCallback((text: string, opts?: { error?: boolean }) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x.slice(-2), { id, text, error: opts?.error }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 2600)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast${t.error ? ' error' : ''}`}>{t.text}</div>)}
      </div>
    </Ctx.Provider>
  )
}
