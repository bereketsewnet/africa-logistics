import { lazy, type ComponentType } from 'react'

/**
 * `React.lazy` that survives a deployment.
 *
 * The app is code-split, so a page is fetched as a hashed chunk the first time
 * it is opened. When a new version is deployed, those filenames change and the
 * old ones are deleted. A browser tab that was already open is still running the
 * previous bundle, so the moment the user navigates somewhere new it asks for a
 * chunk that no longer exists, gets a 404, and — with no error boundary — shows
 * a blank screen.
 *
 * No cache header can prevent this: the stale code is already running in the
 * tab. The only cure is to notice the failed import and reload, which fetches
 * the current index.html and its matching chunks.
 *
 * Guarded against reload loops. If an import fails again within the cooldown,
 * the error is rethrown rather than reloading forever — a genuinely broken or
 * offline chunk must surface as an error, not an infinite refresh.
 */

const RELOAD_KEY = 'al:chunk-reload-at'
const RELOAD_COOLDOWN_MS = 10_000

/** sessionStorage throws in some privacy modes, so every access is guarded. */
function readLastReload(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
  } catch {
    return 0
  }
}

function markReload(): boolean {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    return true
  } catch {
    // Without somewhere to record the attempt we cannot detect a loop, so we
    // decline to reload and let the error surface instead.
    return false
  }
}

export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (err) {
      const since = Date.now() - readLastReload()
      if (since > RELOAD_COOLDOWN_MS && markReload()) {
        window.location.reload()
        // The reload takes over; never resolving stops React rendering an
        // error state during the fraction of a second before the page goes.
        return new Promise<{ default: T }>(() => {})
      }
      throw err
    }
  })
}
