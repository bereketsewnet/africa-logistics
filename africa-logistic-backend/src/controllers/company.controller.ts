/**
 * Company Portal Controller (src/controllers/company.controller.ts)
 *
 * What a transport company can do for itself. The admin equivalent lives in
 * companyAdmin.controller.ts.
 *
 * Two rules run through every handler here:
 *
 *  1. The company id comes from `request.company`, set by the route's
 *     resolveCompanyContext hook from the authenticated session. It is never
 *     read from the request, so one company cannot address another's rows.
 *
 *  2. Approval gates dispatch, not data entry. Anything the company creates
 *     starts PENDING / unverified and is theirs to keep editing; it simply
 *     cannot carry cargo until an admin approves it. Operational status is the
 *     deliberate exception — the company knows when a truck is in the garage,
 *     and needing permission to say so would be absurd.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import type { RowDataPacket } from 'mysql2'
import { saveFile } from '../utils/uploads.js'
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js'
import { findPlateConflict } from '../services/company.service.js'
import {
  getCompanyStats,
  getCompanyDashboard,
  findOwnedVehicle,
  findOwnedDriver,
  touchesIdentity,
  VEHICLE_SORT_COLUMNS,
  type CompanyContext,
} from '../services/company-portal.service.js'

const VEHICLE_UPLOAD_DIR = 'company-vehicles'
const MAX_GALLERY_IMAGES = 5
const UPLOAD_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  allowedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
}
const OPERATIONAL_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const
const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED']

/** The company resolved by the route hook. Always present inside these handlers. */
function ctx(request: FastifyRequest): CompanyContext {
  return (request as any).company as CompanyContext
}

// ─── Profile ──────────────────────────────────────────────────────────────────

/**
 * GET /api/company/profile
 *
 * Also the endpoint the frontend uses to decide which portal to render: a 200
 * means company, a 403 from the route hook means individual car owner. That is
 * why the portal does not need company_id threaded through /auth/me.
 */
export async function companyProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const db = request.server.db
  const company = ctx(request)

  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT c.*, CONCAT(u.first_name,' ',IFNULL(u.last_name,'')) AS owner_name,
            u.phone_number AS owner_phone, u.email AS owner_email
       FROM car_owner_companies c JOIN users u ON u.id = c.user_id
      WHERE c.id = ? LIMIT 1`,
    [company.id]
  )
  if (!row) return reply.status(404).send({ success: false, message: 'Company not found.' })

  return reply.send({ success: true, company: row, stats: await getCompanyStats(db, company.id) })
}

/**
 * GET /api/company/dashboard
 * The overview screen: counts plus the specific rows that need attention.
 */
export async function companyDashboardHandler(request: FastifyRequest, reply: FastifyReply) {
  const company = ctx(request)
  const data = await getCompanyDashboard(request.server.db, company.id)
  return reply.send({ success: true, company_name: company.company_name, ...data })
}

// ─── Vehicles ─────────────────────────────────────────────────────────────────

/** GET /api/company/vehicles — paginated, searchable, filterable. */
export async function companyListVehiclesHandler(
  request: FastifyRequest<{
    Querystring: {
      page?: string; limit?: string; search?: string
      status?: string; operational_status?: string; assigned?: string
      sort?: string; direction?: string
    }
  }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)
  const { page, limit, offset } = parsePagination(request.query)

  const filters = ['v.company_id = ?']
  const params: unknown[] = [company.id]

  const q = request.query
  if (APPROVAL_STATUSES.includes(q.status ?? '')) { filters.push('v.status = ?'); params.push(q.status) }
  if (OPERATIONAL_STATUSES.includes(q.operational_status as any)) {
    filters.push('v.operational_status = ?'); params.push(q.operational_status)
  }
  if (q.assigned === 'yes') filters.push('v.assigned_driver_id IS NOT NULL')
  if (q.assigned === 'no')  filters.push('v.assigned_driver_id IS NULL')
  if (q.search?.trim()) {
    filters.push('(v.plate_number LIKE ? OR v.model LIKE ? OR v.vehicle_type LIKE ?)')
    const like = `%${q.search.trim()}%`
    params.push(like, like, like)
  }
  const where = `WHERE ${filters.join(' AND ')}`

  const [[countRow]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM company_vehicles v ${where}`, params
  )
  const total = Number(countRow?.total ?? 0)

  // Whitelisted column only — never interpolate a sort key from the request.
  // The id tiebreaker matters: without it, trucks bulk-created in the same
  // second reorder between pages and rows appear twice or not at all.
  const sortCol = VEHICLE_SORT_COLUMNS[request.query.sort ?? ''] ?? 'v.created_at'
  const dir = request.query.direction?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT v.*,
            CONCAT(d.first_name,' ',IFNULL(d.last_name,'')) AS assigned_driver_name,
            d.phone_number AS assigned_driver_phone
       FROM company_vehicles v
       LEFT JOIN users d ON d.id = v.assigned_driver_id
       ${where}
       ORDER BY ${sortCol} ${dir}, v.id DESC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )

  return reply.send({ success: true, vehicles: rows, pagination: buildPaginationMeta(total, page, limit) })
}

