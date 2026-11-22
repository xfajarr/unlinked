import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Pay links are paths (/@rina or /rina) but the app routes by hash; the host serves index.html for any path.
const pay = location.pathname.match(/^\/@?([A-Za-z0-9_]{3,20})\/?$/)
if (pay) history.replaceState(null, '', `/#/pay/${pay[1]!.toLowerCase()}${location.search}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
