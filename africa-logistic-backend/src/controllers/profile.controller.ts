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

// ─── Request Body Types ───────────────────────────────────────────────────────

interface UpdateThemeBody {
  theme: 'LIGHT' | 'DARK' | 'SYSTEM'
}

interface UpdateNotificationPrefsBody {
  sms_enabled?: boolean
  email_enabled?: boolean
  browser_enabled?: boolean
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
    sms_enabled:     body.sms_enabled     !== undefined ? (body.sms_enabled ? 1 : 0)     : undefined,
    email_enabled:   body.email_enabled   !== undefined ? (body.email_enabled ? 1 : 0)   : undefined,
    browser_enabled: body.browser_enabled !== undefined ? (body.browser_enabled ? 1 : 0) : undefined,
    order_updates:   body.order_updates   !== undefined ? (body.order_updates ? 1 : 0)   : undefined,
    promotions:      body.promotions      !== undefined ? (body.promotions ? 1 : 0)       : undefined,
  })

  const updated = await getNotificationPrefs(request.server.db, caller.id)
  return reply.send({ success: true, message: 'Notification preferences updated.', preferences: updated })
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