/** POST /api/company/vehicles — the company registers its own truck. */
export async function companyCreateVehicleHandler(
  request: FastifyRequest<{
    Body: {
      plate_number: string; vehicle_type: string
      model?: string; color?: string; year?: number; max_capacity_kg?: number; description?: string
      vehicle_photo?: string; vehicle_images?: string[]; libre_file?: string
    }
  }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)
  const b = request.body ?? ({} as any)

  if (!b.plate_number?.trim() || !b.vehicle_type?.trim()) {
    return reply.status(400).send({ success: false, message: 'Plate number and vehicle type are required.' })
  }

  const plate = b.plate_number.trim().toUpperCase()
  const conflict = await findPlateConflict(db, plate)
  if (conflict) {
    return reply.status(409).send({ success: false, message: `Plate ${plate} is already registered to ${conflict}.` })
  }

  const id = uuidv4()
  let photoUrl: string | null = null
  let libreUrl: string | null = null
  let gallery: string[] = []
  try {
    if (b.vehicle_photo) photoUrl = saveFile(b.vehicle_photo, VEHICLE_UPLOAD_DIR, `cv_${id}_photo`, UPLOAD_LIMITS)
    if (b.libre_file) libreUrl = saveFile(b.libre_file, VEHICLE_UPLOAD_DIR, `cv_${id}_libre`, UPLOAD_LIMITS)
    if (Array.isArray(b.vehicle_images)) {
      gallery = b.vehicle_images.slice(0, MAX_GALLERY_IMAGES)
        .map((img, i) => saveFile(img, VEHICLE_UPLOAD_DIR, `cv_${id}_img${i + 1}`, UPLOAD_LIMITS))
    }
  } catch (err: any) {
    return reply.status(400).send({ success: false, message: err?.message ?? 'A file could not be saved.' })
  }

  // PENDING, and flagged as the company's own entry — unlike an admin-entered
  // truck, which is approved on the spot because the admin entering it is the
  // approval. It is theirs to edit meanwhile; it just cannot be dispatched.
  await db.query(
    `INSERT INTO company_vehicles
       (id, company_id, plate_number, vehicle_type, model, color, year, max_capacity_kg, description,
        vehicle_photo_url, vehicle_images, libre_url, libre_status, status, operational_status,
        created_by_company)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'ACTIVE', 1)`,
    [
      id, company.id, plate, b.vehicle_type.trim(),
      b.model || null, b.color || null, b.year || null, b.max_capacity_kg || null, b.description || null,
      photoUrl, gallery.length ? JSON.stringify(gallery) : null, libreUrl,
      libreUrl ? 'PENDING' : null,
    ]
  )

  return reply.status(201).send({
    success: true,
    vehicle_id: id,
    message: `${plate} added. It will be available for dispatch once an administrator approves it.`,
  })
}

