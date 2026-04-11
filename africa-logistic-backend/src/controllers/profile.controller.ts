/**
 * Profile Controller (src/controllers/profile.controller.ts)
 *
 * Handles all user profile management endpoints:
 *  - Get own full profile (with driver profile if applicable)
 *  - Update theme preference
 *  - Get/update notification preferences
 *  - Driver document upload (base64)
 *  - Get own driver profile + doc statuses
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import fs from 'fs'
import path from 'path'
import {
  getDriverProfile,
  ensureDriverProfile,
  updateDriverDocuments,
  getNotificationPrefs,
  upsertNotificationPrefs,
  updateThemePreference,
  getDocumentReviews,
  getDriverVehicles,
  createVehicle,
} from '../services/profile.service.js'
import { findUserById } from '../services/auth.service.js'
import {
  getPublicVapidKey,
  upsertPushSubscription,
  deactivatePushSubscription,
} from '../services/push.service.js'

// ─── Request Body Types ───────────────────────────────────────────────────────

interface UpdateThemeBody {
  theme: 'LIGHT' | 'DARK' | 'SYSTEM'
}

interface UpdateNotificationPrefsBody {
  sms_enabled?: boolean
  email_enabled?: boolean
  browser_enabled?: boolean
  telegram_enabled?: boolean
  order_updates?: boolean
  promotions?: boolean
}

interface DriverDocUploadBody {
  /** base64-encoded image/PDF for National ID */
  national_id?: string
  /** base64-encoded image/PDF for Driver's License */
  license?: string
  /** base64-encoded image/PDF for Libre (vehicle ownership doc) */
  libre?: string
}

interface DriverVehicleSubmitBody {
  plate_number: string
  vehicle_type: string
  max_capacity_kg: number
  description?: string
  vehicle_photo?: string  // base64
  libre_file?: string     // base64 libre doc
}

interface PushSubscribeBody {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

interface PushUnsubscribeBody {
  endpoint: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Save a base64 data string to disk under uploads/driver_docs/. Returns relative URL path. */
function saveBase64File(
  base64Data: string,
  subDir: string,
  baseName: string
): string {
  // Strip "data:<mime>;base64," prefix if present
  const match = base64Data.match(/^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/)
  const raw = match ? match[2] : base64Data
  const mime = match ? match[1] : 'application/octet-stream'

  // Determine file extension from mime type
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  }
  const ext = extMap[mime] ?? 'bin'

  const dir = path.join(process.cwd(), 'uploads', subDir)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const filename = `${baseName}_${Date.now()}.${ext}`
  const fullPath = path.join(dir, filename)
  fs.writeFileSync(fullPath, Buffer.from(raw, 'base64'))

  return `/uploads/${subDir}/${filename}`
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * GET /api/profile
 * Returns the authenticated user's full profile.
 * If the user is a driver (role_id=3), also returns their driver_profile row.
 */
export async function getProfileHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  const db = request.server.db

  const user = await findUserById(db, caller.id)
  if (!user) return reply.status(404).send({ success: false, message: 'User not found.' })

  // Strip password hash before sending
  const { password_hash, ...safeUser } = user as any

  let driverProfile = null
  if (user.role_id === 3) {
    driverProfile = await getDriverProfile(db, caller.id)
  }

  const notificationPrefs = await getNotificationPrefs(db, caller.id)

  return reply.send({
    success: true,
    user: safeUser,
    driver_profile: driverProfile,
    notification_preferences: notificationPrefs ?? {
      sms_enabled: 1,
      email_enabled: 1,
      browser_enabled: 1,
      order_updates: 1,
      promotions: 0,
    },
  })
}

/**
 * PUT /api/profile/theme
 * Update the authenticated user's theme preference.
 */
export async function updateThemeHandler(
  request: FastifyRequest<{ Body: UpdateThemeBody }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string }
  const { theme } = request.body

  const valid = ['LIGHT', 'DARK', 'SYSTEM']
  if (!theme || !valid.includes(theme)) {
    return reply.status(400).send({ success: false, message: 'theme must be LIGHT, DARK, or SYSTEM.' })
  }

  await updateThemePreference(request.server.db, caller.id, theme)
  return reply.send({ success: true, message: 'Theme updated.', theme })
}

/**
 * GET /api/profile/notifications
 * Fetch current notification preferences (with sensible defaults if not set yet).
 */
export async function getNotificationPrefsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const caller = request.user as { id: string }
  const prefs = await getNotificationPrefs(request.server.db, caller.id)

  return reply.send({
    success: true,
    preferences: prefs ?? {
      user_id: caller.id,
      sms_enabled: 1,
      email_enabled: 1,
      browser_enabled: 1,
      order_updates: 1,
      promotions: 0,
    },
  })
}

