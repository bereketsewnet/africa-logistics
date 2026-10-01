/**
 * Company Admin Controller (src/controllers/companyAdmin.controller.ts)
 *
 * Admin-side management of transport companies and their vehicles.
 *
 * These routes are declared in routes/admin.ts, NOT routes/carowner.ts. That is
 * deliberate: the admin car-owner routes live outside the /api/admin plugin and
 * therefore bypass both the RBAC permission hook and the PII-redaction hook.
 * Declaring these under /api/admin is what makes `companies.manage` mean anything.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import type { RowDataPacket } from 'mysql2'
import { saveFile } from '../utils/uploads.js'
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js'
import {
  COMPANY_STATUSES,
  findPlateConflict,
  getCompanyDeletionImpact,
  deleteCompanyCompletely,
  type CompanyStatus,
} from '../services/company.service.js'

const VEHICLE_UPLOAD_DIR = 'company-vehicles'
const MAX_GALLERY_IMAGES = 5
const UPLOAD_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  allowedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
}
const OPERATIONAL_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const

/** Staff roles 2 and 3 are customers and never belong in the admin portal. */
function denyCustomers(request: FastifyRequest, reply: FastifyReply): boolean {
  const caller = request.user as { role_id: number }
  if ([2, 3].includes(caller.role_id)) {
    reply.status(403).send({ success: false, message: 'Admin access required.' })
    return true
  }
  return false
}

function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const caller = request.user as { role_id: number }
  if (caller.role_id !== 1) {
    reply.status(403).send({ success: false, message: 'Super admin access required.' })
    return true
  }
  return false
}

// ─── Companies ────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/companies
 * Creates the company and its single role-6 login in one transaction, then
 * texts the generated password.
 */
