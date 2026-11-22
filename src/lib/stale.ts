// A deploy replaces the hashed chunks, and the host answers an old chunk URL with index.html. A tab opened before the
// deploy then fails its next lazy import; reloading once picks up the new build (the pay flow and session survive it).
const STALE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|is not a valid JavaScript MIME type/i
const KEY = 'unlinked:staleReloadAt'

export function reloadOnStaleChunk(e: unknown): boolean {
  if (!STALE.test(String((e as { message?: string } | null)?.message ?? e))) return false
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 30_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return false
  }
  location.reload()
  return true
}
