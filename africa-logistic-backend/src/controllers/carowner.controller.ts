import { FastifyRequest, FastifyReply } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { RowDataPacket } from 'mysql2'
import { assignDriverToVehicle } from '../services/vehicle-assignment.service.js'
import { saveFile } from '../utils/uploads.js'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Matches the platform fleet, so both kinds of vehicle behave the same. */
const MAX_GALLERY_IMAGES = 5
const VEHICLE_UPLOAD_DIR = 'car-owner-vehicles'

const UPLOAD_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  allowedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
}

export const OPERATIONAL_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const

const OPERATIONAL_LABELS: Record<string, string> = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  MAINTENANCE: 'in maintenance',
  OUT_OF_SERVICE: 'out of service',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegisterCarBody {
  /** base64 main photo */
  vehicle_photo?: string
  /** base64 gallery, capped at MAX_GALLERY_IMAGES */
  vehicle_images?: string[]
  /** base64 libre / ownership document */
  libre_file?: string
  plate_number:    string
  vehicle_type:    string
  model?:          string
  color?:          string
  year?:           number
  max_capacity_kg?: number
  description?:    string
}

interface ReviewCarBody {
  action:     'APPROVED' | 'REJECTED'
  admin_note?: string
}

interface AssignDriverBody {
  driver_id: string | null  // null to unassign
}

// ─── Car Owner: list own vehicles ─────────────────────────────────────────────

export async function coListVehiclesHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const db  = request.server.db
  const uid = (request as any).user.id

  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT
      cov.*,
      CONCAT(u.first_name,' ',u.last_name) AS assigned_driver_name,
      u.phone_number                        AS assigned_driver_phone
    FROM car_owner_vehicles cov
    LEFT JOIN users u ON u.id = cov.assigned_driver_id
    WHERE cov.owner_id = ?
    ORDER BY cov.created_at DESC
  `, [uid])

  return reply.send({ success: true, vehicles: rows })
}

// ─── Car Owner: register a new vehicle ────────────────────────────────────────

export async function coRegisterVehicleHandler(
  request: FastifyRequest<{ Body: RegisterCarBody }>,
  reply: FastifyReply
) {
  const db  = request.server.db
  const uid = (request as any).user.id
  const {
    plate_number, vehicle_type, model, color, year, max_capacity_kg, description,
    vehicle_photo, vehicle_images, libre_file,
  } = request.body

  if (!plate_number?.trim() || !vehicle_type?.trim()) {
    return reply.status(400).send({ success: false, message: 'plate_number and vehicle_type are required.' })
  }

  const plate = plate_number.trim().toUpperCase()

  // The plate is UNIQUE, so tell the owner plainly rather than letting the
  // insert fail with a raw database error.
  const [[clash]] = await db.query<RowDataPacket[]>(
    `SELECT id FROM car_owner_vehicles WHERE plate_number = ? LIMIT 1`, [plate]
  )
  if (clash) {
    return reply.status(409).send({ success: false, message: `A vehicle with plate ${plate} is already registered.` })
  }

  const id = uuidv4()

  // Every document is optional. A failed upload must never lose the vehicle the
  // owner just filled in, so each is attempted independently.
  let photoUrl: string | null = null
  let libreUrl: string | null = null
  let galleryUrls: string[] = []

  try {
    if (vehicle_photo) {
      photoUrl = saveFile(vehicle_photo, VEHICLE_UPLOAD_DIR, `cov_${id}_photo`, UPLOAD_LIMITS)
    }
    if (libre_file) {
      libreUrl = saveFile(libre_file, VEHICLE_UPLOAD_DIR, `cov_${id}_libre`, UPLOAD_LIMITS)
    }
    if (Array.isArray(vehicle_images)) {
      galleryUrls = vehicle_images
        .slice(0, MAX_GALLERY_IMAGES)
        .map((img, i) => saveFile(img, VEHICLE_UPLOAD_DIR, `cov_${id}_img${i + 1}`, UPLOAD_LIMITS))
    }
  } catch (err: any) {
    return reply.status(400).send({
      success: false,
      message: err?.message ?? 'One of the uploaded files could not be saved.',
    })
  }

  await db.query(`
    INSERT INTO car_owner_vehicles
      (id, owner_id, plate_number, vehicle_type, model, color, year, max_capacity_kg, description,
       vehicle_photo_url, vehicle_images, libre_url, libre_status, status, operational_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'ACTIVE')
  `, [
    id, uid, plate, vehicle_type.trim(),
    model || null, color || null, year || null, max_capacity_kg || null, description || null,
    photoUrl,
    galleryUrls.length ? JSON.stringify(galleryUrls) : null,
    libreUrl,
    // Only a document that exists can be awaiting review.
    libreUrl ? 'PENDING' : null,
  ])

  return reply.status(201).send({ success: true, message: 'Vehicle registered. Awaiting admin approval.', vehicle_id: id })
}

/**
 * PATCH /api/car-owner/vehicles/:id/operational-status
 *
 * The owner's own control over whether a truck is working today. Independent of
 * the admin approval status, which the owner can never change.
 */
export async function coUpdateOperationalStatusHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { operational_status: string; note?: string } }>,
  reply: FastifyReply
) {
  const db  = request.server.db
  const uid = (request as any).user.id
  const { operational_status, note } = request.body ?? ({} as any)

  if (!OPERATIONAL_STATUSES.includes(operational_status as any)) {
    return reply.status(400).send({
      success: false,
      message: `operational_status must be one of: ${OPERATIONAL_STATUSES.join(', ')}`,
    })
  }

  const [[vehicle]] = await db.query<RowDataPacket[]>(
    `SELECT id, status, assigned_driver_id FROM car_owner_vehicles WHERE id = ? AND owner_id = ? LIMIT 1`,
    [request.params.id, uid]
  )
  if (!vehicle) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })

  // Taking a truck off the road while its driver is mid-delivery would strand
  // the job, so that has to wait until the driver is free.
  if (operational_status !== 'ACTIVE' && vehicle.assigned_driver_id) {
    const [[driver]] = await db.query<RowDataPacket[]>(
      `SELECT status FROM driver_profiles WHERE user_id = ? LIMIT 1`,
      [vehicle.assigned_driver_id]
    )
    if (driver?.status === 'ON_JOB') {
      return reply.status(409).send({
        success: false,
        message: 'The assigned driver is currently on a job. Wait until the delivery is finished.',
      })
    }
  }

  await db.query(
    `UPDATE car_owner_vehicles
        SET operational_status = ?, operational_status_note = ?, operational_status_changed_at = NOW()
      WHERE id = ? AND owner_id = ?`,
    [operational_status, note?.trim() || null, request.params.id, uid]
  )

  return reply.send({
    success: true,
    message: `Vehicle marked ${OPERATIONAL_LABELS[operational_status] ?? operational_status}.`,
    operational_status,
  })
}

// ─── Car Owner: delete own pending vehicle ────────────────────────────────────

export async function coDeleteVehicleHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const db  = request.server.db
  const uid = (request as any).user.id
  const { id } = request.params

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, status, assigned_driver_id FROM car_owner_vehicles WHERE id = ? AND owner_id = ? LIMIT 1`,
    [id, uid]
  )
  if (!(rows as any[]).length) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })
  if ((rows as any[])[0].status === 'APPROVED' && (rows as any[])[0].assigned_driver_id) {
    return reply.status(400).send({ success: false, message: 'Cannot delete a vehicle with an assigned driver. Ask admin to unassign first.' })
  }

  await db.query(`DELETE FROM car_owner_vehicles WHERE id = ? AND owner_id = ?`, [id, uid])
  return reply.send({ success: true, message: 'Vehicle removed.' })
}