export async function adminCreateCompanyHandler(
  request: FastifyRequest<{
    Body: {
      company_name: string; legal_name?: string; tin_number?: string
      license_number?: string; city?: string; address_line?: string
      first_name: string; last_name?: string; phone_number: string; email?: string
    }
  }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const caller = request.user as { id: string }
  const db = request.server.db
  const body = request.body ?? ({} as any)

  if (!body.company_name?.trim()) {
    return reply.status(400).send({ success: false, message: 'Company name is required.' })
  }

  const { createCustomerAccount, CUSTOMER_ROLE_IDS } = await import('../services/customer-account.service.js')
  const { generateCredentialPassword, buildWelcomeSms } = await import('./admin.controller.js')

  const password = generateCredentialPassword()
  const conn = await db.getConnection()
  let companyId = ''
  let ownerId = ''

  try {
    await conn.beginTransaction()

    const created = await createCustomerAccount(conn, CUSTOMER_ROLE_IDS.CAR_OWNER, {
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
    ownerId = created.id
    companyId = uuidv4()

    await conn.query(
      `INSERT INTO car_owner_companies
         (id, user_id, company_name, legal_name, tin_number, license_number, city, address_line, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId, ownerId, body.company_name.trim(),
        body.legal_name?.trim() || null, body.tin_number?.trim() || null,
        body.license_number?.trim() || null, body.city?.trim() || null,
        body.address_line?.trim() || null, caller.id,
      ]
    )

    // The texted password works once; they must set their own to continue.
    await conn.query('UPDATE users SET must_change_password = 1 WHERE id = ?', [ownerId])
    await conn.commit()
  } catch (err: any) {
    await conn.rollback()
    request.server.log.error({ err }, 'Company creation failed')
    return reply.status(500).send({ success: false, message: 'Could not create this company.' })
  } finally {
    conn.release()
  }

  // Sent after commit — a failed text must never undo a created company.
  const { sendSms } = await import('../services/sms.service.js')
  const phone = body.phone_number.trim()
  const sms = await sendSms(db, phone, buildWelcomeSms(body.first_name.trim(), phone, password), 'DRIVER_WELCOME')

  return reply.status(201).send({
    success: true,
    id: companyId,
    sms_sent: sms.ok,
    // Returned only when the text failed — otherwise nobody holds the credential.
    password: sms.ok ? undefined : password,
    phone_number: phone,
    message: sms.ok
      ? `${body.company_name.trim()} created and login details sent by SMS.`
      : `${body.company_name.trim()} created, but the SMS could not be delivered (${sms.error}) — give them the password below.`,
  })
}

/** GET /api/admin/companies — paginated, searchable, filterable. */
export async function adminListCompaniesHandler(
  request: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string; status?: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db
  const { page, limit, offset } = parsePagination(request.query)

  const filters: string[] = []
  const params: unknown[] = []
  if (request.query.search?.trim()) {
    filters.push('(c.company_name LIKE ? OR c.tin_number LIKE ? OR u.phone_number LIKE ?)')
    const q = `%${request.query.search.trim()}%`
    params.push(q, q, q)
  }
  if (request.query.status && COMPANY_STATUSES.includes(request.query.status as CompanyStatus)) {
    filters.push('c.status = ?')
    params.push(request.query.status)
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

  const [[countRow]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM car_owner_companies c JOIN users u ON u.id = c.user_id ${where}`,
    params
  )
  const total = Number(countRow?.total ?? 0)

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT c.*,
            CONCAT(u.first_name, ' ', IFNULL(u.last_name, '')) AS owner_name,
            u.phone_number AS owner_phone,
            u.email        AS owner_email,
            u.is_active    AS owner_is_active,
            (SELECT COUNT(*) FROM company_vehicles v WHERE v.company_id = c.id) AS vehicle_count,
            (SELECT COUNT(*) FROM company_vehicles v WHERE v.company_id = c.id AND v.status = 'PENDING') AS pending_count
       FROM car_owner_companies c
       JOIN users u ON u.id = c.user_id
       ${where}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )

  return reply.send({ success: true, companies: rows, pagination: buildPaginationMeta(total, page, limit) })
}

/** GET /api/admin/companies/:id */
export async function adminGetCompanyHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const [[company]] = await request.server.db.query<RowDataPacket[]>(
    `SELECT c.*, CONCAT(u.first_name,' ',IFNULL(u.last_name,'')) AS owner_name,
            u.phone_number AS owner_phone, u.email AS owner_email, u.is_active AS owner_is_active
       FROM car_owner_companies c JOIN users u ON u.id = c.user_id
      WHERE c.id = ? LIMIT 1`,
    [request.params.id]
  )
  if (!company) return reply.status(404).send({ success: false, message: 'Company not found.' })
  return reply.send({ success: true, company })
}

/** PATCH /api/admin/companies/:id — edit profile fields only, never status. */
export async function adminUpdateCompanyHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: Record<string, string> }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const editable = ['company_name', 'legal_name', 'tin_number', 'license_number', 'city', 'address_line']
  const sets: string[] = []
  const values: unknown[] = []

  for (const field of editable) {
    const value = request.body?.[field]
    if (value === undefined) continue
    if (field === 'company_name' && !value.trim()) {
      return reply.status(400).send({ success: false, message: 'Company name cannot be empty.' })
    }
    sets.push(`${field} = ?`)
    values.push(value.trim() || null)
  }
  if (sets.length === 0) return reply.status(400).send({ success: false, message: 'Nothing to update.' })

  const [res] = await request.server.db.query<any>(
    `UPDATE car_owner_companies SET ${sets.join(', ')} WHERE id = ?`,
    [...values, request.params.id]
  )
  if (!res?.affectedRows) return reply.status(404).send({ success: false, message: 'Company not found.' })
  return reply.send({ success: true, message: 'Company updated.' })
}

/** PATCH /api/admin/companies/:id/review — approve, reject or suspend. */
export async function adminReviewCompanyHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { action: CompanyStatus; admin_note?: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const caller = request.user as { id: string }
  const { action, admin_note } = request.body ?? ({} as any)

  if (!['APPROVED', 'REJECTED', 'SUSPENDED'].includes(action)) {
    return reply.status(400).send({ success: false, message: 'action must be APPROVED, REJECTED or SUSPENDED.' })
  }

  const [res] = await request.server.db.query<any>(
    `UPDATE car_owner_companies
        SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
      WHERE id = ?`,
    [action, admin_note?.trim() || null, caller.id, request.params.id]
  )
  if (!res?.affectedRows) return reply.status(404).send({ success: false, message: 'Company not found.' })
  return reply.send({ success: true, message: `Company ${action.toLowerCase()}.` })
}