/** PATCH /api/company/vehicles/:id */
export async function companyUpdateVehicleHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: Record<string, any> }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)
  const b = request.body ?? {}

  const existing = await findOwnedVehicle(db, company.id, request.params.id)
  if (!existing) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })

  const sets: string[] = []
  const values: unknown[] = []

  if (b.plate_number !== undefined) {
    const plate = String(b.plate_number).trim().toUpperCase()
    if (!plate) return reply.status(400).send({ success: false, message: 'Plate number cannot be empty.' })
    if (plate !== String(existing.plate_number).toUpperCase()) {
      const conflict = await findPlateConflict(db, plate, { table: 'company_vehicles', id: request.params.id })
      if (conflict) {
        return reply.status(409).send({ success: false, message: `Plate ${plate} is already registered to ${conflict}.` })
      }
    }
    sets.push('plate_number = ?'); values.push(plate)
  }
  if (b.vehicle_type !== undefined) {
    if (!String(b.vehicle_type).trim()) {
      return reply.status(400).send({ success: false, message: 'Vehicle type cannot be empty.' })
    }
    sets.push('vehicle_type = ?'); values.push(String(b.vehicle_type).trim())
  }
  for (const field of ['model', 'color', 'description'] as const) {
    if (b[field] === undefined) continue
    sets.push(`${field} = ?`); values.push(String(b[field]).trim() || null)
  }
  for (const field of ['year', 'max_capacity_kg'] as const) {
    if (b[field] === undefined) continue
    sets.push(`${field} = ?`); values.push(b[field] === '' || b[field] === null ? null : Number(b[field]))
  }

  try {
    if (b.vehicle_photo) {
      sets.push('vehicle_photo_url = ?')
      values.push(saveFile(b.vehicle_photo, VEHICLE_UPLOAD_DIR, `cv_${request.params.id}_photo`, UPLOAD_LIMITS))
    }
    if (b.libre_file) {
      sets.push('libre_url = ?', "libre_status = 'PENDING'")
      values.push(saveFile(b.libre_file, VEHICLE_UPLOAD_DIR, `cv_${request.params.id}_libre`, UPLOAD_LIMITS))
    }
    if (Array.isArray(b.vehicle_images)) {
      const gallery = b.vehicle_images.slice(0, MAX_GALLERY_IMAGES)
        .map((img: string, i: number) =>
          img.startsWith('data:')
            ? saveFile(img, VEHICLE_UPLOAD_DIR, `cv_${request.params.id}_img${i + 1}`, UPLOAD_LIMITS)
            : img)
      sets.push('vehicle_images = ?'); values.push(gallery.length ? JSON.stringify(gallery) : null)
    }
  } catch (err: any) {
    return reply.status(400).send({ success: false, message: err?.message ?? 'A file could not be saved.' })
  }

  if (sets.length === 0) return reply.status(400).send({ success: false, message: 'Nothing to update.' })

  // Changing what the truck IS costs it its approval. Otherwise a small van
  // could be approved and then rewritten into a 40-tonne trailer, keeping the
  // tick. Cosmetic edits leave the approval alone.
  const identityChanged = touchesIdentity(existing, b)
  const resetApproval = identityChanged && existing.status === 'APPROVED'

  if (resetApproval) {
    // Approval is only checked at the moment a driver is attached — nothing
    // re-checks it afterwards. So sending the truck back for review while its
    // driver stays crewed and dispatchable would make the reset cosmetic. The
    // driver has to come off with it.
    if (existing.assigned_driver_id) {
      const [[busy]] = await db.query<RowDataPacket[]>(
        `SELECT 1 AS busy FROM driver_profiles WHERE user_id = ? AND status = 'ON_JOB' LIMIT 1`,
        [existing.assigned_driver_id]
      )
      if (busy) {
        return reply.status(409).send({
          success: false,
          message: 'Changing the plate, type or capacity sends this vehicle back for approval and releases its driver — but that driver is on a delivery right now. Wait until it is finished.',
        })
      }
    }
    sets.push(
      "status = 'PENDING'", 'reviewed_by = NULL', 'reviewed_at = NULL', 'admin_note = NULL',
      'assigned_driver_id = NULL'
    )
  }

  await db.query(
    `UPDATE company_vehicles SET ${sets.join(', ')} WHERE id = ? AND company_id = ?`,
    [...values, request.params.id, company.id]
  )

  if (resetApproval && existing.assigned_driver_id) {
    const { setDriverOfflineWhenUnassigned } = await import('../services/vehicle-assignment.service.js')
    await setDriverOfflineWhenUnassigned(db, String(existing.assigned_driver_id))
  }

  return reply.send({
    success: true,
    approval_reset: resetApproval,
    message: resetApproval
      ? 'Saved. Because the plate, type or capacity changed, this vehicle needs approving again before it can be dispatched'
        + (existing.assigned_driver_id ? ', and its driver has been released.' : '.')
      : 'Vehicle updated.',
  })
}

