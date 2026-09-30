/**
 * Upload helpers (src/utils/uploads.ts)
 *
 * The API takes uploads as base64 strings in the JSON body rather than
 * multipart, so every controller that accepts a file needs the same decode and
 * write. That helper had been copied into three files, each drifting slightly
 * in its fallback mime type; this is the single copy they all now use.
 *
 * Files land under `<backend cwd>/uploads/<subDir>/` and the returned path is
 * what goes in the database. Caddy serves `/uploads/*` read-only from the
 * shared Docker volume, so the URL is root-relative, never absolute.
 */

import fs from 'fs'
import path from 'path'

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export interface SaveFileOptions {
  /** Fallback mime when the payload carries no `data:` prefix. */
  defaultMime?: string
  /** Fallback extension when the mime is not one we map. */
  defaultExt?: string
  /** Reject anything larger, in bytes. Omit for no limit. */
  maxBytes?: number
  /** Only accept these mime types. Omit to accept any. */
  allowedMimes?: string[]
}

/**
 * Decode a base64 payload and write it under `uploads/<subDir>/`.
 * Returns the root-relative URL to store in the database.
 */
export function saveFile(
  base64Data: string,
  subDir: string,
  baseName: string,
  options: SaveFileOptions = {}
): string {
  const {
    defaultMime = 'image/jpeg',
    defaultExt = 'jpg',
    maxBytes,
    allowedMimes,
  } = options

  const match = base64Data.match(/^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/)
  const raw = match ? match[2] : base64Data
  const mime = match ? match[1] : defaultMime

  if (allowedMimes && !allowedMimes.includes(mime)) {
    throw new Error(`Unsupported file type: ${mime}`)
  }

  const ext = EXT_BY_MIME[mime] ?? defaultExt
  const bytes = Buffer.from(raw, 'base64')

  if (bytes.length === 0) {
    throw new Error('The uploaded file is empty.')
  }
  if (maxBytes && bytes.length > maxBytes) {
    throw new Error(`File is larger than ${Math.round(maxBytes / (1024 * 1024))}MB.`)
  }

  const dir = path.join(process.cwd(), 'uploads', subDir)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const filename = `${baseName}_${Date.now()}.${ext}`
  fs.writeFileSync(path.join(dir, filename), bytes)
  return `/uploads/${subDir}/${filename}`
}