/** POST /api/admin/companies/:id/resend-credentials */
export async function adminResendCompanyCredentialsHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db

  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.first_name, u.phone_number FROM car_owner_companies c
       JOIN users u ON u.id = c.user_id WHERE c.id = ? LIMIT 1`,
    [request.params.id]
  )
  if (!row) return reply.status(404).send({ success: false, message: 'Company not found.' })

  const bcrypt = (await import('bcrypt')).default
  const { generateCredentialPassword, buildWelcomeSms } = await import('./admin.controller.js')
  const password = generateCredentialPassword()

  await db.query('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?',
    [await bcrypt.hash(password, 12), row.id])

  const { sendSms } = await import('../services/sms.service.js')
  const sms = await sendSms(db, String(row.phone_number),
    buildWelcomeSms(String(row.first_name), String(row.phone_number), password), 'DRIVER_WELCOME')

  // 200: the password was genuinely reset. Returning 4xx here left the account
  // locked out with the new password known to nobody.
  if (!sms.ok) {
    return reply.send({
      success: true,
      sms_sent: false,
      password,
      phone_number: String(row.phone_number),
      message: `The password was reset, but the SMS could not be delivered (${sms.error}) — give them the password below.`,
    })
  }
  return reply.send({ success: true, sms_sent: true, message: `New login details sent to ${row.phone_number}.` })
}

/** GET /api/admin/companies/:id/deletion-impact */
export async function adminCompanyDeletionImpactHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  if (requireSuperAdmin(request, reply)) return
  const impact = await getCompanyDeletionImpact(request.server.db, request.params.id)
  if (!impact) return reply.status(404).send({ success: false, message: 'Company not found.' })
  return reply.send({ success: true, impact })
}

/**
 * DELETE /api/admin/companies/:id
 * Removes the company, every vehicle it owns, and its login. Irreversible.
 */
export async function adminDeleteCompanyHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  if (requireSuperAdmin(request, reply)) return
  try {
    const result = await deleteCompanyCompletely(request.server.db, request.params.id)
    if (!result.ok) return reply.status(result.status).send({ success: false, message: result.message })
    return reply.send({ success: true, message: result.message, deleted_vehicles: result.deletedVehicles })
  } catch (err: any) {
    request.server.log.error({ err }, 'Company deletion failed')
    return reply.status(500).send({ success: false, message: 'Could not delete this company.' })
  }
}

// ─── Company vehicles ─────────────────────────────────────────────────────────

/** GET /api/admin/company-vehicles — paginated, filterable by company and status. */
export async function adminListCompanyVehiclesHandler(
  request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; search?: string; company_id?: string; status?: string; operational_status?: string }
  }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db
  const { page, limit, offset } = parsePagination(request.query)

  const filters: string[] = []
  const params: unknown[] = []
  if (request.query.company_id) { filters.push('v.company_id = ?'); params.push(request.query.company_id) }
  if (['PENDING', 'APPROVED', 'REJECTED'].includes(request.query.status ?? '')) {
    filters.push('v.status = ?'); params.push(request.query.status)
  }
  if (OPERATIONAL_STATUSES.includes(request.query.operational_status as any)) {
    filters.push('v.operational_status = ?'); params.push(request.query.operational_status)
  }
  if (request.query.search?.trim()) {
    filters.push('(v.plate_number LIKE ? OR v.model LIKE ? OR c.company_name LIKE ?)')
    const q = `%${request.query.search.trim()}%`
    params.push(q, q, q)
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

  const [[countRow]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM company_vehicles v JOIN car_owner_companies c ON c.id = v.company_id ${where}`,
    params
  )
  const total = Number(countRow?.total ?? 0)

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT v.*, c.company_name, c.status AS company_status,
            CONCAT(d.first_name,' ',IFNULL(d.last_name,'')) AS assigned_driver_name,
            d.phone_number AS assigned_driver_phone
       FROM company_vehicles v
       JOIN car_owner_companies c ON c.id = v.company_id
       LEFT JOIN users d ON d.id = v.assigned_driver_id
       ${where}
       ORDER BY v.created_at DESC, v.id DESC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )

  return reply.send({ success: true, vehicles: rows, pagination: buildPaginationMeta(total, page, limit) })
}

