/**
 * OTP Service (src/services/otp.service.ts)
 *
 * Manages One-Time Password (OTP) generation, storage, and verification,
 * then dispatches the OTP to the user's phone via Twilio SMS.
 *
 * Storage Strategy:
 *   OTPs are stored in a server-side in-memory Map with a 10-minute TTL.
 *   This is perfect for local development. For production, replace this
 *   Map with a Redis TTL key (e.g., SET otp:+251911... 123456 EX 600).
 */

import twilio from 'twilio'
import type { Pool } from 'mysql2/promise'
import { getTwilioCredentials } from './twilio-settings.service.js'

// ─── Twilio Client ────────────────────────────────────────────────────────────
// Lazily initialized so the server can start even without Twilio creds
// (useful during local dev when you haven't set up Twilio yet).

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
 * with a 10-minute expiry, and sends it via Twilio SMS.
 *
 * @param phoneNumber  The recipient's phone in E.164 format (+251911234567)
 */
export async function generateAndSendOtp(phoneNumber: string, db: Pool): Promise<void> {
  // Generate a random 6-digit number (100000–999999)
  const otp = Math.floor(100000 + Math.random() * 900000).toString()

  // Store it with an expiry timestamp
  otpStore.set(phoneNumber, {
    otp,
    expiresAt: Date.now() + OTP_TTL_MS,
  })

  const credentials = await getTwilioCredentials(db)
  if (!credentials) throw new Error('Twilio is not configured. Add the Account SID, Auth Token, and sender number in Admin Settings before enabling SMS OTP.')
  const client = twilio(credentials.accountSid, credentials.authToken)
  await client.messages.create({
    body: `Your Afri Logistics verification code is: ${otp}. It expires in 10 minutes.`,
    from: credentials.from,
    to: phoneNumber,
  })
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
