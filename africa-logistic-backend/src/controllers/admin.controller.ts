import { FastifyRequest, FastifyReply } from 'fastify'
import bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import twilio from 'twilio'
import {
  listDriversForAdmin,
  reviewDriverDocument,
  verifyDriver,
  rejectDriver,
  getDriverProfile,
  getDocumentReviews,
  listVehicles,
  listPendingDriverVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  assignVehicleToDriver,
  unassignVehicle,
  getDriverRatings,
  getDriverRatingSummary,
  softDeleteRating,
  adminSetDriverStatus,
} from '../services/profile.service.js'

// ─── Request Body Types ───────────────────────────────────────────────────────

interface ReviewDocumentBody {
  document_type: 'national_id' | 'license' | 'libre'
  action: 'APPROVED' | 'REJECTED'
  reason?: string
}

interface RejectDriverBody {
  reason: string
}

interface CreateVehicleBody {
  plate_number: string
  vehicle_type: string
  max_capacity_kg: number
  is_company_owned?: boolean
  vehicle_photo?: string   // base64 main photo
  vehicle_images?: string[] // up to 5 extra images (base64)
  libre_file?: string      // base64 libre document
  description?: string
}

interface UpdateVehicleBody {
  plate_number?: string
  vehicle_type?: string
  max_capacity_kg?: number
  is_company_owned?: boolean
  vehicle_photo?: string   // base64
  vehicle_images?: string[] // up to 5 extra (base64)
  libre_file?: string
  description?: string
  is_active?: boolean
}

interface AssignDriverBody {
  driver_id: string
}

// ─── SMS Helper ───────────────────────────────────────────────────────────────

async function sendRejectionSms(phone: string, message: string): Promise<void> {
  const sid  = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from || sid.startsWith('ACxxxxx')) {
    console.log(`📱 [SMS stub] To ${phone}: ${message}`)
    return
  }
  try {
    await twilio(sid, token).messages.create({ body: message, from, to: phone })
  } catch (err) {
    console.error('Twilio SMS failed:', err)
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

import fs from 'fs'
import path from 'path'

function saveFile(base64Data: string, subDir: string, baseName: string): string {
  const match = base64Data.match(/^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/)
  const raw  = match ? match[2] : base64Data
  const mime = match ? match[1] : 'image/jpeg'
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'application/pdf': 'pdf',
  }
  const ext = extMap[mime] ?? 'jpg'
  const dir = path.join(process.cwd(), 'uploads', subDir)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const filename = `${baseName}_${Date.now()}.${ext}`
  fs.writeFileSync(path.join(dir, filename), Buffer.from(raw, 'base64'))
  return `/uploads/${subDir}/${filename}`
}

// keep old name as alias
const saveVehiclePhoto = (b64: string, id: string) => saveFile(b64, 'vehicles', id)

// ─── Existing Handlers ────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * Returns all users with stats. Admin-only.
 */
export async function adminGetUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const db = request.server.db

  // Verify caller is admin (role_id = 1)
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) {
    return reply.status(403).send({ message: 'Admin access required.' })
  }

  const [users] = await db.query<any[]>(`
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      u.phone_number,
      u.email,
      u.is_active,
      u.is_phone_verified,
      u.is_email_verified,
      u.created_at,
      u.profile_photo_url,
      r.id        AS role_id,
      r.role_name AS role_name,
      dp.is_verified AS is_driver_verified,
      w.id        AS wallet_id,
      COALESCE(w.balance, 0) AS current_balance,
      COALESCE(w.total_earned, 0) AS total_earned,
      COALESCE(w.total_spent, 0) AS total_spent
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN wallets w ON w.user_id = u.id
    ORDER BY u.created_at DESC
  `)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const stats = {
    total_users:    users.length,
    active_users:   users.filter((u: any) => u.is_active).length,
    total_admins:   users.filter((u: any) => u.role_id === 1).length,
    total_shippers: users.filter((u: any) => u.role_id === 2).length,
    total_drivers:  users.filter((u: any) => u.role_id === 3).length,
    new_today:      users.filter((u: any) => new Date(u.created_at) >= today).length,
  }

  return reply.send({ users, stats })
}

/**
 * PATCH /api/admin/users/:id/toggle-active
 * Flips the is_active flag for a user. Admin-only.
 */
export async function adminToggleActiveHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const db = request.server.db
  const caller = request.user as { id: string; role_id: number }

  if (caller.role_id !== 1) {
    return reply.status(403).send({ message: 'Admin access required.' })
  }

  const { id } = request.params

  // Prevent admin from suspending themselves
  if (id === caller.id) {
    return reply.status(400).send({ message: 'Cannot suspend your own account.' })
  }

  const [[target]] = await db.query<any[]>(
    'SELECT id, is_active FROM users WHERE id = ?',
    [id],
  )

  if (!target) {
    return reply.status(404).send({ message: 'User not found.' })
  }

  const newActive = target.is_active ? 0 : 1
  await db.query('UPDATE users SET is_active = ? WHERE id = ?', [newActive, id])

  return reply.send({ id, is_active: newActive })
}

// ─── Driver Verification Handlers ─────────────────────────────────────────────

/**
 * GET /api/admin/drivers
 * Query param: ?filter=all|pending|verified|rejected  (default: all)
 * Lists drivers with their profile and document statuses.
 */
export async function adminListDriversHandler(
  request: FastifyRequest<{ Querystring: { filter?: string } }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const filter = (request.query.filter ?? 'all') as 'all' | 'pending' | 'verified' | 'rejected'
  const drivers = await listDriversForAdmin(request.server.db, filter)
  return reply.send({ success: true, drivers, total: drivers.length })
}

/**
 * GET /api/admin/drivers/:id
 * Returns a single driver's full profile + document review history.
 */
export async function adminGetDriverHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const db = request.server.db
  const profile = await getDriverProfile(db, request.params.id)
  if (!profile) return reply.status(404).send({ success: false, message: 'Driver not found.' })

  const reviews = await getDocumentReviews(db, request.params.id)

  // Trip statistics
  const [statRows] = await db.query<any[]>(
    `SELECT
       COUNT(*) AS total_assigned,
       SUM(status IN ('DELIVERED','COMPLETED')) AS completed,
       SUM(status = 'CANCELLED') AS cancelled,
       SUM(status IN ('ASSIGNED','EN_ROUTE','AT_PICKUP','IN_TRANSIT')) AS active_now
     FROM orders WHERE driver_id = ?`,
    [request.params.id]
  )
  const trip_stats = statRows[0] ?? { total_assigned: 0, completed: 0, cancelled: 0, active_now: 0 }

  // Ratings
  const ratings = await getDriverRatings(db, request.params.id, false)
  const rating_summary = await getDriverRatingSummary(db, request.params.id)

  return reply.send({ success: true, driver_profile: profile, document_reviews: reviews, trip_stats, ratings, rating_summary })
}

/**
 * POST /api/admin/drivers/:id/review-document
 * Approve or reject a single document type for a driver.
 * Body: { document_type: 'national_id'|'license'|'libre', action: 'APPROVED'|'REJECTED', reason?: string }
 */
export async function adminReviewDocumentHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: ReviewDocumentBody }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const { document_type, action, reason } = request.body

  const validTypes = ['national_id', 'license', 'libre']
  const validActions = ['APPROVED', 'REJECTED']
  if (!validTypes.includes(document_type))  return reply.status(400).send({ message: 'Invalid document_type.' })
  if (!validActions.includes(action))       return reply.status(400).send({ message: 'action must be APPROVED or REJECTED.' })
  if (action === 'REJECTED' && !reason)     return reply.status(400).send({ message: 'reason is required when rejecting.' })

  const db = request.server.db
  const profile = await getDriverProfile(db, request.params.id)
  if (!profile) return reply.status(404).send({ success: false, message: 'Driver profile not found.' })

  await reviewDriverDocument(db, request.params.id, document_type, action, reason ?? null, caller.id)

  // Send SMS to driver when a document is rejected
  if (action === 'REJECTED') {
    const [userRows] = await db.query<any[]>(
      'SELECT u.phone_number FROM users u JOIN driver_profiles dp ON dp.user_id = u.id WHERE dp.user_id = ? LIMIT 1',
      [request.params.id]
    )
    if (userRows[0]?.phone_number) {
      const docLabel: Record<string, string> = { national_id: 'National ID', license: "Driver's License", libre: 'Libre document' }
      await sendRejectionSms(
        userRows[0].phone_number,
        `Africa Logistics: Your ${docLabel[document_type] ?? document_type} was rejected. Reason: ${reason}. Please re-upload via the app.`
      )
    }
  }

  const updated = await getDriverProfile(db, request.params.id)
  return reply.send({
    success: true,
    message: `Document '${document_type}' has been ${action}.`,
    driver_profile: updated,
  })
}

/**
 * POST /api/admin/drivers/:id/verify
 * Fully verify a driver — marks all docs APPROVED, sets is_verified=1, status=AVAILABLE.
 */