/**
 * PUT /api/profile/notifications
 * Update notification preferences for the authenticated user.
 */
export async function updateNotificationPrefsHandler(
  request: FastifyRequest<{ Body: UpdateNotificationPrefsBody }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string }
  const body = request.body

  await upsertNotificationPrefs(request.server.db, caller.id, {
    sms_enabled:      body.sms_enabled      !== undefined ? (body.sms_enabled ? 1 : 0)      : undefined,
    email_enabled:    body.email_enabled    !== undefined ? (body.email_enabled ? 1 : 0)    : undefined,
    browser_enabled:  body.browser_enabled  !== undefined ? (body.browser_enabled ? 1 : 0)  : undefined,
    telegram_enabled: body.telegram_enabled !== undefined ? (body.telegram_enabled ? 1 : 0) : undefined,
    order_updates:    body.order_updates    !== undefined ? (body.order_updates ? 1 : 0)    : undefined,
    promotions:       body.promotions       !== undefined ? (body.promotions ? 1 : 0)       : undefined,
  })

  const updated = await getNotificationPrefs(request.server.db, caller.id)
  return reply.send({ success: true, message: 'Notification preferences updated.', preferences: updated })
}

/**
 * GET /api/profile/push/public-key
 * Returns the VAPID public key used by the frontend to create browser subscriptions.
 */
export async function getPushPublicKeyHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const key = getPublicVapidKey()
  if (!key) {
    return reply.send({ success: false, enabled: false, public_key: null })
  }
  return reply.send({ success: true, enabled: true, public_key: key })
}

/**
 * POST /api/profile/push/subscribe
 * Save/update a browser push subscription for the authenticated user.
 */
export async function subscribePushHandler(
  request: FastifyRequest<{ Body: PushSubscribeBody }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string }
  const body = request.body

  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return reply.status(400).send({ success: false, message: 'Invalid push subscription payload.' })
  }

  await upsertPushSubscription(request.server.db, caller.id, {
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    userAgent: request.headers['user-agent'] ?? null,
  })

  return reply.send({ success: true, message: 'Push subscription saved.' })
}

/**
 * POST /api/profile/push/unsubscribe
 * Mark a browser push subscription as inactive.
 */
export async function unsubscribePushHandler(
  request: FastifyRequest<{ Body: PushUnsubscribeBody }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string }
  const endpoint = request.body?.endpoint

  if (!endpoint) {
    return reply.status(400).send({ success: false, message: 'endpoint is required.' })
  }

  await deactivatePushSubscription(request.server.db, caller.id, endpoint)
  return reply.send({ success: true, message: 'Push subscription removed.' })
}

/**
 * GET /api/profile/driver
 * Returns the authenticated driver's profile including doc upload URLs and statuses.
 * Role_id must be 3 (DRIVER).
 */
export async function getDriverProfileHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }

  if (caller.role_id !== 3) {
    return reply.status(403).send({ success: false, message: 'Driver role required.' })
  }

  const profile = await getDriverProfile(request.server.db, caller.id)
  if (!profile) {
    // No profile row yet → return empty pending state
    return reply.send({
      success: true,
      driver_profile: {
        user_id: caller.id,
        national_id_url: null,
        license_url: null,
        libre_url: null,
        national_id_status: 'PENDING',
        license_status: 'PENDING',
        libre_status: 'PENDING',
        is_verified: 0,
        status: 'OFFLINE',
        rating: null,
        total_trips: 0,
        rejection_reason: null,
      },
    })
  }

  return reply.send({ success: true, driver_profile: profile })
}

/**
 * POST /api/profile/driver/documents
 * Driver submits one or more documents as base64 strings.
 * Stores files under uploads/driver_docs/<userId>/ and records URLs in driver_profiles.
 * At least one document must be provided.
 */
export async function uploadDriverDocumentsHandler(
  request: FastifyRequest<{ Body: DriverDocUploadBody }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }

  if (caller.role_id !== 3) {
    return reply.status(403).send({ success: false, message: 'Driver role required.' })
  }

  const { national_id, license, libre } = request.body ?? {}

  if (!national_id && !license && !libre) {
    return reply.status(400).send({
      success: false,
      message: 'At least one document (national_id, license, libre) must be provided.',
    })
  }

  const db = request.server.db
  await ensureDriverProfile(db, caller.id)

  const updates: { nationalIdUrl?: string; licenseUrl?: string; libreUrl?: string } = {}

  if (national_id) {
    updates.nationalIdUrl = saveBase64File(national_id, `driver_docs/${caller.id}`, 'national_id')
  }
  if (license) {
    updates.licenseUrl = saveBase64File(license, `driver_docs/${caller.id}`, 'license')
  }
  if (libre) {
    updates.libreUrl = saveBase64File(libre, `driver_docs/${caller.id}`, 'libre')
  }

  await updateDriverDocuments(db, caller.id, updates)

  const profile = await getDriverProfile(db, caller.id)
  return reply.status(201).send({
    success: true,
    message: 'Documents uploaded successfully. Pending admin review.',
    driver_profile: profile,
  })
}