/** POST /api/admin/company-vehicles — admin registers a truck for a company. */
export async function adminCreateCompanyVehicleHandler(
  request: FastifyRequest<{
    Body: {
      company_id: string; plate_number: string; vehicle_type: string
      model?: string; color?: string; year?: number; max_capacity_kg?: number; description?: string
      vehicle_photo?: string; vehicle_images?: string[]; libre_file?: string
    }
  }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const caller = request.user as { id: string }
  const db = request.server.db
  const b = request.body ?? ({} as any)

  if (!b.company_id || !b.plate_number?.trim() || !b.vehicle_type?.trim()) {
    return reply.status(400).send({ success: false, message: 'Company, plate number and vehicle type are required.' })
  }

  const [[company]] = await db.query<RowDataPacket[]>(
    'SELECT id FROM car_owner_companies WHERE id = ? LIMIT 1', [b.company_id]
  )
  if (!company) return reply.status(404).send({ success: false, message: 'Company not found.' })

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

  // Approved on the spot. An admin registering the vehicle themselves IS the
  // approval — the same rule already applied to admin-created drivers — so there
  // is no second review step for something staff entered by hand.
  await db.query(
    `INSERT INTO company_vehicles
       (id, company_id, plate_number, vehicle_type, model, color, year, max_capacity_kg, description,
        vehicle_photo_url, vehicle_images, libre_url, libre_status, status, operational_status,
        reviewed_by, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 'ACTIVE', ?, NOW())`,
    [
      id, b.company_id, plate, b.vehicle_type.trim(),
      b.model || null, b.color || null, b.year || null, b.max_capacity_kg || null, b.description || null,
      photoUrl, gallery.length ? JSON.stringify(gallery) : null, libreUrl,
      // Only a document that was actually uploaded can be marked approved —
      // never claim to have checked one that was never sent.
      libreUrl ? 'APPROVED' : null,
      caller.id,
    ]
  )

  return reply.status(201).send({
    success: true,
    vehicle_id: id,
    message: `${plate} registered and approved — ready to assign a driver.`,
  })
}

/** PATCH /api/admin/company-vehicles/:id/review */
export async function adminReviewCompanyVehicleHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { action: 'APPROVED' | 'REJECTED'; admin_note?: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const caller = request.user as { id: string }
  const { action, admin_note } = request.body ?? ({} as any)
  if (!['APPROVED', 'REJECTED'].includes(action)) {
    return reply.status(400).send({ success: false, message: 'action must be APPROVED or REJECTED.' })
  }

  const [res] = await request.server.db.query<any>(
    `UPDATE company_vehicles
        SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW(),
            -- Only approve a libre that was actually uploaded.
            libre_status = CASE WHEN ? = 'APPROVED' AND libre_url IS NOT NULL AND libre_url <> ''
                                THEN 'APPROVED' ELSE libre_status END
      WHERE id = ?`,
    [action, admin_note?.trim() || null, caller.id, action, request.params.id]
  )
  if (!res?.affectedRows) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })
  return reply.send({ success: true, message: `Vehicle ${action.toLowerCase()}.` })
}

/** PATCH /api/admin/company-vehicles/:id/operational-status */
export async function adminCompanyVehicleOperationalStatusHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { operational_status: string; note?: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const { operational_status, note } = request.body ?? ({} as any)
  if (!OPERATIONAL_STATUSES.includes(operational_status as typeof OPERATIONAL_STATUSES[number])) {
    return reply.status(400).send({ success: false, message: `operational_status must be one of: ${OPERATIONAL_STATUSES.join(', ')}` })
  }

  const [res] = await request.server.db.query<any>(
    `UPDATE company_vehicles
        SET operational_status = ?, operational_status_note = ?, operational_status_changed_at = NOW()
      WHERE id = ?`,
    [operational_status, note?.trim() || null, request.params.id]
  )
  if (!res?.affectedRows) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })
  return reply.send({ success: true, message: 'Vehicle status updated.', operational_status })
}

/** PATCH /api/admin/company-vehicles/:id/assign-driver */
export async function adminAssignCompanyVehicleDriverHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { driver_id: string | null } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const { assignDriverToVehicle } = await import('../services/vehicle-assignment.service.js')
  try {
    const result = await assignDriverToVehicle({
      pool: request.server.db,
      scope: 'COMPANY',
      vehicleId: request.params.id,
      driverId: request.body?.driver_id ?? null,
    })
    if (!result.ok) return reply.status(result.status).send({ success: false, message: result.message })
    return reply.send({ success: true, message: result.message })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to update the driver assignment.' })
  }
}

