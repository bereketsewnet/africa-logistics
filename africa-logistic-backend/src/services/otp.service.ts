/**
 * OTP Service (src/services/otp.service.ts)
 *
 * Manages One-Time Password (OTP) generation, storage, and verification,
 * then dispatches the OTP to the user's phone through the SMS provider.
 *
 * Storage Strategy:
 *   OTPs are stored in a server-side in-memory Map with a 10-minute TTL.
 *   This is perfect for local development. For production, replace this
 *   Map with a Redis TTL key (e.g., SET otp:+251911... 123456 EX 600).
 */

import crypto from 'crypto'
import { sendSms } from './sms.service.js'
import type { Pool } from 'mysql2/promise'

// ─── SMS dispatch ─────────────────────────────────────────────────────────────
// Delivery goes through sms.service, which reads the provider credentials from
// the database. An unconfigured provider fails the send with a readable message
// rather than stopping the server from starting.

// ─── In-Memory OTP Store ──────────────────────────────────────────────────────
interface OtpRecord {
  otp: string  // The 6-digit code
  expiresAt: number  // Unix timestamp (ms) when this OTP expires
}

// Map key = phone number (e.g. "+251911234567")
const otpStore = new Map<string, OtpRecord>()

const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes

// ─── Public Functions ─────────────────────────────────────────────────────────

/**
 * Generates a cryptographically random 6-digit OTP, saves it in memory
 * with a 10-minute expiry, and sends it by SMS.
 *
 * @param phoneNumber  The recipient's phone in E.164 format (+251911234567)
 */
export async function generateAndSendOtp(phoneNumber: string, db: Pool): Promise<void> {
  // Six digits from a cryptographic source. `Math.random()` is predictable and
  // has no place generating a credential, even a short-lived one.
  const otp = String(crypto.randomInt(100000, 1000000))

  // Store it with an expiry timestamp
  otpStore.set(phoneNumber, {
    otp,
    expiresAt: Date.now() + OTP_TTL_MS,
  })

  const result = await sendSms(
    db,
    phoneNumber,
    `Your Afri Logistics verification code is: ${otp}. It expires in 10 minutes.`,
    'OTP'
  )

  if (!result.ok) {
    // Drop the code rather than leave one stored that the user never received.
    otpStore.delete(phoneNumber)
    throw new Error(result.error ?? 'The verification code could not be sent.')
  }
}

/**
 * Verifies the OTP submitted by the user.
 *
 * @returns true if valid and not expired, false otherwise.
 * On success, the OTP is deleted (one-time use).
 */
export function verifyOtp(phoneNumber: string, submittedOtp: string): boolean {
  const record = otpStore.get(phoneNumber)

  if (!record) return false                        // OTP never requested
  if (Date.now() > record.expiresAt) {             // OTP expired
    otpStore.delete(phoneNumber)
    return false
  }
  if (record.otp !== submittedOtp) return false    // Wrong code

  otpStore.delete(phoneNumber) // ✅ Consume the OTP — can't be reused
  return true
}