export async function adminVerifyDriverHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const db = request.server.db
  const profile = await getDriverProfile(db, request.params.id)
  if (!profile) return reply.status(404).send({ success: false, message: 'Driver profile not found.' })

  // Ensure at least the required docs have been uploaded
  if (!profile.national_id_url || !profile.license_url || !profile.libre_url) {
    return reply.status(400).send({
      success: false,
      message: 'All three documents (National ID, License, Libre) must be uploaded before full verification.',
    })
  }

  await verifyDriver(db, request.params.id, caller.id)
  const updated = await getDriverProfile(db, request.params.id)
  return reply.send({ success: true, message: 'Driver fully verified.', driver_profile: updated })
}

/**
 * POST /api/admin/drivers/:id/reject
 * Reject a driver with a reason. Sets is_verified=0, status=OFFLINE.
 * Body: { reason: string }
 */
export async function adminRejectDriverHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: RejectDriverBody }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const { reason } = request.body
  if (!reason) return reply.status(400).send({ message: 'reason is required.' })

  const db = request.server.db
  const profile = await getDriverProfile(db, request.params.id)
  if (!profile) return reply.status(404).send({ success: false, message: 'Driver profile not found.' })

  await rejectDriver(db, request.params.id, reason)

  // Send SMS to driver with rejection reason
  const [userRows] = await db.query<any[]>(
    'SELECT u.phone_number FROM users u JOIN driver_profiles dp ON dp.user_id = u.id WHERE dp.user_id = ? LIMIT 1',
    [request.params.id]
  )
  if (userRows[0]?.phone_number) {
    await sendRejectionSms(
      userRows[0].phone_number,
      `Africa Logistics: Your driver application has been rejected. Reason: ${reason}. Please contact support if you have questions.`
    )
  }

  return reply.send({ success: true, message: 'Driver rejected.', reason })
}

// ─── Vehicle Management Handlers ──────────────────────────────────────────────

/**
 * GET /api/admin/vehicles
 * Query param: ?all=1  to include inactive vehicles (default: active only)
 * Returns all vehicles with their assigned driver info.
 */
export async function adminListVehiclesHandler(
  request: FastifyRequest<{ Querystring: { all?: string } }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const activeOnly = request.query.all !== '1'
  const vehicles = await listVehicles(request.server.db, activeOnly)
  return reply.send({ success: true, vehicles, total: vehicles.length })
}

/**
 * GET /api/admin/vehicles/:id
 * Returns a single vehicle with driver info.
 */
export async function adminGetVehicleHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const vehicle = await getVehicleById(request.server.db, request.params.id)
  if (!vehicle) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })
  return reply.send({ success: true, vehicle })
}

/**
 * POST /api/admin/vehicles
 * Create a new vehicle record.
 * Body: { plate_number, vehicle_type, max_capacity_kg, is_company_owned?, vehicle_photo?(base64), description? }
 */
export async function adminCreateVehicleHandler(
  request: FastifyRequest<{ Body: CreateVehicleBody }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const { plate_number, vehicle_type, max_capacity_kg, is_company_owned, vehicle_photo, vehicle_images, libre_file, description } = request.body

  if (!plate_number || !vehicle_type || max_capacity_kg === undefined) {
    return reply.status(400).send({ message: 'plate_number, vehicle_type, and max_capacity_kg are required.' })
  }

  let photoUrl: string | null = null
  if (vehicle_photo) photoUrl = saveVehiclePhoto(vehicle_photo, `tmp_${Date.now()}`)

  const imageUrls: string[] = []
  if (vehicle_images?.length) {
    for (let i = 0; i < Math.min(vehicle_images.length, 5); i++) {
      imageUrls.push(saveFile(vehicle_images[i], 'vehicles', `img_${Date.now()}_${i}`))
    }
  }

  let libreUrl: string | null = null
  if (libre_file) libreUrl = saveFile(libre_file, 'vehicles', `libre_${Date.now()}`)

  const vehicleId = await createVehicle(request.server.db, {
    plateNumber:    plate_number,
    vehicleType:    vehicle_type,
    maxCapacityKg:  max_capacity_kg,
    isCompanyOwned: is_company_owned ?? false,
    vehiclePhotoUrl: photoUrl,
    vehicleImages:  imageUrls.length ? imageUrls : undefined,
    libreUrl,
    description:    description ?? null,
  })

  const vehicle = await getVehicleById(request.server.db, vehicleId)
  return reply.status(201).send({ success: true, message: 'Vehicle created.', vehicle })
}

/**
 * PUT /api/admin/vehicles/:id
 * Update vehicle details.
 */
export async function adminUpdateVehicleHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateVehicleBody }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const db = request.server.db
  const existing = await getVehicleById(db, request.params.id)
  if (!existing) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })

  const body = request.body
  let photoUrl: string | undefined = undefined
  let imageUrls: string[] | undefined = undefined
  let libreUrl: string | undefined = undefined

  if (body.vehicle_photo) photoUrl = saveVehiclePhoto(body.vehicle_photo, request.params.id)
  if (body.vehicle_images?.length) {
    imageUrls = []
    for (let i = 0; i < Math.min(body.vehicle_images.length, 5); i++) {
      imageUrls.push(saveFile(body.vehicle_images[i], 'vehicles', `img_${request.params.id}_${i}`))
    }
  }
  if (body.libre_file) libreUrl = saveFile(body.libre_file, 'vehicles', `libre_${request.params.id}`)

  await updateVehicle(db, request.params.id, {
    plateNumber:    body.plate_number,
    vehicleType:    body.vehicle_type,
    maxCapacityKg:  body.max_capacity_kg,
    isCompanyOwned: body.is_company_owned,
    vehiclePhotoUrl: photoUrl,
    ...(imageUrls !== undefined ? { vehicleImages: JSON.stringify(imageUrls) } as any : {}),
    ...(libreUrl  !== undefined ? { libreUrl } as any : {}),
    description:    body.description,
    isActive:       body.is_active,
  })

  const updated = await getVehicleById(db, request.params.id)
  return reply.send({ success: true, message: 'Vehicle updated.', vehicle: updated })
}

/**
 * DELETE /api/admin/vehicles/:id
 * Soft-delete: sets is_active = 0.
 */
export async function adminDeleteVehicleHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const db = request.server.db
  const existing = await getVehicleById(db, request.params.id)
  if (!existing) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })

  await updateVehicle(db, request.params.id, { isActive: false })
  return reply.send({ success: true, message: 'Vehicle deactivated.' })
}

/**
 * POST /api/admin/vehicles/:id/assign-driver
 * Assign a verified driver to a vehicle.
 * Body: { driver_id: string }  — or empty body to unassign.
 */
export async function adminAssignDriverToVehicleHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: AssignDriverBody }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const db = request.server.db
  const { driver_id } = request.body ?? {}

  const existing = await getVehicleById(db, request.params.id)
  if (!existing) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })

  if (!driver_id) {
    // Unassign
    await unassignVehicle(db, request.params.id)
    return reply.send({ success: true, message: 'Vehicle unassigned from driver.' })
  }

  // Verify the driver exists and is verified
  const [driverRows] = await db.query<any[]>(
    `SELECT dp.is_verified, dp.status, u.first_name, u.last_name
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
      WHERE dp.user_id = ?
      LIMIT 1`,
    [driver_id]
  )
  const driver = driverRows[0]
  if (!driver) return reply.status(404).send({ success: false, message: 'Driver profile not found.' })
  if (!driver.is_verified) {
    return reply.status(400).send({ success: false, message: 'Driver must be verified before assigning a vehicle.' })
  }

  await assignVehicleToDriver(db, request.params.id, driver_id)
  const updated = await getVehicleById(db, request.params.id)
  return reply.send({
    success: true,
    message: `Vehicle assigned to driver ${driver.first_name} ${driver.last_name}. Driver status set to AVAILABLE.`,
    vehicle: updated,
  })
}

// ─── Staff / User Management Handlers ────────────────────────────────────────────────

/**
 * POST /api/admin/staff
 * Create a new staff user (role_id 1=Admin, 4=Cashier, 5=Dispatcher).
 * Body: { first_name, last_name, phone_number, password, email?, role_id }
 */
