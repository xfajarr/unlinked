import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Pay links are paths (/@ava or /ava) but the app routes by hash; the host serves index.html for any path.
const path = (() => { try { return decodeURIComponent(location.pathname) } catch { return location.pathname } })()
const pay = path.match(/^\/@?([A-Za-z0-9_]{3,20})\/?$/)
if (pay) history.replaceState(null, '', `/#/pay/${pay[1]!.toLowerCase()}${location.search}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
