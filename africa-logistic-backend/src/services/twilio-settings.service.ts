import crypto from 'crypto'
import type { Pool } from 'mysql2/promise'

type TwilioCredentials = { accountSid: string; authToken: string; from: string }

const encryptionKey = () => {
  const material = process.env.CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET
  if (!material) throw new Error('A configuration encryption key is required.')
  return crypto.createHash('sha256').update(material).digest()
}
const encrypt = (value: string) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`
}
const decrypt = (value: string) => {
  if (!value.startsWith('v1:')) return value // supports one-time migration from old plaintext values
  const [, iv, tag, encrypted] = value.split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8')
}

export async function getTwilioCredentials(db: Pool): Promise<TwilioCredentials | null> {
  const [rows] = await db.query<any[]>('SELECT account_sid, auth_token, phone_number FROM twilio_settings WHERE id = 1 LIMIT 1')
  const row = rows[0] ?? {}
  const accountSid = row.account_sid ? decrypt(String(row.account_sid)) : process.env.TWILIO_ACCOUNT_SID
  const authToken = row.auth_token ? decrypt(String(row.auth_token)) : process.env.TWILIO_AUTH_TOKEN
  const from = row.phone_number || process.env.TWILIO_PHONE_NUMBER
  if (!accountSid || !authToken || !from || String(accountSid).startsWith('ACxxxxx')) return null
  return { accountSid: String(accountSid), authToken: String(authToken), from: String(from) }
}

export async function getTwilioSettingsStatus(db: Pool) {
  const [rows] = await db.query<any[]>('SELECT account_sid, auth_token, phone_number, updated_at FROM twilio_settings WHERE id = 1 LIMIT 1')
  const row = rows[0] ?? {}
  const credentials = await getTwilioCredentials(db)
  return {
    account_sid: row.account_sid ? `••••••••${decrypt(String(row.account_sid)).slice(-4)}` : null,
    phone_number: row.phone_number ?? process.env.TWILIO_PHONE_NUMBER ?? null,
    account_sid_set: Boolean(row.account_sid || process.env.TWILIO_ACCOUNT_SID),
    auth_token_set: Boolean(row.auth_token || process.env.TWILIO_AUTH_TOKEN),
    phone_number_set: Boolean(row.phone_number || process.env.TWILIO_PHONE_NUMBER),
    configured: Boolean(credentials),
    updated_at: row.updated_at ?? null,
  }
}

export async function updateTwilioSettings(db: Pool, body: { account_sid?: string; auth_token?: string; phone_number?: string }, userId: string) {
  const sets: string[] = []; const values: unknown[] = []
  if (body.account_sid && !body.account_sid.startsWith('••')) { sets.push('account_sid = ?'); values.push(encrypt(body.account_sid.trim())) }
  if (body.auth_token && !body.auth_token.startsWith('••')) { sets.push('auth_token = ?'); values.push(encrypt(body.auth_token.trim())) }
  if (body.phone_number !== undefined) { sets.push('phone_number = ?'); values.push(body.phone_number.trim() || null) }
  if (!sets.length) throw new Error('Enter at least one Twilio setting to save.')
  sets.push('updated_by = ?'); values.push(userId)
  await db.query(`UPDATE twilio_settings SET ${sets.join(', ')} WHERE id = 1`, values)
}