/**
 * PATCH /api/company/vehicles/:id/operational-status
 * No approval step: the company knows when its own truck is off the road.
 */
export async function companyVehicleOperationalStatusHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { operational_status: string; note?: string } }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)
  const { operational_status, note } = request.body ?? ({} as any)

  if (!OPERATIONAL_STATUSES.includes(operational_status as typeof OPERATIONAL_STATUSES[number])) {
    return reply.status(400).send({
      success: false,
      message: `operational_status must be one of: ${OPERATIONAL_STATUSES.join(', ')}`,
    })
  }

  const vehicle = await findOwnedVehicle(db, company.id, request.params.id)
  if (!vehicle) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })

  // Taking a truck off the road mid-delivery would strand the load.
  if (operational_status !== 'ACTIVE' && vehicle.assigned_driver_id) {
    const [[busy]] = await db.query<RowDataPacket[]>(
      `SELECT 1 AS busy FROM driver_profiles WHERE user_id = ? AND status = 'ON_JOB' LIMIT 1`,
      [vehicle.assigned_driver_id]
    )
    if (busy) {
      return reply.status(409).send({
        success: false,
        message: 'This vehicle\'s driver is on a delivery right now. Wait until it is finished before taking the vehicle off the road.',
      })
    }
  }

  await db.query(
    `UPDATE company_vehicles
        SET operational_status = ?, operational_status_note = ?, operational_status_changed_at = NOW()
      WHERE id = ? AND company_id = ?`,
    [operational_status, note?.trim() || null, request.params.id, company.id]
  )
  return reply.send({ success: true, message: 'Vehicle status updated.', operational_status })
}

/** DELETE /api/company/vehicles/:id — only while still pending. */
export async function companyDeleteVehicleHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)

  const vehicle = await findOwnedVehicle(db, company.id, request.params.id)
  if (!vehicle) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })

  // Once a truck is part of the approved fleet it has history behind it, so
  // removing it is an administrator's call, not a self-service button.
  if (vehicle.status !== 'PENDING') {
    return reply.status(403).send({
      success: false,
      message: 'Only a vehicle still awaiting approval can be removed here. Ask an administrator to remove an approved vehicle.',
    })
  }

  await db.query('DELETE FROM company_vehicles WHERE id = ? AND company_id = ?', [request.params.id, company.id])

  if (vehicle.assigned_driver_id) {
    const { setDriverOfflineWhenUnassigned } = await import('../services/vehicle-assignment.service.js')
    await setDriverOfflineWhenUnassigned(db, String(vehicle.assigned_driver_id))
  }
  return reply.send({ success: true, message: `${vehicle.plate_number} removed.` })
}

// ─── Driver assignment ────────────────────────────────────────────────────────

/**
 * GET /api/company/vehicles/:id/eligible-drivers
 * Only this company's own roster, and only drivers free across all three
 * vehicle tables — so the list cannot offer someone the server will refuse.
 */