/** DELETE /api/admin/company-vehicles/:id */
export async function adminDeleteCompanyVehicleHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db

  const [[vehicle]] = await db.query<RowDataPacket[]>(
    'SELECT id, plate_number, assigned_driver_id FROM company_vehicles WHERE id = ? LIMIT 1',
    [request.params.id]
  )
  if (!vehicle) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })

  await db.query('DELETE FROM company_vehicles WHERE id = ?', [request.params.id])

  // Release the driver so they are not left marked as holding a deleted vehicle.
  if (vehicle.assigned_driver_id) {
    const { setDriverOfflineWhenUnassigned } = await import('../services/vehicle-assignment.service.js')
    await setDriverOfflineWhenUnassigned(db, String(vehicle.assigned_driver_id))
  }

  return reply.send({ success: true, message: `${vehicle.plate_number} deleted.` })
}

// ─── Company drivers ──────────────────────────────────────────────────────────
//
// A company driver is an ordinary role-3 driver whose profile carries a
// company_id. Keeping them in `users` / `driver_profiles` rather than a separate
// table is what lets them be dispatched, paid and rated by every existing code
// path — the company link decides which roster they appear on, nothing more.

const DRIVER_DOC_FIELDS = ['national_id', 'license', 'libre'] as const

/** GET /api/admin/company-drivers — the roster, filterable by company. */
export async function adminListCompanyDriversHandler(
  request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; search?: string; company_id?: string; status?: string }
  }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db
  const { page, limit, offset } = parsePagination(request.query)

  // Only drivers actually on a company roster. Independent drivers keep their
  // own screen and must never leak into a company's list.
  const filters: string[] = ['dp.company_id IS NOT NULL']
  const params: unknown[] = []

  if (request.query.company_id) { filters.push('dp.company_id = ?'); params.push(request.query.company_id) }
  if (request.query.status?.trim()) { filters.push('dp.status = ?'); params.push(request.query.status.trim()) }
  if (request.query.search?.trim()) {
    filters.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone_number LIKE ?)')
    const q = `%${request.query.search.trim()}%`
    params.push(q, q, q)
  }
  const where = `WHERE ${filters.join(' AND ')}`

  const [[countRow]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM driver_profiles dp JOIN users u ON u.id = dp.user_id ${where}`,
    params
  )
  const total = Number(countRow?.total ?? 0)

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.first_name, u.last_name, u.phone_number, u.email, u.is_active,
            dp.company_id, dp.status, dp.is_verified,
            dp.national_id_url, dp.national_id_status,
            dp.license_url,     dp.license_status,
            dp.libre_url,       dp.libre_status,
            c.company_name,
            v.id AS vehicle_id, v.plate_number AS vehicle_plate,
            u.created_at
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
       JOIN car_owner_companies c ON c.id = dp.company_id
       LEFT JOIN company_vehicles v ON v.assigned_driver_id = u.id
       ${where}
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )

  return reply.send({ success: true, drivers: rows, pagination: buildPaginationMeta(total, page, limit) })
}

/**
 * POST /api/admin/company-drivers
 * Registers a driver directly onto a company's roster. Same form and same rules
 * as the normal admin driver registration — active and verified immediately,
 * every document optional — plus the company link.
 */
export async function adminCreateCompanyDriverHandler(
  request: FastifyRequest<{
    Body: {
      company_id: string
      first_name: string; last_name?: string; phone_number: string; email?: string
      national_id?: string; license?: string; libre?: string
    }
  }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const caller = request.user as { id: string }
  const db = request.server.db
  const body = request.body ?? ({} as any)

  if (!body.company_id) {
    return reply.status(400).send({ success: false, message: 'Choose which company this driver belongs to.' })
  }
  if (!body.first_name?.trim() || !body.phone_number?.trim()) {
    return reply.status(400).send({ success: false, message: 'First name and phone number are required.' })
  }

  const [[company]] = await db.query<RowDataPacket[]>(
    'SELECT id, company_name FROM car_owner_companies WHERE id = ? LIMIT 1', [body.company_id]
  )
  if (!company) return reply.status(404).send({ success: false, message: 'Company not found.' })

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
    for (const column of DRIVER_DOC_FIELDS) {
      const payload = body[column] as string | undefined
      if (!payload) continue
      const url = saveFile(payload, `driver_docs/${driverId}`, column, UPLOAD_LIMITS)
      // Only a document that was actually supplied may be marked approved.
      sets.push(`${column}_url = ?`, `${column}_status = 'APPROVED'`)
      values.push(url)
    }

    sets.push(
      'company_id = ?', 'is_verified = 1', "status = 'AVAILABLE'",
      'verified_at = NOW()', 'verified_by_admin_id = ?'
    )
    values.push(body.company_id, caller.id)

    await conn.query(`UPDATE driver_profiles SET ${sets.join(', ')} WHERE user_id = ?`, [...values, driverId])
    await conn.query('UPDATE users SET must_change_password = 1 WHERE id = ?', [driverId])

    await conn.commit()
  } catch (err: any) {
    await conn.rollback()
    request.server.log.error({ err }, 'Company driver creation failed')
    return reply.status(500).send({ success: false, message: 'Could not create this driver.' })
  } finally {
    conn.release()
  }

  // After commit — a failed text must never undo a driver who already exists.
  const { sendSms } = await import('../services/sms.service.js')
  const phone = body.phone_number.trim()
  const sms = await sendSms(db, phone, buildWelcomeSms(body.first_name.trim(), phone, password), 'DRIVER_WELCOME')

  return reply.status(201).send({
    success: true,
    id: driverId,
    sms_sent: sms.ok,
    password: sms.ok ? undefined : password,
    phone_number: phone,
    message: sms.ok
      ? `${body.first_name.trim()} added to ${company.company_name} and login details sent by SMS.`
      : `${body.first_name.trim()} added to ${company.company_name}, but the SMS could not be delivered (${sms.error}) — give them the password below.`,
  })
}

/** PATCH /api/admin/company-drivers/:id — edit contact details or move company. */
export async function adminUpdateCompanyDriverHandler(
  request: FastifyRequest<{
    Params: { id: string }
    Body: { first_name?: string; last_name?: string; email?: string; company_id?: string }
  }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db
  const b = request.body ?? ({} as any)

  const [[driver]] = await db.query<RowDataPacket[]>(
    'SELECT id FROM users WHERE id = ? AND role_id = 3 LIMIT 1', [request.params.id]
  )
  if (!driver) return reply.status(404).send({ success: false, message: 'Driver not found.' })

  const sets: string[] = []
  const values: unknown[] = []
  for (const field of ['first_name', 'last_name', 'email'] as const) {
    if (b[field] === undefined) continue
    if (field === 'first_name' && !b[field]?.trim()) {
      return reply.status(400).send({ success: false, message: 'First name cannot be empty.' })
    }
    sets.push(`${field} = ?`)
    values.push(b[field]?.trim() || null)
  }
  if (sets.length) {
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...values, request.params.id])
  }

  if (b.company_id !== undefined) {
    if (b.company_id) {
      const [[company]] = await db.query<RowDataPacket[]>(
        'SELECT id FROM car_owner_companies WHERE id = ? LIMIT 1', [b.company_id]
      )
      if (!company) return reply.status(404).send({ success: false, message: 'Company not found.' })
    }
    await db.query('UPDATE driver_profiles SET company_id = ? WHERE user_id = ?',
      [b.company_id || null, request.params.id])
  }

  if (!sets.length && b.company_id === undefined) {
    return reply.status(400).send({ success: false, message: 'Nothing to update.' })
  }
  return reply.send({ success: true, message: 'Driver updated.' })
}

/** POST /api/admin/company-drivers/:id/resend-credentials */
export async function adminResendCompanyDriverCredentialsHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db

  const [[driver]] = await db.query<RowDataPacket[]>(
    'SELECT id, first_name, phone_number FROM users WHERE id = ? AND role_id = 3 LIMIT 1',
    [request.params.id]
  )
  if (!driver) return reply.status(404).send({ success: false, message: 'Driver not found.' })

  const bcrypt = (await import('bcrypt')).default
  const { generateCredentialPassword, buildWelcomeSms } = await import('./admin.controller.js')
  const password = generateCredentialPassword()

  await db.query('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?',
    [await bcrypt.hash(password, 12), driver.id])

  const { sendSms } = await import('../services/sms.service.js')
  const sms = await sendSms(db, String(driver.phone_number),
    buildWelcomeSms(String(driver.first_name), String(driver.phone_number), password), 'DRIVER_WELCOME')

  if (!sms.ok) {
    return reply.send({
      success: true,
      sms_sent: false,
      password,
      phone_number: String(driver.phone_number),
      message: `The password was reset, but the SMS could not be delivered (${sms.error}) — give them the password below.`,
    })
  }
  return reply.send({ success: true, sms_sent: true, message: `New login details sent to ${driver.phone_number}.` })
}

/**
 * DELETE /api/admin/company-drivers/:id
 * Default is to take them off the roster, keeping the account and its history.
 * `?mode=purge` deletes the person entirely and is super-admin only.
 */
export async function adminRemoveCompanyDriverHandler(
  request: FastifyRequest<{ Params: { id: string }; Querystring: { mode?: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db
  const purge = request.query?.mode === 'purge'

  const [[driver]] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.first_name, u.last_name FROM users u WHERE u.id = ? AND u.role_id = 3 LIMIT 1`,
    [request.params.id]
  )
  if (!driver) return reply.status(404).send({ success: false, message: 'Driver not found.' })
  const name = `${driver.first_name} ${driver.last_name ?? ''}`.trim()

  if (!purge) {
    // Detaching leaves a working independent driver, so release any company
    // vehicle they hold — that truck belongs to a fleet they just left.
    await db.query('UPDATE company_vehicles SET assigned_driver_id = NULL WHERE assigned_driver_id = ?', [driver.id])
    await db.query('UPDATE driver_profiles SET company_id = NULL WHERE user_id = ?', [driver.id])
    const { setDriverOfflineWhenUnassigned } = await import('../services/vehicle-assignment.service.js')
    await setDriverOfflineWhenUnassigned(db, String(driver.id))
    return reply.send({ success: true, message: `${name} removed from the company. Their account is kept.` })
  }

  if (requireSuperAdmin(request, reply)) return
  const caller = request.user as { id: string }
  const { hardDeleteUser } = await import('../services/staff-deletion.service.js')
  try {
    // Reuses the one supported deletion path, so its refusals (a driver mid
    // delivery, for instance) apply here too rather than being bypassed.
    const result = await hardDeleteUser(db, String(driver.id), caller.id)
    if (!result.ok) {
      return reply.status(result.status).send({ success: false, message: result.message })
    }
    return reply.send({ success: true, message: `${result.deletedName} deleted permanently.` })
  } catch (err) {
    request.server.log.error({ err }, 'Company driver purge failed')
    return reply.status(500).send({ success: false, message: 'Could not delete this driver.' })
  }
}

