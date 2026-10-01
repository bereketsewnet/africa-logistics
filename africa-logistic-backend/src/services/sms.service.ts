/**
 * SMS Service (src/services/sms.service.ts)
 *
 * The single place the platform sends SMS. Provider: SMS Ethiopia (API v2).
 *
 * There used to be two SMS paths — one using encrypted database credentials and
 * one reading process.env directly, silently logging to the console when unset
 * and swallowing every error. Rejection notices went through the second one, so
 * they were almost certainly never delivered. Everything now goes through here.
 *
 * Provider facts that drive this implementation:
 *  - `msisdn` must be `2519XXXXXXXX` — 12 digits, NO leading `+`. The database
 *    stores E.164 (`+2519…`), so normalising is mandatory, not cosmetic.
 *  - API v2 is used, not v1: v1 always returns `id: 0`, so a message could never
 *    be correlated or its delivery checked.
 *  - Business failures arrive as HTTP 400 with an `Error Code :: NNNNN` suffix.
 *  - One Amharic character or emoji switches the whole message to Unicode, which
 *    drops capacity from 160 to 70 characters and multiplies the cost.
 */

import type { Pool } from 'mysql2/promise'
import { randomUUID } from 'crypto'
import { getSmsCredentials } from './sms-settings.service.js'

export type SmsPurpose = 'OTP' | 'DRIVER_WELCOME' | 'REJECTION' | 'TEST' | 'OTHER'

export interface SmsResult {
  ok: boolean
  /** Provider message id (ULID) — present on success, used for delivery lookups. */
  id?: string
  segments?: number
  status?: string
  /** Operator-readable reason. Safe to surface in the admin UI. */
  error?: string
  /** Provider business code (10000, 10002, 10005, 10006, 10007) when there was one. */
  errorCode?: string
  /** Whether trying again later could succeed. */
  retryable?: boolean
}

const REQUEST_TIMEOUT_MS = 8_000

/**
 * Provider business codes. Anything not listed is treated as permanent so a
 * doomed message is never retried in a loop.
 */
const ERROR_MEANINGS: Record<string, { message: string; retryable: boolean }> = {
  '10000': { message: 'The phone number is not a valid Ethiopian mobile number.', retryable: false },
  '10002': { message: 'The SMS campaign is not active. Check the account at smsethiopia.com.', retryable: false },
  '10005': { message: 'The SMS balance is exhausted. Top up the package to keep sending.', retryable: false },
  '10006': { message: 'The sender ID has not been approved by Ethio Telecom yet.', retryable: true },
  '10007': { message: 'This number is not whitelisted on the free starter campaign.', retryable: false },
}

/**
 * Normalise any local spelling to the provider's `2519XXXXXXXX`.
 * Returns null when the input cannot be an Ethiopian mobile number, so a
 * malformed value fails here rather than being charged for and rejected.
 */
export function normaliseMsisdn(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')

  // +251 9xx xxx xxx / 251...
  if (digits.length === 12 && digits.startsWith('251')) return digits
  // 09xx xxx xxx  → drop the trunk 0
  if (digits.length === 10 && digits.startsWith('0')) return `251${digits.slice(1)}`
  // 9xx xxx xxx
  if (digits.length === 9) return `251${digits}`

  return null
}

/** True when the text forces Unicode encoding (Ethiopic, emoji, any non-GSM char). */
export function isUnicodeMessage(text: string): boolean {
  // GSM-7 basic + extension set. Anything outside it forces UCS-2.
  const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    + "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
    + "^{}\\[~]|€"
  for (const ch of text) if (!GSM.includes(ch)) return true
  return false
}

/**
 * Billable segments. The provider bills per segment per recipient, so this is
 * what a message actually costs.
 */
export function estimateSegments(text: string): { segments: number; unicode: boolean } {
  const unicode = isUnicodeMessage(text)
  const single = unicode ? 70 : 160
  const multi = unicode ? 66 : 153   // provider docs state 66; budget for the smaller figure
  const len = [...text].length
  if (len === 0) return { segments: 0, unicode }
  if (len <= single) return { segments: 1, unicode }
  return { segments: Math.ceil(len / multi), unicode }
}

/** Pull `Error Code :: 10006` out of the provider's message string. */
function extractErrorCode(payload: any): string | undefined {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {})
  return text.match(/Error Code\s*::\s*(\d+)/)?.[1]
}