export async function companyEligibleDriversHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)

  const vehicle = await findOwnedVehicle(db, company.id, request.params.id)
  if (!vehicle) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })

  const [drivers] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.first_name, u.last_name, u.profile_photo_url,
            dp.status, dp.rating, dp.total_trips, dp.is_verified,
            dp.national_id_url, dp.license_url,
            CASE WHEN ? = u.id THEN 1 ELSE 0 END AS is_currently_assigned
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
      WHERE dp.company_id = ?
        AND u.is_active = 1
        AND dp.is_verified = 1
        AND dp.status <> 'SUSPENDED'
        AND (dp.national_id_url IS NULL OR dp.national_id_status = 'APPROVED')
        AND (dp.license_url     IS NULL OR dp.license_status     = 'APPROVED')
        AND NOT EXISTS (SELECT 1 FROM vehicles fv WHERE fv.driver_id = u.id AND fv.is_active = 1)
        AND NOT EXISTS (SELECT 1 FROM car_owner_vehicles ov WHERE ov.assigned_driver_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM company_vehicles cv
                         WHERE cv.assigned_driver_id = u.id AND cv.id <> ?)
      ORDER BY is_currently_assigned DESC, u.first_name ASC`,
    [vehicle.assigned_driver_id ?? '', company.id, request.params.id]
  )

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

/** PATCH /api/company/vehicles/:id/assign-driver */
export async function companyAssignDriverHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { driver_id: string | null } }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)
  const driverId = request.body?.driver_id ?? null

  // A company may only crew its trucks with its own drivers.
  if (driverId) {
    const owned = await findOwnedDriver(db, company.id, driverId)
    if (!owned) {
      return reply.status(404).send({ success: false, message: 'That driver is not on your roster.' })
    }
  }

  const { assignDriverToVehicle } = await import('../services/vehicle-assignment.service.js')
  try {
    const result = await assignDriverToVehicle({
      pool: db,
      scope: 'COMPANY',
      vehicleId: request.params.id,
      driverId,
      // Belt and braces: the service re-checks ownership in the same
      // transaction that locks the row.
      ownerScope: { column: 'company_id', value: company.id },
    })
    if (!result.ok) return reply.status(result.status).send({ success: false, message: result.message })
    return reply.send({ success: true, message: result.message })
  } catch (err) {
    request.server.log.error({ err }, 'Company driver assignment failed')
    return reply.status(500).send({ success: false, message: 'Failed to update the driver assignment.' })
  }
}

// ─── Drivers ──────────────────────────────────────────────────────────────────

/** GET /api/company/drivers — the company's own roster. */
export async function companyListDriversHandler(
  request: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string; verified?: string } }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)
  const { page, limit, offset } = parsePagination(request.query)

  const filters = ['dp.company_id = ?']
  const params: unknown[] = [company.id]
  if (request.query.verified === 'yes') filters.push('dp.is_verified = 1')
  if (request.query.verified === 'no')  filters.push('dp.is_verified = 0')
  if (request.query.search?.trim()) {
    filters.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone_number LIKE ?)')
    const like = `%${request.query.search.trim()}%`
    params.push(like, like, like)
  }
  const where = `WHERE ${filters.join(' AND ')}`

  const [[countRow]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM driver_profiles dp JOIN users u ON u.id = dp.user_id ${where}`, params
  )
  const total = Number(countRow?.total ?? 0)

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.first_name, u.last_name, u.phone_number, u.email, u.is_active,
            dp.status, dp.is_verified, dp.rating, dp.total_trips,
            dp.national_id_url, dp.national_id_status,
            dp.license_url, dp.license_status,
            dp.libre_url, dp.libre_status, dp.rejection_reason,
            v.id AS vehicle_id, v.plate_number AS vehicle_plate,
            u.created_at
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
       LEFT JOIN company_vehicles v ON v.assigned_driver_id = u.id AND v.company_id = dp.company_id
       ${where}
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )

  return reply.send({ success: true, drivers: rows, pagination: buildPaginationMeta(total, page, limit) })
}

/**
 * POST /api/company/drivers
 * The driver can sign in straight away, but starts unverified: they cannot be
 * put in a truck or dispatched until an administrator verifies them.
 */
