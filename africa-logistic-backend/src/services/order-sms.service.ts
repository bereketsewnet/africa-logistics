/**
 * Order SMS (src/services/order-sms.service.ts)
 *
 * The two texts a shipper receives about their own load, both in Amharic, and
 * both duplicates of something already sent by email. The email is unchanged —
 * these are added alongside it, and either can be switched off from the
 * recipient's notification settings without losing the email.
 *
 *  1. **Codes** — the pickup and delivery OTPs, sent when the order is placed,
 *     at the same moment as the existing email.
 *  2. **Confirmation** — the load details, sent once a driver is assigned and
 *     the job is ready to run.
 *
 * Both cost real money and Amharic is expensive: one Ethiopic character forces
 * the whole message to Unicode, so a segment holds 70 characters instead of 160.
 * These templates are deliberately terse for that reason — every line removed is
 * a credit saved on every order. `estimateSegments` is asserted in the tests
 * rather than guessed at.
 *
 * Nothing here ever throws. A text that fails must not roll back an order that
 * was placed successfully, so the caller gets `false` and the send is logged.
 */

import type { Pool, RowDataPacket } from 'mysql2/promise'
import { sendSms } from './sms.service.js'

interface ShipperRow extends RowDataPacket {
  id: string
  first_name: string | null
  phone_number: string
  sms_enabled: number | null
  order_updates: number | null
  sms_order_alerts: number | null
  sms_otp_codes: number | null
}

/** Support numbers shown in the message, from the contact details in Settings. */
async function supportNumbers(db: Pool): Promise<string> {
  try {
    const [[row]] = await db.query<RowDataPacket[]>(
      'SELECT phone1, phone2 FROM company_contact LIMIT 1'
    )
    return [row?.phone1, row?.phone2].filter(Boolean).join(' ') || ''
  } catch {
    return ''
  }
}

/**
 * The shipper, with their preferences. A missing preferences row means the
 * defaults apply — both texts on — which is what every existing user has.
 */
async function loadShipper(db: Pool, shipperId: string): Promise<ShipperRow | null> {
  const [[row]] = await db.query<ShipperRow[]>(
    `SELECT u.id, u.first_name, u.phone_number,
            np.sms_enabled, np.order_updates, np.sms_order_alerts, np.sms_otp_codes
       FROM users u
       LEFT JOIN notification_preferences np ON np.user_id = u.id
      WHERE u.id = ? LIMIT 1`,
    [shipperId]
  )
  return row ?? null
}

// ─── Templates ────────────────────────────────────────────────────────────────

export interface OrderSmsFacts {
  referenceCode: string
  pickupAddress: string
  deliveryAddress: string
  cargoType: string
  price: string
  vehiclesRequired: number
}

/**
 * The load confirmation, sent once a driver is assigned.
 *
 * Modelled on the announcement the owner supplied, with the closing line
 * changed: the original invited carriers to call about the job, which reads as
 * nonsense to the customer who posted it. This one tells them their load is
 * confirmed and ready.
 */
export function buildOrderConfirmationSms(facts: OrderSmsFacts, support: string): string {
  const lines = [
    '🚛 AFRI LOGISTICS – የጭነት ማረጋገጫ',
    `ት.ቁ፦ ${facts.referenceCode}`,
    `መነሻ፦ ${facts.pickupAddress}`,
    `መድረሻ፦ ${facts.deliveryAddress}`,
    `የጭነት አይነት፦ ${facts.cargoType}`,
    `የጭነት ዋጋ፦ ${facts.price}`,
    `የመኪና ፍላጎት፦ ${facts.vehiclesRequired} መኪና`,
    '',
    'ጭነትዎ ተረጋግጦ ለጉዞ ተዘጋጅቷል።',
  ]
  if (support) lines.push(`📞 ለበለጠ መረጃ፦ ${support}`)
  lines.push('AFRI LOGISTICS PLC')
  return lines.join('\n')
}

/**
 * The two codes. The shipper hands the pickup code to the driver at collection
 * and the delivery code at drop-off, which is what proves the two actually met.
 */
