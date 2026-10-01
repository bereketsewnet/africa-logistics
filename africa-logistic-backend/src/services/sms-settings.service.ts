/**
 * SMS Settings Service (src/services/sms-settings.service.ts)
 *
 * Credentials for SMS Ethiopia, the provider that replaced Twilio. Stored in a
 * single row and encrypted at rest with the same AES-256-GCM scheme the Twilio
 * settings used — that part was provider-agnostic and worked well.
 *
 * Note the provider's API key is scoped to ONE campaign: it sends only through
 * that campaign's sender ID and draws down that campaign's SMS balance. There
 * is no account-wide key, so swapping campaigns means swapping the key here.
 */

import crypto from 'crypto'
import type { Pool } from 'mysql2/promise'

export const SMS_DEFAULT_BASE_URL = 'https://smsethiopia.com/api'

export interface SmsCredentials {
  apiKey: string
  senderId: string | null
  baseUrl: string
}

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
  if (!value.startsWith('v1:')) return value // tolerates a value pasted in plaintext once
  const [, iv, tag, encrypted] = value.split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8')
}

/** Credentials for sending, or null when SMS is not configured or switched off. */
export async function getSmsCredentials(db: Pool): Promise<SmsCredentials | null> {
  const [rows] = await db.query<any[]>(
    'SELECT api_key, sender_id, base_url, is_enabled FROM sms_settings WHERE id = 1'
  )
  const row = rows[0]
  if (!row) return null
  if (Number(row.is_enabled) !== 1) return null

  const apiKey = row.api_key ? decrypt(row.api_key) : process.env.SMS_API_KEY
  if (!apiKey) return null

  return {
    apiKey,
    senderId: row.sender_id ?? null,
    baseUrl: (row.base_url || process.env.SMS_BASE_URL || SMS_DEFAULT_BASE_URL).replace(/\/+$/, ''),
  }
}

/** Masked view for the admin screen. The API key is never returned. */
export async function getSmsSettingsStatus(db: Pool) {
  const [rows] = await db.query<any[]>(
    'SELECT api_key, sender_id, base_url, is_enabled, updated_at FROM sms_settings WHERE id = 1'
  )
  const row = rows[0] ?? {}
  const configured = (await getSmsCredentials(db)) !== null

  return {
    api_key: row.api_key ? '••••••••' : '',
    api_key_set: Boolean(row.api_key),
    sender_id: row.sender_id ?? '',
    base_url: row.base_url || SMS_DEFAULT_BASE_URL,
    is_enabled: Number(row.is_enabled) === 1,
    configured,
    updated_at: row.updated_at ?? null,
  }
}

export interface SmsSettingsUpdate {
  api_key?: string
  sender_id?: string
  base_url?: string
  is_enabled?: boolean
}

export async function updateSmsSettings(db: Pool, body: SmsSettingsUpdate, userId: string) {
  const fields: string[] = []
  const values: unknown[] = []

  // A value starting with the mask is the unchanged placeholder being posted
  // back by the form, so it must not overwrite the real key.
  if (body.api_key !== undefined && !body.api_key.startsWith('••')) {
    fields.push('api_key = ?')
    values.push(body.api_key.trim() ? encrypt(body.api_key.trim()) : null)
  }
  if (body.sender_id !== undefined) {
    fields.push('sender_id = ?')
    values.push(body.sender_id.trim() || null)
  }
  if (body.base_url !== undefined) {
    fields.push('base_url = ?')
    values.push(body.base_url.trim().replace(/\/+$/, '') || SMS_DEFAULT_BASE_URL)
  }
  if (body.is_enabled !== undefined) {
    fields.push('is_enabled = ?')
    values.push(body.is_enabled ? 1 : 0)
  }

  if (fields.length === 0) throw new Error('Enter at least one SMS setting to save.')

  fields.push('updated_by = ?')
  values.push(userId)
  await db.query(`UPDATE sms_settings SET ${fields.join(', ')} WHERE id = 1`, values)
}