export async function adminCreateStaffHandler(
  request: FastifyRequest<{ Body: {
    first_name: string; last_name?: string; phone_number: string
    password: string; email?: string; role_id: number
  } }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const { first_name, last_name, phone_number, password, email, role_id } = request.body

  const staffRoles = [1, 4, 5]
  if (!staffRoles.includes(role_id)) {
    return reply.status(400).send({ message: 'role_id must be 1 (Admin), 4 (Cashier), or 5 (Dispatcher).' })
  }
  if (!first_name?.trim() || !phone_number?.trim() || !password?.trim()) {
    return reply.status(400).send({ message: 'first_name, phone_number and password are required.' })
  }

  const db = request.server.db
  const [[existing]] = await db.query<any[]>(
    'SELECT id FROM users WHERE phone_number = ? LIMIT 1',
    [phone_number]
  )
  if (existing) return reply.status(409).send({ message: 'Phone number already registered.' })

  const id = uuidv4()
  const password_hash = await bcrypt.hash(password, 12)

  await db.query(
    `INSERT INTO users (id, role_id, first_name, last_name, phone_number, email, password_hash,
       is_active, is_phone_verified, is_email_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
    [id, role_id, first_name.trim(), (last_name ?? '').trim(), phone_number, email ?? null,
     password_hash, email ? 1 : 0]
  )

  return reply.status(201).send({ success: true, message: 'Staff user created.', id })
}

/**
 * PUT /api/admin/users/:id
 * Update a user's display name, email or role.
 * Body: { first_name?, last_name?, email?, role_id? }
 */
export async function adminUpdateUserHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: {
    first_name?: string; last_name?: string; email?: string; role_id?: number
  } }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const db = request.server.db
  const { id } = request.params
  const { first_name, last_name, email, role_id } = request.body

  const [[user]] = await db.query<any[]>('SELECT id FROM users WHERE id = ? LIMIT 1', [id])
  if (!user) return reply.status(404).send({ message: 'User not found.' })

  const updates: string[] = []
  const values: any[] = []
  if (first_name !== undefined) { updates.push('first_name = ?'); values.push(first_name.trim()) }
  if (last_name  !== undefined) { updates.push('last_name = ?');  values.push(last_name.trim()) }
  if (email      !== undefined) { updates.push('email = ?');      values.push(email || null) }
  if (role_id    !== undefined) { updates.push('role_id = ?');    values.push(role_id) }

  if (updates.length === 0) return reply.status(400).send({ message: 'Nothing to update.' })

  values.push(id)
  await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values)

  // Also handle new_password
  const { new_password } = request.body as any
  if (new_password) {
    const hash = await bcrypt.hash(new_password, 12)
    await db.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, id])
  }

  return reply.send({ success: true, message: 'User updated.' })
}

// ─── Driver Vehicle Submission Review ─────────────────────────────────────────

/**
 * GET /api/admin/vehicles/submissions
 * List all driver-submitted vehicles with their status.
 */
export async function adminListVehicleSubmissionsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const vehicles = await listPendingDriverVehicles(request.server.db)
  return reply.send({ success: true, vehicles, total: vehicles.length })
}

/**
 * POST /api/admin/vehicles/:id/review
 * Approve or reject a driver-submitted vehicle.
 * Body: { action: 'APPROVED' | 'REJECTED', reason?: string }
 */
export async function adminReviewVehicleSubmissionHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { action: 'APPROVED' | 'REJECTED'; reason?: string } }>,
  reply: FastifyReply
) {
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) return reply.status(403).send({ message: 'Admin access required.' })

  const { action, reason } = request.body
  if (action !== 'APPROVED' && action !== 'REJECTED') {
    return reply.status(400).send({ message: 'action must be APPROVED or REJECTED.' })
  }
  if (action === 'REJECTED' && !reason) {
    return reply.status(400).send({ message: 'reason is required when rejecting.' })
  }

  const db = request.server.db
  const vehicle = await getVehicleById(db, request.params.id)
  if (!vehicle) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })
  if (!vehicle.submitted_by_driver_id) {
    return reply.status(400).send({ message: 'This vehicle was not submitted by a driver.' })
  }

  await updateVehicle(db, request.params.id, {
    ...(action === 'APPROVED' ? { isApproved: true } : { isApproved: false }),
    driverSubmissionStatus: action,
  } as any)

  // If approved → assign vehicle to the submitting driver
  if (action === 'APPROVED') {
    await assignVehicleToDriver(db, request.params.id, vehicle.submitted_by_driver_id!)
  }

  return reply.send({ success: true, message: `Vehicle submission ${action.toLowerCase()}.` })
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── ORDER MANAGEMENT (Admin) ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

import {
  listOrders,
  getOrderById,
  updateOrderStatus,
  updateOrderInternalNotes,
  assignOrderToDriver,
  cancelOrder,
  notifyOrderStatus,
  listAllCargoTypes,
  createCargoType,
  updateCargoType,
  listActiveCargoTypes,
  createOrder,
  generateOtp,
  getActiveDriversWithLocation,
  getSuggestedDriversForOrder,
  getOrderMessages,
  createOrderMessage,
  markMessagesRead,
} from '../services/order.service.js'

import {
  listPricingRules,
  getPricingRule,
  calculateQuote,
  getRouteDistanceKm,
  reverseGeocode,
  type PricingRuleRow,
} from '../services/pricing.service.js'

import { wsManager } from '../utils/wsManager.js'
import { sendPushToUser } from '../services/push.service.js'

// ─── Admin Order Handlers ─────────────────────────────────────────────────────

interface AdminOrderListQuery {
  status?: string
  shipper_id?: string
  driver_id?: string
  page?: string
  limit?: string
  search?: string
  date_from?: string
  date_to?: string
}

interface AdminAssignBody {
  driver_id: string
  vehicle_id?: string
}

interface AdminOrderStatusBody {
  status: string
  notes?: string
}

interface AdminOrderDetailsBody {
  cargo_type_id?: number
  vehicle_type_required?: string
  estimated_weight_kg?: number | null
  pickup_address?: string | null
  pickup_lat?: number
  pickup_lng?: number
  delivery_address?: string | null
  delivery_lat?: number
  delivery_lng?: number
  special_instructions?: string | null
  notes?: string
}

/** GET /api/admin/orders */
export async function adminListOrdersHandler(
  request: FastifyRequest<{ Querystring: AdminOrderListQuery }>,
  reply:   FastifyReply
) {
  const q     = request.query
  const page  = parseInt(q.page  ?? '1',  10)
  const limit = parseInt(q.limit ?? '25', 10)

  const { orders, total } = await listOrders(request.server.db, {
    status:    q.status,
    shipperId: q.shipper_id,
    driverId:  q.driver_id,
    page,
    limit,
    search:   q.search,
    dateFrom: q.date_from,
    dateTo:   q.date_to,
  })

  return reply.send({
    success: true,
    orders,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  })
}

/** GET /api/admin/orders/:id */
export async function adminGetOrderHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply:   FastifyReply
) {
  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })
  return reply.send({ success: true, order })
}

/** PATCH /api/admin/orders/:id/assign — Assign driver to a pending order */
export async function adminAssignOrderHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: AdminAssignBody }>,
  reply:   FastifyReply
) {
  const admin  = request.user as any
  const { driver_id, vehicle_id } = request.body
  const order  = await getOrderById(request.server.db, request.params.id)

  if (!order)   return reply.status(404).send({ success: false, message: 'Order not found.' })
  if (!driver_id) return reply.status(400).send({ success: false, message: 'driver_id is required.' })

  if (['PENDING', 'ASSIGNED'].includes(order.status)) {
    await assignOrderToDriver(request.server.db, order.id, driver_id, vehicle_id ?? null, admin.id)
    wsManager.broadcast(order.id, 'STATUS_CHANGED', { status: 'ASSIGNED', driver_id })
    notifyOrderStatus(request.server.db, order.id, 'ASSIGNED')
    await sendPushToUser(request.server.db, driver_id, {
      title: `New Assignment: ${order.reference_code}`,
      body: 'You have been assigned a new order.',
      url: '/driver/jobs',
      data: { order_id: order.id, reference_code: order.reference_code, type: 'NEW_ASSIGNMENT' },
    }).catch(() => {})
  } else {
    const db = request.server.db
    await db.query(
      `UPDATE orders SET driver_id = ?, vehicle_id = ?, assigned_at = IFNULL(assigned_at, NOW()), updated_by = ? WHERE id = ?`,
      [driver_id, vehicle_id ?? null, admin.id, order.id]
    )
    await db.query(
      `INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES (?, ?, ?, ?)`,
      [order.id, order.status, admin.id, 'Driver reassigned by admin']
    )
    await db.query(
      `UPDATE driver_profiles SET status = 'ON_JOB' WHERE user_id = ?`,
      [driver_id]
    )
    await sendPushToUser(db, driver_id, {
      title: `Order Reassigned: ${order.reference_code}`,
      body: 'An active order has been assigned to you.',
      url: '/driver/jobs',
      data: { order_id: order.id, reference_code: order.reference_code, type: 'REASSIGNED_ORDER' },
    }).catch(() => {})
  }

  return reply.send({ success: true, message: 'Driver assigned successfully.' })
}

/** PATCH /api/admin/orders/:id/status — Manual override order status */
export async function adminUpdateOrderStatusHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: AdminOrderStatusBody }>,
  reply:   FastifyReply
) {
  const admin  = request.user as any
  const { status, notes } = request.body
  const order  = await getOrderById(request.server.db, request.params.id)

  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  const validStatuses = [
    'PENDING','ASSIGNED','EN_ROUTE','AT_PICKUP','IN_TRANSIT',
    'AT_BORDER','IN_CUSTOMS','CUSTOMS_CLEARED','DELIVERED','COMPLETED','CANCELLED','FAILED',
  ]
  if (!validStatuses.includes(status)) {
    return reply.status(400).send({ success: false, message: `Invalid status: ${status}` })
  }

  await updateOrderStatus(request.server.db, order.id, status as any, admin.id, notes ?? 'Admin override')
  wsManager.broadcast(order.id, 'STATUS_CHANGED', { status })
  notifyOrderStatus(request.server.db, order.id, status as any)

  return reply.send({ success: true, message: `Order status updated to ${status}.` })
}

interface AdminOrderNotesBody {
  internal_notes: string
}

/** PATCH /api/admin/orders/:id/notes — Internal admin-only notes */
export async function adminUpdateOrderNotesHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: AdminOrderNotesBody }>,
  reply:   FastifyReply
) {
  const admin  = request.user as any
  const { internal_notes } = request.body ?? {}
  const order  = await getOrderById(request.server.db, request.params.id)

  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })
  if (typeof internal_notes !== 'string') {
    return reply.status(400).send({ success: false, message: 'internal_notes must be a string.' })
  }

  await updateOrderInternalNotes(request.server.db, order.id, internal_notes, admin.id, order.status)
  return reply.send({ success: true, message: 'Internal notes updated.' })
}

/** PATCH /api/admin/orders/:id/details — Override core order details */
export async function adminUpdateOrderDetailsHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: AdminOrderDetailsBody }>,
  reply: FastifyReply
) {
  const admin = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)

  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  const body = request.body ?? {}
  const db = request.server.db

  const updates: string[] = []
  const values: any[] = []

  const setField = (column: string, value: any) => {
    updates.push(`${column} = ?`)
    values.push(value)
  }

  // Validate + apply cargo type override
  if (body.cargo_type_id !== undefined) {
    if (!Number.isInteger(body.cargo_type_id) || body.cargo_type_id <= 0) {
      return reply.status(400).send({ success: false, message: 'cargo_type_id must be a positive integer.' })
    }
    const [cargoRows] = await db.query<any[]>(`SELECT id FROM cargo_types WHERE id = ? LIMIT 1`, [body.cargo_type_id])
    if (!cargoRows[0]) {
      return reply.status(400).send({ success: false, message: 'Invalid cargo_type_id.' })
    }
    setField('cargo_type_id', body.cargo_type_id)
  }

  if (body.vehicle_type_required !== undefined) {
    const vt = String(body.vehicle_type_required).trim()
    if (!vt) {
      return reply.status(400).send({ success: false, message: 'vehicle_type_required cannot be empty.' })
    }
    setField('vehicle_type_required', vt)
  }

  if (body.estimated_weight_kg !== undefined) {
    if (body.estimated_weight_kg !== null && (typeof body.estimated_weight_kg !== 'number' || body.estimated_weight_kg < 0)) {
      return reply.status(400).send({ success: false, message: 'estimated_weight_kg must be null or a non-negative number.' })
    }
    setField('estimated_weight_kg', body.estimated_weight_kg)
  }

  if (body.pickup_address !== undefined) setField('pickup_address', body.pickup_address)
  if (body.delivery_address !== undefined) setField('delivery_address', body.delivery_address)

  const hasPickupLat = body.pickup_lat !== undefined
  const hasPickupLng = body.pickup_lng !== undefined
  const hasDeliveryLat = body.delivery_lat !== undefined
  const hasDeliveryLng = body.delivery_lng !== undefined

  if (hasPickupLat !== hasPickupLng) {
    return reply.status(400).send({ success: false, message: 'pickup_lat and pickup_lng must be provided together.' })
  }
  if (hasDeliveryLat !== hasDeliveryLng) {
    return reply.status(400).send({ success: false, message: 'delivery_lat and delivery_lng must be provided together.' })
  }

  if (hasPickupLat && hasPickupLng) {
    if (typeof body.pickup_lat !== 'number' || typeof body.pickup_lng !== 'number') {
      return reply.status(400).send({ success: false, message: 'pickup_lat and pickup_lng must be numbers.' })
    }
    setField('pickup_lat', body.pickup_lat)
    setField('pickup_lng', body.pickup_lng)
  }
  if (hasDeliveryLat && hasDeliveryLng) {
    if (typeof body.delivery_lat !== 'number' || typeof body.delivery_lng !== 'number') {
      return reply.status(400).send({ success: false, message: 'delivery_lat and delivery_lng must be numbers.' })
    }
    setField('delivery_lat', body.delivery_lat)
    setField('delivery_lng', body.delivery_lng)
  }

  if (body.special_instructions !== undefined) {
    setField('special_instructions', body.special_instructions)
  }

  // Recalculate route distance + estimated price when pricing-relevant fields changed.
  const recalcPricing =
    body.vehicle_type_required !== undefined ||
    body.estimated_weight_kg !== undefined ||
    hasPickupLat ||
    hasDeliveryLat

  if (recalcPricing) {
    const nextVehicleType = body.vehicle_type_required ?? order.vehicle_type_required
    const nextWeight = body.estimated_weight_kg === undefined
      ? (order.estimated_weight_kg != null ? Number(order.estimated_weight_kg) : undefined)
      : (body.estimated_weight_kg ?? undefined)
    const nextPickupLat = hasPickupLat ? Number(body.pickup_lat) : Number(order.pickup_lat)
    const nextPickupLng = hasPickupLng ? Number(body.pickup_lng) : Number(order.pickup_lng)
    const nextDeliveryLat = hasDeliveryLat ? Number(body.delivery_lat) : Number(order.delivery_lat)
    const nextDeliveryLng = hasDeliveryLng ? Number(body.delivery_lng) : Number(order.delivery_lng)

    if (!nextVehicleType) {
      return reply.status(400).send({ success: false, message: 'vehicle_type_required is required to recalculate pricing.' })
    }

    const rule = await getPricingRule(db, nextVehicleType)
    if (!rule) {
      return reply.status(400).send({ success: false, message: `No pricing rule for vehicle type: ${nextVehicleType}` })
    }

    const distanceKm = await getRouteDistanceKm(nextPickupLat, nextPickupLng, nextDeliveryLat, nextDeliveryLng)
    const quote = calculateQuote(distanceKm, rule as PricingRuleRow, nextWeight)

    setField('distance_km', quote.distance_km)
    setField('base_fare', quote.base_fare)
    setField('per_km_rate', quote.per_km_rate)
    setField('city_surcharge', quote.city_surcharge)
    setField('estimated_price', quote.estimated_price)
  }

  if (updates.length === 0) {
    return reply.status(400).send({ success: false, message: 'No fields to update.' })
  }

  updates.push('updated_at = NOW()')
  updates.push('updated_by = ?')
  values.push(admin.id)
  values.push(order.id)

  await db.query(
    `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`,
    values
  )

  await db.query(
    `INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES (?, ?, ?, ?)`,
    [order.id, order.status, admin.id, body.notes?.trim() || 'Order details overridden by admin']
  )

  const updated = await getOrderById(db, order.id)
  return reply.send({ success: true, message: 'Order details updated.', order: updated })
}

/** POST /api/admin/orders/:id/cancel */
export async function adminCancelOrderHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply:   FastifyReply
) {
  const admin  = request.user as any
  const order  = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  await cancelOrder(request.server.db, order.id, admin.id)
  wsManager.broadcast(order.id, 'STATUS_CHANGED', { status: 'CANCELLED' })

  return reply.send({ success: true, message: 'Order cancelled.' })
}

// ─── Admin Create Order On Behalf ─────────────────────────────────────────────

interface AdminCreateOrderBody {
  // Registered shipper mode
  shipper_id?: string
  // Guest mode
  is_guest?: boolean
  guest_name?: string
  guest_phone?: string
  guest_email?: string
  // Common
  cargo_type_id: number
  vehicle_type: string
  estimated_weight_kg?: number
  pickup_address: string
  pickup_lat: number
  pickup_lng: number
  delivery_address: string
  delivery_lat: number
  delivery_lng: number
  special_instructions?: string
  estimated_value?: number
  driver_id?: string
  vehicle_id?: string
  // Optional media (base64)
  cargo_image?: string
  payment_receipt?: string
}

/** POST /api/admin/orders — admin creates an order on behalf of a shipper or as a guest */
export async function adminCreateOrderOnBehalfHandler(
  request: FastifyRequest<{ Body: AdminCreateOrderBody }>,
  reply:   FastifyReply
) {
  const admin = request.user as any
  const {
    shipper_id, is_guest,
    guest_name, guest_phone, guest_email,
    cargo_type_id, vehicle_type,
    estimated_weight_kg,
    pickup_address, pickup_lat, pickup_lng,
    delivery_address, delivery_lat, delivery_lng,
    special_instructions,
    driver_id, vehicle_id,
    cargo_image, payment_receipt,
  } = request.body

  // Either a registered shipper OR guest mode must be provided
  if (is_guest && shipper_id) {
    return reply.status(400).send({ success: false, message: 'Provide either shipper_id or guest mode, not both.' })
  }
  if (!is_guest && !shipper_id) {
    return reply.status(400).send({ success: false, message: 'shipper_id is required (or set is_guest=true for a guest order).' })
  }
  if (!cargo_type_id || !vehicle_type || !pickup_lat || !pickup_lng || !delivery_lat || !delivery_lng) {
    return reply.status(400).send({ success: false, message: 'cargo_type_id, vehicle_type, and coordinates are required.' })
  }

  const rule = await getPricingRule(request.server.db, vehicle_type)
  if (!rule) {
    return reply.status(400).send({ success: false, message: `No pricing rule for vehicle type: ${vehicle_type}` })
  }

  const distanceKm = await getRouteDistanceKm(pickup_lat, pickup_lng, delivery_lat, delivery_lng)

  // Geocode missing addresses
  const pickupAddr   = pickup_address   || await reverseGeocode(pickup_lat, pickup_lng) || `${pickup_lat},${pickup_lng}`
  const deliveryAddr = delivery_address || await reverseGeocode(delivery_lat, delivery_lng) || `${delivery_lat},${delivery_lng}`

  const quote       = calculateQuote(distanceKm, rule, estimated_weight_kg)
  const pickupOtp   = generateOtp()
  const deliveryOtp = generateOtp()

  // For registered shippers, require enough wallet balance to cover the order.
  if (shipper_id) {
    const { validateOrderPayment } = await import('../services/payment.service.js')
    const paymentValidation = await validateOrderPayment(request.server.db, shipper_id, quote.estimated_price)

    if (!paymentValidation.hasSufficientBalance) {
      return reply.status(402).send({
        success: false,
        message: `Insufficient wallet balance. You need ${paymentValidation.shortfall.toFixed(2)} ETB more.`,
        current_balance: paymentValidation.currentBalance,
        required_balance: quote.estimated_price,
        shortfall: paymentValidation.shortfall,
        action: 'RECHARGE_WALLET',
      })
    }
  }

  // Save optional media files
  let cargoImageUrl:     string | null = null
  let paymentReceiptUrl: string | null = null
  if (cargo_image) {
    try { cargoImageUrl = saveFile(cargo_image, 'order-images', `cargo_${Date.now()}`) } catch { /* ignore */ }
  }
  if (payment_receipt) {
    try { paymentReceiptUrl = saveFile(payment_receipt, 'order-receipts', `receipt_${Date.now()}`) } catch { /* ignore */ }
  }

  // Resolve guest fields
  const resolvedGuestName  = is_guest ? (guest_name?.trim() || `Guest-${Date.now()}`) : null
  const resolvedGuestPhone = is_guest ? (guest_phone?.trim() || process.env.GUEST_DEFAULT_PHONE || '') : null
  const resolvedGuestEmail = is_guest ? (guest_email?.trim() || process.env.GUEST_DEFAULT_EMAIL || '') : null

  const orderId = await createOrder(request.server.db, {
    shipperId:           is_guest ? null : (shipper_id ?? null),
    cargoTypeId:         cargo_type_id,
    pickupLat:           pickup_lat,
    pickupLng:           pickup_lng,
    pickupAddress:       pickupAddr,
    deliveryLat:         delivery_lat,
    deliveryLng:         delivery_lng,
    deliveryAddress:     deliveryAddr,
    estimatedWeightKg:   estimated_weight_kg ?? null,
    vehicleTypeRequired: vehicle_type,
    specialInstructions: special_instructions ?? null,
    distanceKm:          quote.distance_km,
    baseFare:            quote.base_fare,
    perKmRate:           quote.per_km_rate,
    citySurcharge:       quote.city_surcharge,
    estimatedPrice:      quote.estimated_price,
    pickupOtp,
    deliveryOtp,
    orderImage1Url: null,
    orderImage2Url: null,
    cargoImageUrl,
    paymentReceiptUrl,
    isGuestOrder:   is_guest ? true : false,
    guestName:      resolvedGuestName,
    guestPhone:     resolvedGuestPhone,
    guestEmail:     resolvedGuestEmail,
  })

  // Optionally assign driver right away
  if (driver_id) {
    await assignOrderToDriver(request.server.db, orderId, driver_id, vehicle_id ?? null, admin.id)
  }

  const order = await getOrderById(request.server.db, orderId)

  return reply.status(201).send({
    success: true,
    message: 'Order created successfully.',
    order,
    otps: { pickup_otp: pickupOtp, delivery_otp: deliveryOtp },
  })
}

// ─── Cargo Type Handlers ──────────────────────────────────────────────────────

/** GET /api/admin/cargo-types */
export async function adminListCargoTypesHandler(
  request: FastifyRequest,
  reply:   FastifyReply
) {
  const types = await listAllCargoTypes(request.server.db)
  return reply.send({ success: true, cargo_types: types })
}

/** POST /api/admin/cargo-types */
export async function adminCreateCargoTypeHandler(
  request: FastifyRequest<{ Body: { name: string; description?: string; requires_special_handling?: boolean; icon?: string; icon_url?: string } }>,
  reply:   FastifyReply
) {
  const { name, description, requires_special_handling, icon, icon_url } = request.body
  if (!name?.trim()) return reply.status(400).send({ success: false, message: 'Cargo type name is required.' })

  const id = await createCargoType(request.server.db, { name: name.trim(), description, requires_special_handling, icon, icon_url })
  return reply.status(201).send({ success: true, message: 'Cargo type created.', id })
}

/** PUT /api/admin/cargo-types/:id */
export async function adminUpdateCargoTypeHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { name?: string; description?: string; requires_special_handling?: boolean; icon?: string; icon_url?: string; is_active?: boolean } }>,
  reply:   FastifyReply
) {
  await updateCargoType(request.server.db, Number(request.params.id), request.body)
  return reply.send({ success: true, message: 'Cargo type updated.' })
}

// ─── Pricing Rule Handlers ────────────────────────────────────────────────────

interface PricingRuleBody {
  vehicle_type: string
  base_fare: number
  per_km_rate: number
  per_kg_rate?: number
  city_surcharge?: number
  additional_fees?: Array<{ name: string; value: number; type: 'fixed' | 'percent' }>
  min_distance_km?: number
  max_weight_kg?: number
  is_active?: boolean
}

/** GET /api/admin/pricing-rules */
export async function adminListPricingRulesHandler(
  request: FastifyRequest,
  reply:   FastifyReply
) {
  const rules = await listPricingRules(request.server.db)
  return reply.send({ success: true, pricing_rules: rules })
}

/** POST /api/admin/pricing-rules */
export async function adminCreatePricingRuleHandler(
  request: FastifyRequest<{ Body: PricingRuleBody }>,
  reply:   FastifyReply
) {
  const { vehicle_type, base_fare, per_km_rate, per_kg_rate, city_surcharge, additional_fees, min_distance_km, max_weight_kg } = request.body
  if (!vehicle_type || base_fare === undefined || per_km_rate === undefined) {
    return reply.status(400).send({ success: false, message: 'vehicle_type, base_fare, per_km_rate are required.' })
  }
  const [result] = await request.server.db.query<any>(
    `INSERT INTO pricing_rules (vehicle_type, base_fare, per_km_rate, per_kg_rate, city_surcharge, additional_fees, min_distance_km, max_weight_kg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [vehicle_type, base_fare, per_km_rate, per_kg_rate ?? 0, city_surcharge ?? 0, additional_fees ? JSON.stringify(additional_fees) : null, min_distance_km ?? 0, max_weight_kg ?? null]
  )
  return reply.status(201).send({ success: true, message: 'Pricing rule created.', id: result.insertId })
}

/** PUT /api/admin/pricing-rules/:id */
export async function adminUpdatePricingRuleHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: Partial<PricingRuleBody> }>,
  reply:   FastifyReply
) {
  const fields: string[] = []
  const values: any[]   = []
  const b = request.body
  if (b.vehicle_type    !== undefined) { fields.push('vehicle_type = ?');    values.push(b.vehicle_type) }
  if (b.base_fare       !== undefined) { fields.push('base_fare = ?');       values.push(b.base_fare) }
  if (b.per_km_rate     !== undefined) { fields.push('per_km_rate = ?');     values.push(b.per_km_rate) }
  if (b.per_kg_rate     !== undefined) { fields.push('per_kg_rate = ?');     values.push(b.per_kg_rate) }
  if (b.city_surcharge  !== undefined) { fields.push('city_surcharge = ?');  values.push(b.city_surcharge) }
  if (b.additional_fees !== undefined) { fields.push('additional_fees = ?'); values.push(b.additional_fees ? JSON.stringify(b.additional_fees) : null) }
  if (b.min_distance_km !== undefined) { fields.push('min_distance_km = ?'); values.push(b.min_distance_km) }
  if (b.max_weight_kg   !== undefined) { fields.push('max_weight_kg = ?');   values.push(b.max_weight_kg) }
  if (b.is_active       !== undefined) { fields.push('is_active = ?');       values.push(b.is_active ? 1 : 0) }

  if (!fields.length) return reply.status(400).send({ success: false, message: 'No fields to update.' })

  values.push(request.params.id)
  await request.server.db.query(`UPDATE pricing_rules SET ${fields.join(', ')} WHERE id = ?`, values)
  return reply.send({ success: true, message: 'Pricing rule updated.' })
}

