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
  let path = u.pathname
  try {
    path = decodeURIComponent(path)
  } catch { /* keep it encoded */ }
  // a bare /name is an app route, not a pay link
  return u.hash.match(/^#\/pay\/@?([a-z0-9_]{3,20})(?:[?/]|$)/i)?.[1] ?? path.match(/^\/(?:@|pay\/@?)([a-z0-9_]{3,20})(?:\/[a-z]*)?\/?$/i)?.[1] ?? null
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
    const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector
    if (!navigator.mediaDevices?.getUserMedia) { setState('unsupported'); return }
    // iOS browsers (WebKit) have no BarcodeDetector, so decode frames with jsQR there
    const makeDetect = async (): Promise<(v: HTMLVideoElement) => Promise<string | null>> => {
      if (Native) {
        const d = new Native({ formats: ['qr_code'] })
        return async (v) => (await d.detect(v))[0]?.rawValue ?? null
      }
      const { default: jsQR } = await import('jsqr')
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      return async (v) => {
        if (!v.videoWidth) return null
        const w = Math.min(640, v.videoWidth), h = Math.round((v.videoHeight / v.videoWidth) * w)
        canvas.width = w
        canvas.height = h
        ctx.drawImage(v, 0, 0, w, h)
        return jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null
      }
    }
    Promise.all([makeDetect(), navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })])
      .then(async ([detect, s]) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return }
        stream = s
        const v = video.current!
        v.srcObject = s
        await v.play()
        setState('scanning')
        let last = 0
        const tick = async (t: number) => {
          if (stopped) return
          if (t - last > 120) {
            last = t
            try {
              const text = await detect(v)
              if (text && finish(text)) return
            } catch { /* frame not ready */ }
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      })
      .catch((e: unknown) => setState(e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'unsupported'))
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
            <div className="muted" style={{ fontSize: 14 }}>{state === 'denied' ? 'Allow camera access in your browser settings.' : 'Your browser can’t open the camera here. Paste the link or address instead.'}</div>
          </div>
        )}
      </div>
    </Modal>
  )
}
