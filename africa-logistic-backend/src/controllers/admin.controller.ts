import { FastifyRequest, FastifyReply } from 'fastify'
import {
  listDriversForAdmin,
  reviewDriverDocument,
  verifyDriver,
  rejectDriver,
  getDriverProfile,
  getDocumentReviews,
  listVehicles,
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
  vehicle_photo?: string  // base64
  description?: string
}

interface UpdateVehicleBody {
  plate_number?: string
  vehicle_type?: string
  max_capacity_kg?: number
  is_company_owned?: boolean
  vehicle_photo?: string  // base64
  description?: string
  is_active?: boolean
}

interface AssignDriverBody {
  driver_id: string
}

// ─── Helper ───────────────────────────────────────────────────────────────────

import fs from 'fs'
import path from 'path'

function saveVehiclePhoto(base64Data: string, vehicleId: string): string {
  const match = base64Data.match(/^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/)
  const raw = match ? match[2] : base64Data
  const mime = match ? match[1] : 'image/jpeg'
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp',
  }
  const ext = extMap[mime] ?? 'jpg'
  const dir = path.join(process.cwd(), 'uploads', 'vehicles')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const filename = `${vehicleId}_${Date.now()}.${ext}`
  fs.writeFileSync(path.join(dir, filename), Buffer.from(raw, 'base64'))
  return `/uploads/vehicles/${filename}`
}

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
      r.role_name AS role_name
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
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

  const { plate_number, vehicle_type, max_capacity_kg, is_company_owned, vehicle_photo, description } = request.body

  if (!plate_number || !vehicle_type || max_capacity_kg === undefined) {
    return reply.status(400).send({ message: 'plate_number, vehicle_type, and max_capacity_kg are required.' })
  }

  // Generate a temp id for photo naming; the real id will come from createVehicle
  const tempId = `tmp_${Date.now()}`
  let photoUrl: string | null = null
  if (vehicle_photo) {
    photoUrl = saveVehiclePhoto(vehicle_photo, tempId)
  }

  const vehicleId = await createVehicle(request.server.db, {
    plateNumber: plate_number,
    vehicleType: vehicle_type,
    maxCapacityKg: max_capacity_kg,
    isCompanyOwned: is_company_owned ?? false,
    vehiclePhotoUrl: photoUrl,
    description: description ?? null,
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

  if (body.vehicle_photo) {
    photoUrl = saveVehiclePhoto(body.vehicle_photo, request.params.id)
  }

  await updateVehicle(db, request.params.id, {
    plateNumber:    body.plate_number,
    vehicleType:    body.vehicle_type,
    maxCapacityKg:  body.max_capacity_kg,
    isCompanyOwned: body.is_company_owned,
    vehiclePhotoUrl: photoUrl,
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