// ─── Car Owner: eligible verified drivers for one approved vehicle ──────────

export async function coListEligibleDriversHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const ownerId = (request as any).user.id
  const { id } = request.params

  const [[vehicle]] = await db.query<RowDataPacket[]>(
    `SELECT id, plate_number, vehicle_type, status, assigned_driver_id
       FROM car_owner_vehicles
      WHERE id = ? AND owner_id = ?
      LIMIT 1`,
    [id, ownerId]
  )
  if (!vehicle) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })
  if (vehicle.status !== 'APPROVED') {
    return reply.status(403).send({ success: false, message: 'Your vehicle must be approved by an admin before you can view or assign drivers.' })
  }

  // Deliberately return only the identity and qualification data a car owner
  // needs. Phone, email, address, Libre, and internal driver data stay private.
  const [drivers] = await db.query<RowDataPacket[]>(`
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      u.profile_photo_url,
      dp.status,
      dp.rating,
      dp.total_trips,
      dp.national_id_url,
      dp.license_url,
      dp.national_id_status,
      dp.license_status,
      CASE WHEN cov_current.assigned_driver_id = u.id THEN 1 ELSE 0 END AS is_currently_assigned
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN car_owner_vehicles cov_current ON cov_current.id = ?
    WHERE u.role_id = 3
      AND u.is_active = 1
      AND dp.is_verified = 1
      AND dp.status <> 'SUSPENDED'
      AND dp.national_id_status = 'APPROVED'
      AND dp.license_status = 'APPROVED'
      AND dp.national_id_url IS NOT NULL
      AND dp.license_url IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM vehicles v
         WHERE v.driver_id = u.id AND v.is_active = 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM car_owner_vehicles other
         WHERE other.assigned_driver_id = u.id AND other.id <> ?
      )
    ORDER BY is_currently_assigned DESC, u.first_name ASC, u.last_name ASC
  `, [id, id])

  return reply.send({
    success: true,
    vehicle: {
      id: vehicle.id,
      plate_number: vehicle.plate_number,
      vehicle_type: vehicle.vehicle_type,
      assigned_driver_id: vehicle.assigned_driver_id,
    },
    drivers,
  })
}

