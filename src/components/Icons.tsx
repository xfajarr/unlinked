// Small inline icon set (stroke icons, 1.8px), so we don't pull a dependency for a dozen glyphs.
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }
const I = ({ size = 18, children, ...p }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {children}
  </svg>
)
export const CopyIcon = (p: P) => <I {...p}><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" /></I>
export const ShareIcon = (p: P) => <I {...p}><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></I>
export const CheckIcon = (p: P) => <I {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></I>
export const ArrowRight = (p: P) => <I {...p}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></I>
export const ArrowUp = (p: P) => <I {...p}><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></I>
export const ArrowDown = (p: P) => <I {...p}><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></I>
export const ChevronLeft = (p: P) => <I {...p}><path d="m15 5-7 7 7 7" /></I>
export const SunIcon = (p: P) => <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>
export const MoonIcon = (p: P) => <I {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></I>
export const ShieldIcon = (p: P) => <I {...p}><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></I>
export const EyeOffIcon = (p: P) => <I {...p}><path d="M3 3l18 18" /><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 5 9 7a10.6 10.6 0 0 1-2.4 3.3M6.6 6.6C4.3 8 3 10.3 3 12c0 2 4 7 9 7 1.6 0 3.1-.5 4.4-1.2" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></I>
export const QrIcon = (p: P) => <I {...p}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></I>
export const WalletIcon = (p: P) => <I {...p}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v1" /><rect x="4" y="8" width="16" height="11" rx="2.5" /><circle cx="16" cy="13.5" r="1.2" /></I>
export const GlobeIcon = (p: P) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" /></I>
export const CloseIcon = (p: P) => <I {...p}><path d="M6 6l12 12M18 6 6 18" /></I>
export const LockIcon = (p: P) => <I {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></I>
export const SearchIcon = (p: P) => <I {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></I>
