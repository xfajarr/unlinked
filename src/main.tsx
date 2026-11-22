import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Canonical URL before the first render: old links keep the route in the hash (/#/pay/ava), /pay/ava becomes /@ava,
// and the host redirects /@ava to /%40ava.
const decode = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }
const legacy = location.hash.startsWith('#/') ? location.hash.slice(1) : null
const [hashPath = '', hashQuery = ''] = legacy?.split('?') ?? []
const query = new URLSearchParams(location.search)
new URLSearchParams(hashQuery).forEach((v, k) => query.set(k, v))
const path = decode(legacy ? hashPath : location.pathname)
  .replace(/^\/pay\/@?/, '/@')
  .replace(/^\/@([^/]+)/, (_, h: string) => `/@${h.toLowerCase()}`)
const url = path + (query.size ? `?${query}` : '')
if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