export async function companyCreateDriverHandler(
  request: FastifyRequest<{
    Body: {
      first_name: string; last_name?: string; phone_number: string; email?: string
      national_id?: string; license?: string; libre?: string
    }
  }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)
  const body = request.body ?? ({} as any)

  if (!body.first_name?.trim() || !body.phone_number?.trim()) {
    return reply.status(400).send({ success: false, message: 'First name and phone number are required.' })
  }

  const { createCustomerAccount, CUSTOMER_ROLE_IDS } = await import('../services/customer-account.service.js')
  const { ensureDriverProfile } = await import('../services/profile.service.js')
  const { generateCredentialPassword, buildWelcomeSms } = await import('./admin.controller.js')

  const password = generateCredentialPassword()
  const conn = await db.getConnection()
  let driverId = ''

  try {
    await conn.beginTransaction()

    const created = await createCustomerAccount(conn, CUSTOMER_ROLE_IDS.DRIVER, {
      first_name: body.first_name,
      last_name: body.last_name,
      phone_number: body.phone_number,
      email: body.email,
      password,
    })
    if (!created.ok) {
      await conn.rollback()
      return reply.status(created.status).send({ success: false, message: created.message })
    }
    driverId = created.id

    await ensureDriverProfile(conn, driverId)

    const sets: string[] = []
    const values: unknown[] = []
    for (const column of ['national_id', 'license', 'libre'] as const) {
      const payload = body[column] as string | undefined
      if (!payload) continue
      // PENDING, not APPROVED: a company cannot approve its own paperwork.
      sets.push(`${column}_url = ?`, `${column}_status = 'PENDING'`)
      values.push(saveFile(payload, `driver_docs/${driverId}`, column, UPLOAD_LIMITS))
    }

    sets.push(
      'company_id = ?', 'created_by_company = 1',
      'is_verified = 0', "status = 'OFFLINE'"
    )
    values.push(company.id)

    await conn.query(`UPDATE driver_profiles SET ${sets.join(', ')} WHERE user_id = ?`, [...values, driverId])
    await conn.query('UPDATE users SET must_change_password = 1 WHERE id = ?', [driverId])

    await conn.commit()
  } catch (err: any) {
    await conn.rollback()
    request.server.log.error({ err }, 'Company driver creation failed')
    return reply.status(500).send({ success: false, message: 'Could not add this driver.' })
  } finally {
    conn.release()
  }

  // After commit: a failed text must never undo a driver who already exists.
  const { sendSms } = await import('../services/sms.service.js')
  const phone = body.phone_number.trim()
  const sms = await sendSms(db, phone, buildWelcomeSms(body.first_name.trim(), phone, password), 'DRIVER_WELCOME')

  return reply.status(201).send({
    success: true,
    id: driverId,
    sms_sent: sms.ok,
    // Shown to the company only when the text failed, so they can pass the login on
    // themselves rather than the driver never receiving one.
    password: sms.ok ? undefined : password,
    phone_number: phone,
    message: sms.ok
      ? `${body.first_name.trim()} added and sent their login by SMS. They can drive once an administrator verifies them.`
      : `${body.first_name.trim()} added, but the SMS could not be delivered (${sms.error}) — give them the password below.`,
  })
}

/** PATCH /api/company/drivers/:id — name and email only; the phone is the login. */
export async function companyUpdateDriverHandler(
  request: FastifyRequest<{
    Params: { id: string }
    Body: { first_name?: string; last_name?: string; email?: string }
  }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)
  const b = request.body ?? {}

  const driver = await findOwnedDriver(db, company.id, request.params.id)
  if (!driver) return reply.status(404).send({ success: false, message: 'Driver not found.' })

  const sets: string[] = []
  const values: unknown[] = []
  for (const field of ['first_name', 'last_name', 'email'] as const) {
    if (b[field] === undefined) continue
    if (field === 'first_name' && !b[field]?.trim()) {
      return reply.status(400).send({ success: false, message: 'First name cannot be empty.' })
    }
    sets.push(`${field} = ?`); values.push(b[field]?.trim() || null)
  }
  if (sets.length === 0) return reply.status(400).send({ success: false, message: 'Nothing to update.' })

  await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...values, request.params.id])
  return reply.send({ success: true, message: 'Driver updated.' })
}

/**
 * DELETE /api/company/drivers/:id
 * Takes them off the roster. Never deletes the person: their account, wallet and
 * delivery history are not the company's to destroy.
 */
export async function companyRemoveDriverHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)

  const driver = await findOwnedDriver(db, company.id, request.params.id)
  if (!driver) return reply.status(404).send({ success: false, message: 'Driver not found.' })

  if (driver.status === 'ON_JOB') {
    return reply.status(409).send({
      success: false,
      message: 'This driver is on a delivery right now. Wait until it is finished.',
    })
  }

  await db.query(
    'UPDATE company_vehicles SET assigned_driver_id = NULL WHERE assigned_driver_id = ? AND company_id = ?',
    [request.params.id, company.id]
  )
  await db.query('UPDATE driver_profiles SET company_id = NULL WHERE user_id = ? AND company_id = ?',
    [request.params.id, company.id])

  const { setDriverOfflineWhenUnassigned } = await import('../services/vehicle-assignment.service.js')
  await setDriverOfflineWhenUnassigned(db, request.params.id)

  const name = `${driver.first_name} ${driver.last_name ?? ''}`.trim()
  return reply.send({ success: true, message: `${name} removed from your drivers. Their account is kept.` })
}