async function recordMessage(db: Pool, row: {
  providerId: string | null
  recipient: string
  purpose: SmsPurpose
  segments: number
  status: string
  errorCode?: string | null
  errorMessage?: string | null
}) {
  try {
    await db.query(
      `INSERT INTO sms_messages
         (id, provider_message_id, recipient, purpose, segments, status, error_code, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), row.providerId, row.recipient, row.purpose, row.segments,
       row.status, row.errorCode ?? null, row.errorMessage ?? null]
    )
  } catch {
    // Logging a message must never break the thing that sent it.
  }
}

/**
 * Send one SMS.
 *
 * Never throws. A failed text must not roll back the account, order or approval
 * that triggered it — the caller decides what to do with `ok: false`.
 */
export async function sendSms(
  db: Pool,
  to: string,
  text: string,
  purpose: SmsPurpose = 'OTHER'
): Promise<SmsResult> {
  const msisdn = normaliseMsisdn(to)
  if (!msisdn) {
    const error = `"${to}" is not a valid Ethiopian mobile number.`
    await recordMessage(db, { providerId: null, recipient: String(to ?? ''), purpose, segments: 0, status: 'INVALID_NUMBER', errorMessage: error })
    return { ok: false, error, retryable: false }
  }

  const credentials = await getSmsCredentials(db)
  if (!credentials) {
    const error = 'SMS is not configured. Add the SMS Ethiopia API key in Admin → Settings → SMS.'
    await recordMessage(db, { providerId: null, recipient: msisdn, purpose, segments: 0, status: 'NOT_CONFIGURED', errorMessage: error })
    return { ok: false, error, retryable: false }
  }

  const { segments } = estimateSegments(text)
  const url = `${credentials.baseUrl}/v2/sms/send`

  // One retry only, for the two failures that are genuinely transient.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1200))

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', KEY: credentials.apiKey },
        body: JSON.stringify({ msisdn, text }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      const raw = await response.text()
      let payload: any
      try { payload = raw ? JSON.parse(raw) : {} } catch { payload = raw }

      if (response.ok && payload?.sent) {
        await recordMessage(db, {
          providerId: payload.id ? String(payload.id) : null,
          recipient: msisdn, purpose,
          segments: Number(payload.segments ?? segments),
          status: String(payload.status ?? 'ACCEPTED'),
        })
        return {
          ok: true,
          id: payload.id ? String(payload.id) : undefined,
          segments: Number(payload.segments ?? segments),
          status: String(payload.status ?? 'ACCEPTED'),
        }
      }

      const code = extractErrorCode(payload)
      const known = code ? ERROR_MEANINGS[code] : undefined
      let error = known?.message
        ?? payload?.error_message
        ?? (typeof payload === 'object' ? Object.values(payload ?? {})[0] : null)
        ?? `SMS provider returned HTTP ${response.status}.`
      let retryable = known?.retryable ?? false

      if (response.status === 401) {
        error = 'The SMS API key was rejected. Check it in Admin → Settings → SMS.'
        retryable = false
      } else if (response.status === 429) {
        error = 'The SMS provider is rate limiting. Try again shortly.'
        retryable = true
      } else if (response.status >= 500) {
        error = 'The SMS provider is temporarily unavailable.'
        retryable = true
      }

      if (retryable && attempt === 0) continue

      await recordMessage(db, {
        providerId: null, recipient: msisdn, purpose, segments: 0,
        status: 'FAILED', errorCode: code ?? String(response.status), errorMessage: String(error),
      })
      return { ok: false, error: String(error), errorCode: code, retryable }
    } catch (err: any) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      if (attempt === 0) continue
      const error = timedOut
        ? 'The SMS provider did not respond in time.'
        : `Could not reach the SMS provider: ${err?.message ?? 'network error'}`
      await recordMessage(db, {
        providerId: null, recipient: msisdn, purpose, segments: 0,
        status: 'FAILED', errorMessage: error,
      })
      return { ok: false, error, retryable: true }
    }
  }

  return { ok: false, error: 'The SMS could not be sent.', retryable: true }
}

/** Delivery status for a previously sent message. ACCEPTED → SENT → DELIVERED. */
export async function getSmsStatus(db: Pool, providerMessageId: string): Promise<SmsResult> {
  const credentials = await getSmsCredentials(db)
  if (!credentials) return { ok: false, error: 'SMS is not configured.', retryable: false }

  try {
    const response = await fetch(`${credentials.baseUrl}/v2/sms/${encodeURIComponent(providerMessageId)}`, {
      headers: { KEY: credentials.apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { ok: false, error: `Status lookup returned HTTP ${response.status}.`, retryable: response.status >= 500 }
    }
    const payload: any = await response.json()
    return { ok: true, id: String(payload.id ?? providerMessageId), status: String(payload.status ?? 'UNKNOWN'), segments: payload.segments }
  } catch (err: any) {
    return { ok: false, error: `Could not reach the SMS provider: ${err?.message ?? 'network error'}`, retryable: true }
  }
}
