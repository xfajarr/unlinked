import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

/** QR as SVG with softly rounded modules, dark on a white plate (scanners need the contrast). */
export function QR({ value, label }: { value: string; label: string }) {
  const { n, cells } = useMemo(() => {
    const q = qrcode(0, 'M')
    q.addData(value)
    q.make()
    const n = q.getModuleCount()
    const cells: [number, number][] = []
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) cells.push([x, y])
    return { n, cells }
  }, [value])
  return (
    <div className="qr">
      <svg viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label} shapeRendering="geometricPrecision">
        {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} rx={0.28} fill="#0a0f14" />)}
      </svg>
    </div>
  )
}
