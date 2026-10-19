/**
 * Hand the browser a file to save (src/lib/downloadFile.ts)
 *
 * The whole reason this is a shared helper is one piece of timing that is easy
 * to get wrong and that only breaks on phones.
 *
 * A download is triggered by clicking an <a href="blob:…" download>. The
 * tempting cleanup is to revoke the blob URL on the next line, and on a desktop
 * browser that works: the click consumes the bytes synchronously, so by the time
 * revoke runs the browser already has them.
 *
 * On mobile it does not. The click only hands the URL to the platform download
 * manager, which fetches it a moment later on its own schedule. Revoking in the
 * same tick destroys the URL before that fetch happens, and the phone reports
 * the file "couldn't be loaded" — while the same build works perfectly on a
 * laptop, which is what makes it so confusing to chase.
 *
 * So the URL and its anchor are kept alive and cleaned up on a timer instead.
 */

/**
 * Long enough for any download manager to have fetched the URL, including a
 * phone that is busy or on a slow connection. The cost of waiting is one blob
 * held in memory; every file this app serves is well under a megabyte, so that
 * is cheaper than a download that silently fails.
 */
const REVOKE_AFTER_MS = 60_000

export function downloadFile(data: Blob | BlobPart, filename: string, type?: string): void {
  // axios with `responseType: 'blob'` already hands back a Blob. Re-wrapping one
  // is harmless, but passing it straight through keeps the type it arrived with.
  const blob = data instanceof Blob
    ? data
    : new Blob([data], type ? { type } : undefined)

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  // Some mobile browsers ignore a click on an element that is not in the
  // document, so it goes in — hidden — rather than being clicked detached.
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()

  window.setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, REVOKE_AFTER_MS)
}
