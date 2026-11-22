import { useCallback, useEffect, useRef } from 'react'

/**
 * Each `begin()` returns an `alive()` check that turns false once another flow starts, `cancel()` runs,
 * or the component unmounts. Async flows start from handlers (not effects), so StrictMode never doubles them.
 */
export function useFlow() {
  const id = useRef(0)
  useEffect(() => () => void id.current++, [])
  const begin = useCallback(() => {
    const mine = ++id.current
    return () => mine === id.current
  }, [])
  const cancel = useCallback(() => void id.current++, [])
  return { begin, cancel }
}