// ─── Car Owner: assign/unassign a verified driver to own approved vehicle ───

export async function coAssignDriverHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: AssignDriverBody }>,
  reply: FastifyReply
) {
  const ownerId = (request as any).user.id

  try {
    const result = await assignDriverToVehicle({
      pool: request.server.db,
      scope: 'INDIVIDUAL',
      vehicleId: request.params.id,
      driverId: request.body?.driver_id ?? null,
      // Scoped to the caller so an owner can only ever touch their own vehicle.
      ownerScope: { column: 'owner_id', value: ownerId },
    })
    if (!result.ok) return reply.status(result.status).send({ success: false, message: result.message })
    return reply.send({ success: true, message: result.message })
  } catch (error) {
    request.server.log.error(error)
    return reply.status(500).send({ success: false, message: 'Failed to update the driver assignment.' })
  }
}

// ─── Admin: list all car owner vehicles ───────────────────────────────────────

export async function adminListCarOwnerVehiclesHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const db = request.server.db

  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT
      cov.*,
      CONCAT(owner.first_name,' ',owner.last_name) AS owner_name,
      owner.phone_number                            AS owner_phone,
      CONCAT(drv.first_name,' ',drv.last_name)      AS assigned_driver_name,
      drv.phone_number                              AS assigned_driver_phone
    FROM car_owner_vehicles cov
    JOIN  users owner ON owner.id = cov.owner_id
    LEFT JOIN users drv   ON drv.id   = cov.assigned_driver_id
    ORDER BY cov.created_at DESC
  `)

  return reply.send({ success: true, vehicles: rows })
}

// ─── Admin: review (approve/reject) a car owner vehicle ──────────────────────

export async function adminReviewCarOwnerVehicleHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: ReviewCarBody }>,
  reply: FastifyReply
) {
  const db      = request.server.db
  const adminId = (request as any).user.id
  const { id }  = request.params
  const { action, admin_note } = request.body

  if (!['APPROVED', 'REJECTED'].includes(action)) {
    return reply.status(400).send({ success: false, message: 'action must be APPROVED or REJECTED.' })
  }

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM car_owner_vehicles WHERE id = ? LIMIT 1`, [id]
  )
  if (!(rows as any[]).length) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })

  await db.query(`
    UPDATE car_owner_vehicles
    SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
    WHERE id = ?
  `, [action, admin_note || null, adminId, id])

  return reply.send({ success: true, message: `Vehicle ${action.toLowerCase()}.` })
}

// ─── Admin: assign or unassign a driver to a car-owner vehicle ────────────────

export async function adminAssignDriverToCarOwnerVehicleHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: AssignDriverBody }>,
  reply: FastifyReply
) {
  try {
    const result = await assignDriverToVehicle({
      pool: request.server.db,
      scope: 'INDIVIDUAL',
      vehicleId: request.params.id,
      driverId: request.body?.driver_id ?? null,
      // No ownerScope: an admin may act on any owner's vehicle.
    })
    if (!result.ok) return reply.status(result.status).send({ success: false, message: result.message })
    return reply.send({ success: true, message: result.message })
  } catch (error) {
    request.server.log.error(error)
    return reply.status(500).send({ success: false, message: 'Failed to update the driver assignment.' })
  }
}

// ─── Admin: get list of verified drivers (for dropdown) ──────────────────────

export async function adminListDriversForCarAssignHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const db = request.server.db

  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT
      u.id, u.first_name, u.last_name, u.phone_number,
      dp.is_verified, dp.status,
      (SELECT v.plate_number FROM vehicles v WHERE v.driver_id = u.id LIMIT 1) AS main_vehicle_plate,
      (SELECT cov.plate_number FROM car_owner_vehicles cov WHERE cov.assigned_driver_id = u.id LIMIT 1) AS owner_vehicle_plate
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.role_id = 3 AND u.is_active = 1 AND dp.is_verified = 1 AND dp.status <> 'SUSPENDED'
    ORDER BY u.first_name, u.last_name
  `)

  return reply.send({ success: true, drivers: rows })
}

// ─── Shared: get one car owner vehicle detail ─────────────────────────────────

export async function coGetVehicleHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const db  = request.server.db
  const uid = (request as any).user.id
  const { id } = request.params

  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT
      cov.*,
      CONCAT(owner.first_name,' ',owner.last_name) AS owner_name,
      CONCAT(drv.first_name,' ',drv.last_name)      AS assigned_driver_name,
      drv.phone_number                              AS assigned_driver_phone
    FROM car_owner_vehicles cov
    JOIN  users owner ON owner.id = cov.owner_id
    LEFT JOIN users drv   ON drv.id   = cov.assigned_driver_id
    WHERE cov.id = ? AND cov.owner_id = ?
    LIMIT 1
  `, [id, uid])

  if (!(rows as any[]).length) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })
  return reply.send({ success: true, vehicle: (rows as any[])[0] })
}
