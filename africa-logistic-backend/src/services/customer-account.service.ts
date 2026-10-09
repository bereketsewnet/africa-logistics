/**
 * Customer Account Service (src/services/customer-account.service.ts)
 *
 * Creating a customer-facing login (Car Owner, Driver) from the admin portal is
 * the same job every time: validate, check the phone is free, hash, insert.
 * Keeping it here means the company-creation flow and the driver-creation flow
 * cannot drift apart from the car-owner one, and a transaction can reuse it by
 * passing its own connection.
 *
 * Staff accounts deliberately do NOT go through here — they are created by
 * adminCreateStaffHandler, which enforces its own role rules.
 */

import { Pool, PoolConnection } from 'mysql2/promise'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcrypt'

/** Roles this service is allowed to create. Never accept a role from input. */
export const CUSTOMER_ROLE_IDS = {
  CAR_OWNER: 6,
  DRIVER: 3,
} as const

export type CustomerRoleId = (typeof CUSTOMER_ROLE_IDS)[keyof typeof CUSTOMER_ROLE_IDS]

export interface CreateCustomerAccountInput {
  first_name: string
  last_name?: string
  phone_number: string
  password: string
  email?: string
}

export interface CustomerAccountRefusal {
  ok: false
  status: number
  message: string
}

export interface CustomerAccountSuccess {
  ok: true
  id: string
  firstName: string
  /** Canonical E.164 value written to users.phone_number. */
  phoneNumber: string
}

const MIN_PASSWORD_LENGTH = 8

/**
 * Convert the Ethiopian spellings accepted by the UI to the one value used for
 * login and uniqueness checks. Keeping this at the account-creation boundary
 * also protects older clients that still submit 09xxxxxxxx.
 */
export function normaliseCustomerPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = String(raw).trim().replace(/[\s\-().]/g, '')
  if (/^\+251\d{9}$/.test(value)) return value
  if (/^251\d{9}$/.test(value)) return `+${value}`
  if (/^0\d{9}$/.test(value)) return `+251${value.slice(1)}`
  if (/^\d{9}$/.test(value)) return `+251${value}`
  return null
}

/**
 * Validate and create a customer login.
 *
 * Pass a `PoolConnection` when the caller is inside a transaction (creating a
 * company and its login together), so the insert rolls back with everything else.
 */
export async function createCustomerAccount(
  db: Pool | PoolConnection,
  roleId: CustomerRoleId,
  input: CreateCustomerAccountInput
): Promise<CustomerAccountRefusal | CustomerAccountSuccess> {
  const firstName = input.first_name?.trim() ?? ''
  const lastName = (input.last_name ?? '').trim()
  const rawPhone = input.phone_number?.trim() ?? ''
  const phone = normaliseCustomerPhone(rawPhone)
  const password = input.password ?? ''

  if (!firstName || !rawPhone || !password.trim()) {
    return { ok: false, status: 400, message: 'First name, phone number and password are required.' }
  }
  if (!phone) {
    return {
      ok: false,
      status: 400,
      message: 'Enter a valid Ethiopian phone number, for example 0911234567 or +251911234567.',
    }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, status: 400, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  const email = input.email?.trim().toLowerCase() || null
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160)) {
    return { ok: false, status: 400, message: 'Please provide a valid email address.' }
  }

  const [[existing]] = await db.query<any[]>(
    'SELECT id FROM users WHERE phone_number = ? LIMIT 1',
    [phone]
  )
  if (existing) {
    return { ok: false, status: 409, message: 'Phone number already registered.' }
  }

  const id = uuidv4()
  const passwordHash = await bcrypt.hash(password, 12)

  try {
    // Admin-created accounts skip phone verification — an admin vouching for
    // the number is the verification. Email stays unverified until the owner
    // clicks the link, exactly as with self-registration.
    await db.query(
      `INSERT INTO users (id, role_id, first_name, last_name, phone_number, email, password_hash,
         is_active, is_phone_verified, is_email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0)`,
      [id, roleId, firstName, lastName, phone, email, passwordHash]
    )
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return { ok: false, status: 409, message: 'This phone number or email address is already registered.' }
    }
    throw err
  }

  return { ok: true, id, firstName, phoneNumber: phone }
}