/** GET /api/admin/stats/orders — summary counts by status */
export async function adminOrderStatsHandler(
  request: FastifyRequest,
  reply:   FastifyReply
) {
  const [rows] = await request.server.db.query<any[]>(
    `SELECT status, COUNT(*) as cnt FROM orders GROUP BY status`
  )
  const stats: Record<string, number> = {}
  for (const r of rows) stats[r.status] = r.cnt
  const [totalRow] = await request.server.db.query<any[]>(`SELECT COUNT(*) as total FROM orders`)
  const [revenueRow] = await request.server.db.query<any[]>(
    `SELECT SUM(COALESCE(final_price, estimated_price)) as total_revenue FROM orders WHERE status IN ('DELIVERED','COMPLETED')`
  )
  return reply.send({
    success: true,
    stats: {
      by_status: stats,
      total_orders: totalRow[0].total,
      total_revenue: revenueRow[0].total_revenue ?? 0,
    },
  })
}

// ─── Live Driver Tracking ─────────────────────────────────────────────────────

/** GET /api/admin/drivers/live — all drivers with latest location + active order */
export async function adminLiveDriversHandler(
  request: FastifyRequest,
  reply:   FastifyReply
) {
  const drivers = await getActiveDriversWithLocation(request.server.db)
  return reply.send({ success: true, drivers })
}