/**
 * GET /api/admin/companies/:id/overview
 * Everything about one company in a single round trip — profile, login, and the
 * fleet/roster counts the detail screen leads with.
 */
export async function adminCompanyOverviewHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db

  const [[company]] = await db.query<RowDataPacket[]>(
    `SELECT c.*, CONCAT(u.first_name,' ',IFNULL(u.last_name,'')) AS owner_name,
            u.phone_number AS owner_phone, u.email AS owner_email, u.is_active AS owner_is_active
       FROM car_owner_companies c JOIN users u ON u.id = c.user_id
      WHERE c.id = ? LIMIT 1`,
    [request.params.id]
  )
  if (!company) return reply.status(404).send({ success: false, message: 'Company not found.' })

  const [[stats]] = await db.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ?) AS vehicles,
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ? AND status = 'APPROVED') AS vehicles_approved,
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ? AND status = 'PENDING')  AS vehicles_pending,
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ? AND operational_status = 'ACTIVE') AS vehicles_active,
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ? AND assigned_driver_id IS NOT NULL) AS vehicles_with_driver,
       (SELECT COUNT(*) FROM driver_profiles  WHERE company_id = ?) AS drivers,
       (SELECT COUNT(*) FROM driver_profiles  WHERE company_id = ? AND status = 'AVAILABLE') AS drivers_available`,
    Array(7).fill(request.params.id)
  )

  return reply.send({ success: true, company, stats })
}