/**
 * GET /api/profile/driver/reviews
 * Returns the document review history for this driver (for showing rejection reasons).
 */
export async function getDriverDocReviewsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 3) return reply.status(403).send({ success: false, message: 'Driver role required.' })
  const reviews = await getDocumentReviews(request.server.db, caller.id)
  return reply.send({ success: true, reviews })
}

/**
 * GET /api/profile/driver/vehicles
 * Returns all vehicles associated with this driver (submitted + assigned).
 */
export async function getDriverVehiclesHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 3) return reply.status(403).send({ success: false, message: 'Driver role required.' })
  const vehicles = await getDriverVehicles(request.server.db, caller.id)
  return reply.send({ success: true, vehicles })
}

/**
 * POST /api/profile/driver/vehicles
 * Driver submits their own vehicle for admin approval.
 * Body: { plate_number, vehicle_type, max_capacity_kg, description?, vehicle_photo?, libre_file? }
 */
export async function submitDriverVehicleHandler(
  request: FastifyRequest<{ Body: DriverVehicleSubmitBody }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 3) return reply.status(403).send({ success: false, message: 'Driver role required.' })

  const { plate_number, vehicle_type, max_capacity_kg, description, vehicle_photo, libre_file } = request.body

  if (!plate_number?.trim() || !vehicle_type?.trim() || max_capacity_kg === undefined) {
    return reply.status(400).send({ message: 'plate_number, vehicle_type, and max_capacity_kg are required.' })
  }

  const db = request.server.db

  // Check plate not already registered
  const [[existing]] = await db.query<any[]>('SELECT id FROM vehicles WHERE plate_number = ? LIMIT 1', [plate_number.trim()])
  if (existing) return reply.status(409).send({ message: 'A vehicle with this plate number is already registered.' })

  let photoUrl: string | null = null
  let libreUrl: string | null = null
  if (vehicle_photo) photoUrl = saveBase64File(vehicle_photo, 'vehicles', `drv_${caller.id}_photo`)
  if (libre_file)   libreUrl = saveBase64File(libre_file, 'vehicles', `drv_${caller.id}_libre`)

  const vehicleId = await createVehicle(db, {
    plateNumber:           plate_number.trim(),
    vehicleType:           vehicle_type.trim(),
    maxCapacityKg:         max_capacity_kg,
    isCompanyOwned:        false,
    vehiclePhotoUrl:       photoUrl,
    libreUrl,
    description:           description?.trim() ?? null,
    submittedByDriverId:   caller.id,
  })

  return reply.status(201).send({
    success: true,
    message: 'Vehicle submitted for admin approval.',
    vehicle_id: vehicleId,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── FINANCIAL / PAYMENT ENDPOINTS ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/profile/wallet
 * Get user's wallet balance and summary
 */
export async function getWalletHandler(request: FastifyRequest, reply: FastifyReply) {
  const caller = request.user as { id: string }
  const db = request.server.db

  const { getOrCreateWallet, getWalletTransactionHistory } = await import('../services/wallet.service.js')

  try {
    const wallet = await getOrCreateWallet(db, caller.id)
    const { transactions, total } = await getWalletTransactionHistory(db, caller.id, 10)

    return reply.send({
      success: true,
      wallet: {
        id: wallet.id,
        balance: Number(wallet.balance),
        currency: wallet.currency,
        total_earned: Number(wallet.total_earned),
        total_spent: Number(wallet.total_spent),
        is_locked: Boolean(wallet.is_locked),
        lock_reason: wallet.lock_reason,
      },
      recent_transactions: transactions.map((t) => ({
        id: t.id,
        type: t.transaction_type,
        amount: Number(t.amount),
        description: t.description,
        created_at: t.created_at,
        status: t.status,
      })),
      total_transactions: total,
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to fetch wallet' })
  }
}

/**
 * GET /api/profile/wallet/transactions?limit=50&offset=0
 * Get paginated transaction history
 */
export async function getTransactionHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const caller = request.user as { id: string }
  const db = request.server.db
  const { limit = 50, offset = 0 } = request.query as { limit: number; offset: number }

  const { getWalletTransactionHistory } = await import('../services/wallet.service.js')

  try {
    const { transactions, total } = await getWalletTransactionHistory(db, caller.id, Math.min(Number(limit), 100), Number(offset))

    return reply.send({
      success: true,
      transactions: transactions.map((t) => ({
        id: t.id,
        order_id: t.order_id,
        type: t.transaction_type,
        amount: Number(t.amount),
        description: t.description,
        reference_code: t.reference_code,
        status: t.status,
        created_at: t.created_at,
      })),
      total,
      limit,
      offset,
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to fetch transactions' })
  }
}

/**
 * GET /api/profile/invoices?limit=50&offset=0
 * Get user's invoices
 */
export async function getInvoicesHandler(request: FastifyRequest, reply: FastifyReply) {
  const caller = request.user as { id: string; role_id: number }
  const db = request.server.db
  const { limit = 50, offset = 0 } = request.query as { limit: number; offset: number }

  const { getUserInvoices } = await import('../services/invoice.service.js')

  try {
    // Determine user role
    const userRole = caller.role_id === 2 ? 'shipper' : 'driver'

    const { invoices, total } = await getUserInvoices(db, caller.id, userRole, Math.min(Number(limit), 100), Number(offset))

    return reply.send({
      success: true,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        order_id: inv.order_id,
        total_amount: Number(inv.total_amount),
        shipper_amount: Number(inv.shipper_amount),
        driver_amount: Number(inv.driver_amount),
        commission: Number(inv.commission),
        tip_amount: Number(inv.tip_amount),
        pdf_url: inv.pdf_url,
        generated_at: inv.generated_at,
        downloaded: userRole === 'shipper' ? inv.downloaded_by_shipper : inv.downloaded_by_driver,
      })),
      total,
      limit,
      offset,
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to fetch invoices' })
  }
}

/**
 * POST /api/profile/invoices/:invoiceId/download
 * Mark invoice as downloaded
 */
export async function downloadInvoiceHandler(request: FastifyRequest, reply: FastifyReply) {
  const caller = request.user as { id: string; role_id: number }
  const db = request.server.db
  const { invoiceId } = request.params as { invoiceId: string }

  const { getInvoiceByOrderId, markInvoiceDownloadedByShipper, markInvoiceDownloadedByDriver } = await import('../services/invoice.service.js')

  try {
    // Verify user owns this invoice
    const [[invoice]] = await db.query<any[]>(
      `SELECT oi.*, o.shipper_id, o.driver_id FROM order_invoices oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = ?`,
      [invoiceId]
    )

    if (!invoice) {
      return reply.status(404).send({ success: false, message: 'Invoice not found' })
    }

    // Check ownership
    if (invoice.shipper_id !== caller.id && invoice.driver_id !== caller.id) {
      return reply.status(403).send({ success: false, message: 'Not authorized' })
    }

    // Mark as downloaded
    if (caller.role_id === 2) {
      // Shipper
      await markInvoiceDownloadedByShipper(db, invoiceId)
    } else {
      // Driver
      await markInvoiceDownloadedByDriver(db, invoiceId)
    }

    return reply.send({
      success: true,
      message: 'Invoice downloaded',
      pdf_url: invoice.pdf_url,
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to download invoice' })
  }
}

/**
 * POST /api/profile/wallet/manual-payment
 * Submit manual payment proof (for shippers depositing via bank transfer)
 * Body: { amount, payment_method, proof_image (base64) }
 */
export async function submitManualPaymentHandler(
  request: FastifyRequest<{ Body: { amount: number; payment_method: string; proof_image?: string } }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string }
  const db = request.server.db
  const { amount, payment_method, proof_image } = request.body

  // Allowed preset amounts
  const ALLOWED_AMOUNTS = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000]

  if (!amount || !ALLOWED_AMOUNTS.includes(amount)) {
    return reply.status(400).send({ message: `Amount must be one of: ${ALLOWED_AMOUNTS.join(', ')} ETB` })
  }

  if (!payment_method?.trim()) {
    return reply.status(400).send({ message: 'payment_method is required' })
  }

  try {
    const { getOrCreateWallet } = await import('../services/wallet.service.js')
    const wallet = await getOrCreateWallet(db, caller.id)

    let proofUrl: string | null = null
    if (proof_image) {
      proofUrl = saveBase64File(proof_image, 'payment_proofs', `payment_${caller.id}`)
    }

    const { randomUUID } = await import('crypto')
    const recordId = randomUUID()

    await db.query(
      `INSERT INTO manual_payment_records 
       (id, wallet_id, amount, action_type, reason, proof_image_url, submitted_by, status)
       VALUES (?, ?, ?, 'DEPOSIT', ?, ?, ?, 'PENDING')`,
      [recordId, wallet.id, amount, `Manual deposit via ${payment_method}`, proofUrl, caller.id]
    )

    return reply.status(201).send({
      success: true,
      message: 'Payment submission received. Admin will review and process within 24 hours.',
      record_id: recordId,
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to submit payment' })
  }
}