export function buildOrderOtpSms(referenceCode: string, pickupOtp: string, deliveryOtp: string): string {
  return [
    `🚛 AFRI LOGISTICS – ት.ቁ ${referenceCode}`,
    `የመጫኛ ኮድ፦ ${pickupOtp}`,
    `የማራገፊያ ኮድ፦ ${deliveryOtp}`,
    '',
    'የመጫኛ ኮድ ጭነት ሲወሰድ፣ የማራገፊያ ኮድ ሲደርስ ለሹፌሩ ይስጡ።',
    'ይህን ኮድ ለሌላ ሰው አያጋሩ።',
  ].join('\n')
}

// ─── Senders ──────────────────────────────────────────────────────────────────

/**
 * Text the shipper their pickup and delivery codes, when the order is placed.
 * Mirrors the existing email; the email is sent regardless of this.
 */
export async function sendOrderOtpSms(
  db: Pool,
  shipperId: string,
  referenceCode: string,
  pickupOtp: string,
  deliveryOtp: string
): Promise<boolean> {
  try {
    const shipper = await loadShipper(db, shipperId)
    if (!shipper?.phone_number) return false
    // Defaults apply when no preferences row exists.
    if ((shipper.sms_enabled ?? 1) !== 1) return false
    if ((shipper.sms_otp_codes ?? 1) !== 1) return false

    const result = await sendSms(
      db, shipper.phone_number,
      buildOrderOtpSms(referenceCode, pickupOtp, deliveryOtp),
      'OTP'
    )
    return result.ok
  } catch {
    return false
  }
}

/**
 * Text the shipper their load details once it is confirmed and ready to run.
 * Gated by `order_updates` as well, so switching order notifications off stops
 * this too — a recipient who muted order updates did not ask for a text version.
 */
export async function sendOrderConfirmationSms(
  db: Pool,
  shipperId: string,
  facts: OrderSmsFacts
): Promise<boolean> {
  try {
    const shipper = await loadShipper(db, shipperId)
    if (!shipper?.phone_number) return false
    if ((shipper.sms_enabled ?? 1) !== 1) return false
    if ((shipper.order_updates ?? 1) !== 1) return false
    if ((shipper.sms_order_alerts ?? 1) !== 1) return false

    const result = await sendSms(
      db, shipper.phone_number,
      buildOrderConfirmationSms(facts, await supportNumbers(db)),
      'OTHER'
    )
    return result.ok
  } catch {
    return false
  }
}

/**
 * Gather what the confirmation needs from an order row, falling back to
 * something readable rather than printing "null" to a customer.
 */
export async function factsForOrder(db: Pool, orderId: string): Promise<(OrderSmsFacts & { shipper_id: string }) | null> {
  try {
    const [[row]] = await db.query<RowDataPacket[]>(
      `SELECT o.id, o.reference_code, o.shipper_id, o.pickup_address, o.delivery_address,
              o.estimated_price, o.final_price, o.vehicles_required,
              ct.name AS cargo_name
         FROM orders o
         LEFT JOIN cargo_types ct ON ct.id = o.cargo_type_id
        WHERE o.id = ? LIMIT 1`,
      [orderId]
    )
    if (!row) return null

    const price = Number(row.final_price ?? row.estimated_price ?? 0)
    return {
      shipper_id: String(row.shipper_id),
      referenceCode: String(row.reference_code),
      // Addresses can be long; the message is Unicode, so a full street address
      // could add two segments on its own.
      pickupAddress: shorten(row.pickup_address),
      deliveryAddress: shorten(row.delivery_address),
      cargoType: String(row.cargo_name ?? '-'),
      price: price > 0 ? `${price.toLocaleString('en-US')} ብር` : '-',
      vehiclesRequired: Number(row.vehicles_required ?? 1),
    }
  } catch {
    return null
  }
}

function shorten(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  // Addresses here read "Adama, Oromia, Ethiopia" — the first part is the one
  // that matters and the rest is repeated on every order.
  const head = text.split(',')[0].trim()
  return head.length > 28 ? `${head.slice(0, 27)}…` : head || '-'
}
