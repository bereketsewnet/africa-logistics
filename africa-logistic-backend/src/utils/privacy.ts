const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_REGEX = /(?<!\w)(?:\+?\d[\d\s()\-]{6,}\d)(?!\w)/g

export function sanitizeChatContent(input: string): string {
  if (!input) return input
  return input
    .replace(EMAIL_REGEX, '[redacted-email]')
    .replace(PHONE_REGEX, '[redacted-phone]')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function shouldRedactKey(key: string): boolean {
  const k = key.toLowerCase()
  return k.includes('phone') || k.includes('email')
}

export function redactContactFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactContactFields(item)) as T
  }

  if (!isPlainObject(value)) {
    return value
  }

  const next: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (shouldRedactKey(key)) {
      next[key] = null
      continue
    }

    if (typeof raw === 'string') {
      next[key] = sanitizeChatContent(raw)
      continue
    }

    next[key] = redactContactFields(raw)
  }

  return next as T
}