// ─── Admin Order Messages (chat) ──────────────────────────────────────────────

/** GET /api/admin/orders/:id/messages */
export async function adminGetOrderMessagesHandler(
  request: FastifyRequest<{ Params: { id: string }; Querystring: { channel?: string } }>,
  reply:   FastifyReply
) {
  const admin = request.user as any
  const channel = request.query.channel ?? undefined
  const messages = await getOrderMessages(request.server.db, request.params.id, channel)
  await markMessagesRead(request.server.db, request.params.id, admin.id)
  return reply.send({ success: true, messages })
}

/** POST /api/admin/orders/:id/messages */
export async function adminSendOrderMessageHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { message: string; channel?: string } }>,
  reply:   FastifyReply
) {
  const admin = request.user as any
  if (!request.body.message?.trim()) return reply.status(400).send({ success: false, message: 'Message required.' })
  const channel = request.body.channel ?? 'main'
  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  const msg = await createOrderMessage(request.server.db, request.params.id, admin.id, request.body.message.trim(), channel)
  wsManager.broadcast(request.params.id, 'NEW_MESSAGE', { message: msg })

  if (channel === 'main' || channel === 'shipper') {
    if (order.shipper_id) {
      await sendPushToUser(request.server.db, order.shipper_id, {
        title: `Admin Message: ${order.reference_code}`,
        body: request.body.message.trim().slice(0, 120),
        url: '/dashboard',
        data: { order_id: order.id, reference_code: order.reference_code, channel, type: 'NEW_CHAT_MESSAGE' },
      }).catch(() => {})
    }
  }

  if (channel === 'main' || channel === 'driver') {
    if (order.driver_id) {
      await sendPushToUser(request.server.db, order.driver_id, {
        title: `Admin Message: ${order.reference_code}`,
        body: request.body.message.trim().slice(0, 120),
        url: '/driver/jobs',
        data: { order_id: order.id, reference_code: order.reference_code, channel, type: 'NEW_CHAT_MESSAGE' },
      }).catch(() => {})
    }
  }

  return reply.status(201).send({ success: true, message: msg })
}

