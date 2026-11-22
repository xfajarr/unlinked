import { useEffect, useRef, useState } from 'react'
import { CameraOff } from 'lucide-react'
import { Modal } from '../ui'
import { go } from '../App'
import { APP_HOST, CASHADDR_PREFIX } from '../lib/config'

function handleFrom(t: string): string | null {
  if (/^@[a-z0-9_]{3,20}$/i.test(t)) return t.slice(1)
  let u: URL
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`)
  } catch {
    return null
  }
  if (u.host !== APP_HOST && u.host !== location.host) return null
  return u.hash.match(/^#\/pay\/@?([a-z0-9_]{3,20})(?:[?/]|$)/i)?.[1] ?? u.pathname.match(/^\/@?([a-z0-9_]{3,20})\/?$/i)?.[1] ?? null
}

export function routeFromScan(raw: string): string | null {
  const t = raw.trim()
  const addr = t.match(new RegExp(`^(?:${CASHADDR_PREFIX}:)?([qpzr][02-9ac-hj-np-z]{41})(?:\\?.*)?$`, 'i'))?.[1]
  if (addr) return `/withdraw?to=${encodeURIComponent(`${CASHADDR_PREFIX}:${addr.toLowerCase()}`)}`
  const handle = handleFrom(t)
  if (handle) return `/send?to=${encodeURIComponent('@' + handle.toLowerCase())}`
  return null
}

type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }

export default function Scanner({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'scanning' | 'unsupported' | 'denied'>('starting')

  const finish = (text: string) => {
    const route = routeFromScan(text)
    if (!route) return false
    onClose()
    go(route)
    return true
  }

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector
    if (!Detector || !navigator.mediaDevices?.getUserMedia) { setState('unsupported'); return }
    const detector = new Detector({ formats: ['qr_code'] })
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return }
        stream = s
        const v = video.current!
        v.srcObject = s
        await v.play()
        setState('scanning')
        const tick = async () => {
          if (stopped) return
          try {
            const codes = await detector.detect(v)
            if (codes[0] && finish(codes[0].rawValue)) return
          } catch { /* frame not ready */ }
          raf = requestAnimationFrame(tick)
        }
        tick()
      })
      .catch(() => setState('denied'))
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Modal title="Scan QR" onClose={onClose}>
      <div className="scan-view">
        {state === 'starting' || state === 'scanning' ? (
          <>
            <video ref={video} playsInline muted />
            <div className="scan-frame" aria-hidden><i /><i /><i /><i /></div>
            <span className="scan-hint">{state === 'starting' ? 'Opening camera…' : 'Point at an Unlinked link or BCH address'}</span>
          </>
        ) : (
          <div className="scan-empty">
            <CameraOff size={26} />
            <div style={{ fontSize: 16, color: 'var(--ink-12)' }}>{state === 'denied' ? 'Camera access is off' : 'Scanning isn’t supported here'}</div>
            <div className="muted" style={{ fontSize: 14 }}>{state === 'denied' ? 'Allow camera access in your browser settings.' : 'Try opening Unlinked in Chrome.'}</div>
          </div>
        )}
      </div>
    </Modal>
  )
}
