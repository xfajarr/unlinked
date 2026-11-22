// Keeps the app unlocked across reloads: the unlocked secret is encrypted with a random, non-extractable AES-GCM
// key and both go to IndexedDB, so nothing readable ever lands in localStorage. Any failure means locking on reload.
const AUTOLOCK = 'unlinked:autolock'
const LAST_ACTIVE = 'unlinked:lastActive'
const DB = 'unlinked-session', STORE = 's', ID = 'current'

export const AUTOLOCK_OPTIONS = [
  { min: 0, label: 'Every refresh' },
  { min: 5, label: '5 minutes' },
  { min: 10, label: '10 minutes' },
  { min: 30, label: '30 minutes' },
  { min: 60, label: '1 hour' },
  { min: 240, label: '4 hours' },
] as const

export function getAutoLock(): number {
  try {
    const v = Number(localStorage.getItem(AUTOLOCK) ?? NaN)
    return Number.isFinite(v) && v >= 0 ? v : 10
  } catch {
    return 10
  }
}
export function saveAutoLock(min: number) {
  try {
    localStorage.setItem(AUTOLOCK, String(min))
  } catch {
    /* storage blocked: the default applies */
  }
}

function lastActive(): number {
  try {
    return Number(localStorage.getItem(LAST_ACTIVE)) || 0
  } catch {
    return 0
  }
}
export function touch() {
  try {
    localStorage.setItem(LAST_ACTIVE, String(Date.now()))
  } catch {
    /* storage blocked */
  }
}
export function clearActivity() {
  try {
    localStorage.removeItem(LAST_ACTIVE)
  } catch {
    /* storage blocked */
  }
}

/** True when the auto-lock window hasn't run out since the last activity. */
export function stillFresh(): boolean {
  const min = getAutoLock()
  return min > 0 && Date.now() - lastActive() < min * 60_000
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((res, rej) => {
      const t = db.transaction(STORE, mode)
      const req = fn(t.objectStore(STORE))
      t.oncomplete = () => res(req.result as T)
      t.onerror = t.onabort = () => rej(t.error)
    })
  } finally {
    db.close()
  }
}

type Entry = { key: CryptoKey; iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer }

// Serialized so a Lock right after an unlock can't be overtaken by the slower save.
let queue: Promise<unknown> = Promise.resolve()
function run<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn)
  queue = p.catch(() => {})
  return p
}

export function clearSession(): Promise<void> {
  return run(async () => {
    try {
      await tx('readwrite', (s) => s.delete(ID))
    } catch {
      /* no IndexedDB: nothing was stored */
    }
  })
}

export function saveSession(secret: string): Promise<void> {
  return run(async () => {
    try {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(secret))
      await tx('readwrite', (s) => s.put({ key, iv, data } satisfies Entry, ID))
    } catch {
      try {
        await tx('readwrite', (s) => s.delete(ID))
      } catch {
        /* no IndexedDB */
      }
    }
  })
}

/** The stored secret, or null when there is none or it can't be read (the entry is then dropped). */
export function loadSession(): Promise<string | null> {
  return run(async () => {
    try {
      const e = await tx<Entry | undefined>('readonly', (s) => s.get(ID))
      if (!e) return null
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: e.iv }, e.key, e.data))
    } catch {
      try {
        await tx('readwrite', (s) => s.delete(ID))
      } catch {
        /* no IndexedDB */
      }
      return null
    }
  })
}

/** Records activity (at most every 15 s) and calls onIdle once the auto-lock window runs out. Returns a stop function. */
export function watchIdle(onIdle: () => void): () => void {
  let stopped = false, wrote = 0
  const expired = () => {
    const min = getAutoLock()
    return min > 0 && Date.now() - lastActive() >= min * 60_000
  }
  const check = () => {
    if (!stopped && expired()) onIdle()
  }
  const activity = () => {
    if (stopped || Date.now() - wrote < 15_000) return
    wrote = Date.now()
    touch()
  }
  const visibility = () => {
    check()
    wrote = 0
    activity()
  }
  window.addEventListener('pointerdown', activity, { passive: true })
  window.addEventListener('keydown', activity)
  document.addEventListener('visibilitychange', visibility)
  const timer = setInterval(check, 30_000)
  return () => {
    stopped = true
    window.removeEventListener('pointerdown', activity)
    window.removeEventListener('keydown', activity)
    document.removeEventListener('visibilitychange', visibility)
    clearInterval(timer)
  }
}