/** GET /api/admin/orders/guest — list guest orders only */
export async function adminListGuestOrdersHandler(
  request: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string } }>,
  reply:   FastifyReply
) {
  const page  = parseInt(request.query.page  ?? '1',  10)
  const limit = parseInt(request.query.limit ?? '25', 10)
  const offset = (page - 1) * limit
  const search = request.query.search?.trim()

  const conditions = ['o.is_guest_order = 1']
  const params: any[] = []
  if (search) {
    conditions.push('(o.reference_code LIKE ? OR o.guest_name LIKE ? OR o.guest_phone LIKE ?)')
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  const where = `WHERE ${conditions.join(' AND ')}`
  const [rows] = await request.server.db.query<any[]>(
    `SELECT o.*, ct.name AS cargo_type_name, ct.icon AS cargo_type_icon, ct.icon_url AS cargo_type_icon_url,
            d.first_name AS driver_first_name, d.last_name AS driver_last_name, d.phone_number AS driver_phone
       FROM orders o
       LEFT JOIN cargo_types ct ON ct.id = o.cargo_type_id
       LEFT JOIN users d ON d.id = o.driver_id
       ${where}
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )
  const [countRow] = await request.server.db.query<any[]>(
    `SELECT COUNT(*) as total FROM orders o ${where}`, params
  )
  return reply.send({
    success: true,
    orders: rows,
    pagination: { total: countRow[0].total, page, limit, pages: Math.ceil(countRow[0].total / limit) }
  })
}

// ─── Dispatch Auto-Suggest ────────────────────────────────────────────────────

/** GET /api/admin/orders/:id/suggest-drivers — nearest available drivers to pickup */
export async function adminSuggestDriversHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply:   FastifyReply
) {
  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  if (order.pickup_lat == null || order.pickup_lng == null) {
    return reply.send({ success: true, drivers: [] })
  }

  const drivers = await getSuggestedDriversForOrder(
    request.server.db,
    Number(order.pickup_lat),
    Number(order.pickup_lng)
  )
  return reply.send({ success: true, drivers })
}

// ─── Price Adjustment ─────────────────────────────────────────────────────────

interface AdminPriceAdjustBody {
  final_price: number
  notes?: string
}

/** PATCH /api/admin/orders/:id/price — override final price */
export async function adminUpdateOrderPriceHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: AdminPriceAdjustBody }>,
  reply:   FastifyReply
) {
  const admin = request.user as any
  const { final_price, notes } = request.body

  if (typeof final_price !== 'number' || final_price < 0) {
    return reply.status(400).send({ success: false, message: 'final_price must be a non-negative number.' })
  }

  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  const db = request.server.db
  await db.query('UPDATE orders SET final_price = ?, updated_by = ? WHERE id = ?', [final_price, admin.id, order.id])
  await db.query(
    `INSERT INTO order_status_history (id, order_id, status, changed_by, notes, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [uuidv4(), order.id, order.status, admin.id, `Price adjusted to ${final_price} ETB. ${notes ?? ''}`.trim()]
  )

  return reply.send({ success: true, message: `Price updated to ${final_price} ETB.` })
}

// ─── Driver Ratings (Admin) ───────────────────────────────────────────────────

/** GET /api/admin/drivers/:id/ratings — list all ratings for a driver */
export async function adminGetDriverRatingsHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply:   FastifyReply
) {
  const ratings = await getDriverRatings(request.server.db, request.params.id, false)
  const summary = await getDriverRatingSummary(request.server.db, request.params.id)
  return reply.send({ success: true, ratings, summary })
}

/** DELETE /api/admin/ratings/:id — soft-delete a rating */
export async function adminDeleteRatingHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply:   FastifyReply
) {
  const admin = request.user as any
  const result = await softDeleteRating(request.server.db, request.params.id, admin.id)
  if (!result.ok) return reply.status(404).send({ success: false, message: 'Rating not found.' })
  return reply.send({ success: true, message: 'Rating deleted.' })
}

