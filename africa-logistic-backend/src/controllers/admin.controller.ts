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
      dp.is_verified AS is_driver_verified
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
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
  return reply.send({ success: true, driver_profile: profile, document_reviews: reviews })
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

