const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_REGEX = /(?<!\w)(?:\+?\d[\d\s()\-]{6,}\d)(?!\w)/g

/**
 * Identifier fields that must never be scrubbed.
 *
 * `sanitizeChatContent` exists to strip phone numbers out of free text, but the
 * phone pattern also matches perfectly ordinary identifiers — a plate such as
 * `3-123456` and an order reference such as `AL-2026-00001` both come back as
 * `[redacted-phone]` for any staff member who is not a super admin. These keys
 * hold identifiers rather than prose, so they are passed through untouched.
 * Key-level nulling of `*phone*` / `*email*` still applies to everything else.
 */
const VERBATIM_KEYS = new Set([
  'plate_number',
  'main_vehicle_plate',
  'owner_vehicle_plate',
  'company_vehicle_plate',
  'assigned_plate',
  'chassis_number',
  'engine_number',
  'registration_number',
  'tin_number',
  'tin',
  'shipper_tin',
  'vat_number',
  'internal_code',
  'insurance_policy_number',
  'gps_device_id',
  'reference_code',
  'border_crossing_ref',
  'customs_declaration_ref',
  'hs_code',
  'license_number',
])

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
    // An identifier column wins over the substring rule, so a field such as
    // `company_vehicle_plate` is kept even though other rules might catch it.
    if (VERBATIM_KEYS.has(key.toLowerCase())) {
      next[key] = raw
      continue
    }

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