/** PATCH /api/admin/drivers/:id/status — admin overrides driver status */
export async function adminUpdateDriverStatusHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { status: string } }>,
  reply:   FastifyReply
) {
  const VALID = ['AVAILABLE', 'OFFLINE', 'SUSPENDED', 'ON_JOB']
  const { status } = request.body ?? {}
  if (!status || !VALID.includes(status)) {
    return reply.status(400).send({ success: false, message: `status must be one of: ${VALID.join(', ')}` })
  }
  await adminSetDriverStatus(
    request.server.db,
    request.params.id,
    status as 'AVAILABLE' | 'OFFLINE' | 'SUSPENDED' | 'ON_JOB'
  )
  return reply.send({ success: true, message: `Driver status set to ${status}.` })
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── FINANCIAL/PAYMENT MANAGEMENT (ADMIN) ───────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/payments/pending
 * List pending manual payment submissions for admin review
 */
export async function getPendingPaymentsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { limit = 50, offset = 0, status = 'PENDING' } = request.query as { limit: number; offset: number; status: string }

  try {
    const { getPendingManualPayments } = await import('../services/payment.service.js')

    const { records, total } = await getPendingManualPayments(
      request.server.db,
      Math.min(Number(limit), 100),
      Number(offset),
      status
    )

    return reply.send({
      success: true,
      payments: records.map((r) => ({
        id: r.id,
        wallet_id: r.wallet_id,
        user_id: r.user_id,
        user_name: `${r.first_name} ${r.last_name}`,
        user_phone: r.phone_number,
        user_email: r.email || '',
        amount: Number(r.amount),
        action_type: r.action_type,
        reason: r.reason,
        proof_image_url: r.proof_image_url,
        status: r.status,
        submitted_at: r.submitted_at,
        current_balance: Number(r.balance),
      })),
      total,
      limit,
      offset,
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to fetch pending payments' })
  }
}

/**
 * POST /api/admin/payments/:recordId/approve
 * Approve a manual payment submission and credit/debit wallet
 */
export async function approveManualPaymentHandler(
  request: FastifyRequest<{ Params: { recordId: string }; Body: { notes?: string } }>,
  reply: FastifyReply
) {
  const admin = request.user as any
  const { recordId } = request.params
  const { notes } = request.body

  try {
    const { approveManualPayment } = await import('../services/payment.service.js')
    const { sendPushToUser } = await import('../services/push.service.js')
    const { sendEmail } = await import('../services/email.service.js')

    // Get the payment record
    const [[record]] = await request.server.db.query<any[]>(
      `SELECT mpr.*, w.user_id, u.email, u.first_name FROM manual_payment_records mpr
       JOIN wallets w ON w.id = mpr.wallet_id
       JOIN users u ON u.id = w.user_id
       WHERE mpr.id = ?`,
      [recordId]
    )

    if (!record) {
      return reply.status(404).send({ success: false, message: 'Payment record not found' })
    }

    if (record.status !== 'PENDING') {
      return reply.status(400).send({ success: false, message: 'Only pending payments can be approved' })
    }

    // Approve payment
    await approveManualPayment(request.server.db, recordId, record.user_id, admin.id, notes)

    // Send notifications (don't let failures here block the response)
    try {
      await sendPushToUser(request.server.db, record.user_id, {
        title: record.action_type === 'DEPOSIT' ? 'Deposit Approved' : 'Withdrawal Approved',
        body: `Your ${record.action_type.toLowerCase()} of ${Number(record.amount).toFixed(2)} ETB has been approved.`,
        url: '/wallet',
        data: { type: 'payment_approved', record_id: recordId }
      })
    } catch (pushErr: any) {
      request.server.log.warn({ pushErr }, 'Failed to send push notification')
    }

    if (record.email) {
      try {
        await sendEmail({
          to: record.email,
          subject: `${record.action_type} Approved - ${Number(record.amount).toFixed(2)} ETB`,
          text: `Your ${record.action_type.toLowerCase()} request has been approved.\n\nAmount: ${Number(record.amount).toFixed(2)} ETB\nReason: ${record.reason}\n\nCheck your wallet in the app.`
        })
      } catch (emailErr: any) {
        request.server.log.warn({ emailErr }, 'Failed to send email notification')
      }
    }

    return reply.send({
      success: true,
      message: `Payment approved. Wallet updated with ${Number(record.amount).toFixed(2)} ETB.`,
    })
  } catch (err) {
    request.server.log.error(err)
    if (err instanceof Error && err.message.includes('insufficient balance')) {
      return reply.status(400).send({ success: false, message: err.message })
    }
    return reply.status(500).send({ success: false, message: 'Failed to approve payment' })
  }
}

/**
 * POST /api/admin/payments/:recordId/reject
 * Reject a manual payment submission
 */
export async function rejectManualPaymentHandler(
  request: FastifyRequest<{ Params: { recordId: string }; Body: { reason: string } }>,
  reply: FastifyReply
) {
  const admin = request.user as any
  const { recordId } = request.params
  const { reason } = request.body

  if (!reason?.trim()) {
    return reply.status(400).send({ success: false, message: 'Rejection reason is required' })
  }

  try {
    const { rejectManualPayment } = await import('../services/payment.service.js')
    const { sendPushToUser } = await import('../services/push.service.js')
    const { sendEmail } = await import('../services/email.service.js')

    // Get the payment record
    const [[record]] = await request.server.db.query<any[]>(
      `SELECT mpr.*, w.user_id, u.email, u.first_name FROM manual_payment_records mpr
       JOIN wallets w ON w.id = mpr.wallet_id
       JOIN users u ON u.id = w.user_id
       WHERE mpr.id = ?`,
      [recordId]
    )

    if (!record) {
      return reply.status(404).send({ success: false, message: 'Payment record not found' })
    }

    if (record.status !== 'PENDING') {
      return reply.status(400).send({ success: false, message: 'Only pending payments can be rejected' })
    }

    // Reject payment
    await rejectManualPayment(request.server.db, recordId, admin.id, reason)

    // Send notifications (don't let failures here block the response)
    try {
      await sendPushToUser(request.server.db, record.user_id, {
        title: 'Payment Rejected',
        body: `Your ${record.action_type.toLowerCase()} request was rejected: ${reason}`,
        url: '/wallet',
        data: { type: 'payment_rejected', record_id: recordId }
      })
    } catch (pushErr: any) {
      request.server.log.warn({ pushErr }, 'Failed to send push notification')
    }

    if (record.email) {
      try {
        await sendEmail({
          to: record.email,
          subject: `${record.action_type} Rejected`,
          text: `Your ${record.action_type.toLowerCase()} request has been rejected.\n\nAmount: ${Number(record.amount).toFixed(2)} ETB\nReason: ${reason}`
        })
      } catch (emailErr: any) {
        request.server.log.warn({ emailErr }, 'Failed to send email notification')
      }
    }

    return reply.send({
      success: true,
      message: 'Payment rejected. User notified.',
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to reject payment' })
  }
}

/**
 * POST /api/admin/wallets/:userId/adjust
 * Admin can manually adjust wallet balance (for emergency corrections)
 * Body: { action: 'DEPOSIT'|'WITHDRAWAL'|'REFUND', amount, reason }
 */
export async function adminAdjustWalletHandler(
  request: FastifyRequest<{ Params: { userId: string }; Body: { action: string; amount: number; reason: string } }>,
  reply: FastifyReply
) {
  const admin = request.user as any
  const { userId } = request.params
  const { action, amount, reason } = request.body

  if (!['DEPOSIT', 'WITHDRAWAL', 'REFUND', 'ADJUSTMENT'].includes(action)) {
    return reply.status(400).send({ success: false, message: 'Invalid action' })
  }

  if (!amount || amount <= 0 || amount > 100000000) {
    return reply.status(400).send({ success: false, message: 'Amount must be positive' })
  }

  if (!reason?.trim()) {
    return reply.status(400).send({ success: false, message: 'Reason is required' })
  }

  try {
    const { getOrCreateWallet, addWalletTransaction, checkSufficientBalance } = await import('../services/wallet.service.js')
    const { sendPushToUser } = await import('../services/push.service.js')
    const { sendEmail } = await import('../services/email.service.js')

    const wallet = await getOrCreateWallet(request.server.db, userId)
    const adminWallet = await getOrCreateWallet(request.server.db, admin.id)
    const isCreditToUser = ['DEPOSIT', 'REFUND'].includes(action)

    if (isCreditToUser) {
      const hasAdminBalance = await checkSufficientBalance(request.server.db, admin.id, Number(amount))
      if (!hasAdminBalance) {
        return reply.status(400).send({ success: false, message: 'Admin wallet has insufficient balance for this transfer' })
      }
    }

    // Mirror transfer on admin wallet for complete accounting.
    await addWalletTransaction(
      request.server.db,
      admin.id,
      isCreditToUser ? 'DEBIT' : 'CREDIT',
      Number(amount),
      `Admin wallet ${isCreditToUser ? 'transfer out' : 'transfer in'}: ${action} for user ${userId}`,
      undefined,
      undefined,
      userId,
      { admin_adjustment: true, reason, admin_id: admin.id, user_wallet_id: wallet.id, admin_wallet_id: adminWallet.id }
    )

    // Create transaction
    const txType = isCreditToUser ? 'CREDIT' : 'DEBIT'
    const txId = await addWalletTransaction(
      request.server.db,
      userId,
      txType as any,
      Number(amount),
      `Admin ${action}: ${reason}`,
      undefined,
      undefined,
      admin.id,
      { admin_adjustment: true, reason, admin_id: admin.id, balanced_against_admin_wallet: true }
    )

    // Send notifications
    const [[user]] = await request.server.db.query<any[]>(
      `SELECT email, first_name FROM users WHERE id = ?`,
      [userId]
    )

    await sendPushToUser(request.server.db, userId, {
      title: 'Wallet Adjusted',
      body: `Admin adjustment: ${action === 'DEPOSIT' || action === 'REFUND' ? '+' : '-'}${Number(amount).toFixed(2)} ETB`,
      url: '/wallet',
      data: { type: 'wallet_adjusted', transaction_id: txId }
    }).catch(() => {})

    if (user?.email) {
      sendEmail({
        to: user.email,
        subject: `Wallet Adjusted - ${action}`,
        text: `Your wallet has been adjusted by admin.\n\nAction: ${action}\nAmount: ${Number(amount).toFixed(2)} ETB\nReason: ${reason}`
      }).catch(() => {})
    }

    const newWallet = await getOrCreateWallet(request.server.db, userId)

    return reply.send({
      success: true,
      message: `Wallet adjusted. New balance: ${Number(newWallet.balance).toFixed(2)} ETB`,
      transaction_id: txId,
      new_balance: Number(newWallet.balance),
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to adjust wallet' })
  }
}

/**
 * GET /api/admin/wallet
 * Get current admin wallet balance and summary
 */
export async function getAdminWalletHandler(request: FastifyRequest, reply: FastifyReply) {
  const admin = request.user as any

  try {
    const { getOrCreateWallet } = await import('../services/wallet.service.js')
    const wallet = await getOrCreateWallet(request.server.db, admin.id)

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
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to fetch admin wallet' })
  }
}

/**
 * GET /api/admin/wallet/transactions?limit=50&offset=0
 * Get admin wallet transactions
 */
export async function getAdminWalletTransactionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const admin = request.user as any
  const { limit = 50, offset = 0 } = request.query as { limit: number; offset: number }

  try {
    const { getWalletTransactionHistory } = await import('../services/wallet.service.js')
    const { transactions, total } = await getWalletTransactionHistory(
      request.server.db,
      admin.id,
      Math.min(Number(limit), 100),
      Number(offset)
    )

    return reply.send({
      success: true,
      transactions: transactions.map((t: any) => ({
        id: t.id,
        type: t.transaction_type,
        amount: Number(t.amount),
        description: t.description,
        reference_code: t.reference_code,
        status: t.status,
        created_at: t.created_at,
      })),
      total,
      limit: Number(limit),
      offset: Number(offset),
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to fetch admin wallet transactions' })
  }
}

/**
 * POST /api/admin/wallet/refill
 * Refill admin wallet and record transaction history
 */
export async function refillAdminWalletHandler(
  request: FastifyRequest<{ Body: { amount: number; reason?: string } }>,
  reply: FastifyReply
) {
  const admin = request.user as any
  const { amount, reason } = request.body

  if (!amount || amount <= 0) {
    return reply.status(400).send({ success: false, message: 'Amount must be positive' })
  }

  try {
    const { addWalletTransaction, getOrCreateWallet } = await import('../services/wallet.service.js')
    await getOrCreateWallet(request.server.db, admin.id)

    const txId = await addWalletTransaction(
      request.server.db,
      admin.id,
      'CREDIT',
      Number(amount),
      `Admin wallet refill${reason?.trim() ? `: ${reason.trim()}` : ''}`,
      undefined,
      undefined,
      admin.id,
      { source: 'admin_refill' }
    )

    return reply.send({
      success: true,
      message: 'Admin wallet refilled successfully',
      transaction_id: txId,
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to refill admin wallet' })
  }
}

/**
 * GET /api/admin/wallet-stats
 * Get overall wallet and financial statistics
 */
export async function getWalletStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { getWalletStats } = await import('../services/wallet.service.js')

    const stats = await getWalletStats(request.server.db)

    // Get additional stats
    const [[paymentStats]] = await request.server.db.query<any[]>(
      `SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN transaction_type IN ('CREDIT','BONUS') THEN amount ELSE 0 END) as total_credited,
        SUM(CASE WHEN transaction_type IN ('DEBIT','COMMISSION') THEN amount ELSE 0 END) as total_debited
       FROM wallet_transactions`
    )

    const [[manualPaymentStats]] = await request.server.db.query<any[]>(
      `SELECT
        COUNT(*) as total_manual,
        SUM(CASE WHEN action_type = 'DEPOSIT' THEN amount ELSE 0 END) as total_deposits,
        SUM(CASE WHEN action_type = 'WITHDRAWAL' THEN amount ELSE 0 END) as total_withdrawals,
        SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END) as pending_amount
       FROM manual_payment_records`
    )

    return reply.send({
      success: true,
      wallet_summary: {
        total_wallets: stats.totalWallets,
        total_balance: stats.totalBalance,
        total_earned: stats.totalEarned,
        total_spent: stats.totalSpent,
      },
      transaction_summary: {
        total_transactions: Number(paymentStats.total_transactions),
        total_credited: Number(paymentStats.total_credited),
        total_debited: Number(paymentStats.total_debited),
      },
      manual_payment_summary: {
        total_manual_records: Number(manualPaymentStats.total_manual),
        total_deposits: Number(manualPaymentStats.total_deposits),
        total_withdrawals: Number(manualPaymentStats.total_withdrawals),
        pending_amount: Number(manualPaymentStats.pending_amount),
      },
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to fetch wallet stats' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── PERFORMANCE BONUS MANAGEMENT (ADMIN) ───────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/drivers/performance-metrics?limit=50&offset=0
 * Get all drivers' performance metrics for dashboard
 */
export async function getPerformanceMetricsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { limit = 50, offset = 0, sort_by = 'rating' } = request.query as {
    limit: number
    offset: number
    sort_by?: 'bonus' | 'trips' | 'rating'
  }

  try {
    const { getAllDriverMetrics } = await import('../services/performance.service.js')

    const { metrics, total } = await getAllDriverMetrics(
      request.server.db,
      Math.min(Number(limit), 100),
      Number(offset),
      sort_by === 'bonus' || sort_by === 'trips' || sort_by === 'rating' ? sort_by : 'rating'
    )

    return reply.send({
      success: true,
      metrics: metrics.map((m: any) => ({
        user_id: m.driver_id,
        first_name: m.first_name,
        last_name: m.last_name,
        email: m.email ?? '',
        phone_number: m.phone_number,
        total_trips: m.total_trips,
        on_time_delivery_rate: Number(m.on_time_percentage) / 100,
        average_rating: Number(m.average_rating),
        eligible_bonus_amount: Number(m.bonus_earned),
        eligible_bonus_tier: Number(m.bonus_earned) >= 500 ? 'TIER_1' : Number(m.bonus_earned) >= 200 ? 'TIER_2' : Number(m.bonus_earned) > 0 ? 'TIER_3' : 'NOT_ELIGIBLE',
        streak_days: m.streak_days,
        last_delivery_date: m.last_trip_date ?? null,
      })),
      has_more: total > Number(offset) + Math.min(Number(limit), 100),
      total,
      limit: Number(limit),
      offset: Number(offset),
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to fetch performance metrics' })
  }
}

/**
 * POST /api/admin/bonuses/process
 * Manually trigger batch bonus processing for all eligible drivers
 */
export async function processPerfBonusesHandler(request: FastifyRequest, reply: FastifyReply) {
  const admin = request.user as any

  try {
    const { batchProcessPerformanceBonuses } = await import('../services/performance.service.js')
    const { sendPushToUser } = await import('../services/push.service.js')
    const { sendEmail } = await import('../services/email.service.js')

    const result = await batchProcessPerformanceBonuses(request.server.db)

    // Notify drivers about bonuses received (async)
    for (const detail of result.details) {
      const [[driver]] = await request.server.db.query<any[]>(
        `SELECT email, first_name FROM users WHERE id = ?`,
        [detail.driverId]
      )

      if (driver) {
        await sendPushToUser(request.server.db, detail.driverId, {
          title: `🎉 Performance Bonus Received!`,
          body: `You've earned ${detail.bonus.toFixed(2)} ETB (${detail.tier})`,
          url: '/wallet',
          data: { type: 'bonus_received', amount: detail.bonus }
        }).catch(() => {})

        if (driver.email) {
          sendEmail({
            to: driver.email,
            subject: 'Performance Bonus Credited',
            text: `Congratulations! You've received a performance bonus of ${detail.bonus.toFixed(2)} ETB.\n\nTier: ${detail.tier}\n\nCheck your wallet in the app.`
          }).catch(() => {})
        }
      }
    }

    return reply.send({
      success: true,
      message: `Processed bonuses for ${result.processed} drivers`,
      total_bonus_amount: result.totalBonus,
      details: result.details,
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to process bonuses' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── SYSTEM NOTIFICATION SETTINGS (7.5 Admin Control Panel) ─────────────────
// ─────────────────────────────────────────────────────────────────────────────

const NOTIF_SETTING_KEYS = [
  'email_order_updates',
  'email_payment_alerts',
  'push_order_updates',
  'push_driver_job_alerts',
  'push_admin_alerts',
  'email_admin_alerts',
] as const

/** GET /api/admin/notification-settings */
export async function getNotifSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const [rows] = await request.server.db.query<any[]>(
    'SELECT * FROM system_notification_settings WHERE id = 1 LIMIT 1'
  )
  const row = rows[0] ?? {}
  const settings: Record<string, boolean> = {}
  for (const k of NOTIF_SETTING_KEYS) {
    settings[k] = Number(row[k] ?? 1) === 1
  }
  return reply.send({ success: true, settings })
}

/** PUT /api/admin/notification-settings */
export async function updateNotifSettingsHandler(
  request: FastifyRequest<{ Body: Record<string, boolean> }>,
  reply: FastifyReply
) {
  const admin = request.user as any
  const b = request.body ?? {}
  const fields: string[] = []
  const vals: any[] = []

  for (const k of NOTIF_SETTING_KEYS) {
    if (b[k] !== undefined) {
      fields.push(`${k} = ?`)
      vals.push(b[k] ? 1 : 0)
    }
  }

  if (!fields.length) {
    return reply.status(400).send({ success: false, message: 'No valid settings provided.' })
  }

  fields.push('updated_by = ?')
  vals.push(admin.id)

  await request.server.db.query(
    `UPDATE system_notification_settings SET ${fields.join(', ')} WHERE id = 1`,
    vals
  )

  return reply.send({ success: true, message: 'Notification settings saved.' })
}