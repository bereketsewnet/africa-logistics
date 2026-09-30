/**
 * Upload URL helpers (src/lib/uploadUrl.ts)
 *
 * The API stores file paths root-relative (`/uploads/...`) and Caddy serves
 * them from a shared volume, so the client has to prefix the API origin. This
 * had been copied into three files; this is the one copy they share.
 */

const API_UPLOAD_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '')
  .replace(/\/api\/?$/, '')

/** Turn a stored upload path into a URL the browser can load. */
export function absoluteUploadUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API_UPLOAD_BASE}${url.startsWith('/') ? '' : '/'}${url}`
}

/** PDFs get an icon rather than a broken <img>. Ignores any query string. */
export function isPdfDocument(url: string | null | undefined): boolean {
  if (!url) return false
  return url.toLowerCase().split('?')[0].endsWith('.pdf')
}
