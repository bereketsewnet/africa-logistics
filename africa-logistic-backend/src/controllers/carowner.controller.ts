import { FastifyRequest, FastifyReply } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { RowDataPacket } from 'mysql2'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegisterCarBody {
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
  const { plate_number, vehicle_type, model, color, year, max_capacity_kg, description } = request.body

  if (!plate_number?.trim() || !vehicle_type?.trim()) {
    return reply.status(400).send({ success: false, message: 'plate_number and vehicle_type are required.' })
  }

  const id = uuidv4()
  await db.query(`
    INSERT INTO car_owner_vehicles
      (id, owner_id, plate_number, vehicle_type, model, color, year, max_capacity_kg, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
  `, [id, uid, plate_number.trim().toUpperCase(), vehicle_type.trim(), model || null, color || null, year || null, max_capacity_kg || null, description || null])

  return reply.status(201).send({ success: true, message: 'Vehicle registered. Awaiting admin approval.', vehicle_id: id })
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
    `SELECT id, status FROM car_owner_vehicles WHERE id = ? AND owner_id = ? LIMIT 1`,
    [id, uid]
  )
  if (!(rows as any[]).length) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })
  if ((rows as any[])[0].status === 'APPROVED' && (rows as any[])[0].assigned_driver_id) {
    return reply.status(400).send({ success: false, message: 'Cannot delete a vehicle with an assigned driver. Ask admin to unassign first.' })
  }

  await db.query(`DELETE FROM car_owner_vehicles WHERE id = ? AND owner_id = ?`, [id, uid])
  return reply.send({ success: true, message: 'Vehicle removed.' })
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
  const db  = request.server.db
  const { id } = request.params
  const { driver_id } = request.body

  const [vRows] = await db.query<RowDataPacket[]>(
    `SELECT id, status FROM car_owner_vehicles WHERE id = ? LIMIT 1`, [id]
  )
  if (!(vRows as any[]).length) return reply.status(404).send({ success: false, message: 'Vehicle not found.' })
  if ((vRows as any[])[0].status !== 'APPROVED') {
    return reply.status(400).send({ success: false, message: 'Vehicle must be approved before assigning a driver.' })
  }

  if (!driver_id) {
    // Unassign
    const [before] = await db.query<RowDataPacket[]>(
      `SELECT assigned_driver_id FROM car_owner_vehicles WHERE id = ? LIMIT 1`, [id]
    )
    const prevDriver = (before as any[])[0]?.assigned_driver_id
    await db.query(`UPDATE car_owner_vehicles SET assigned_driver_id = NULL WHERE id = ?`, [id])
    if (prevDriver) {
      // If driver has no other assigned vehicles, set OFFLINE
      const [otherVeh] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(*) as cnt FROM car_owner_vehicles WHERE assigned_driver_id = ? AND id != ?`,
        [prevDriver, id]
      )
      const [mainVeh] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(*) as cnt FROM vehicles WHERE driver_id = ?`, [prevDriver]
      )
      if ((otherVeh as any[])[0].cnt === 0 && (mainVeh as any[])[0].cnt === 0) {
        await db.query(`UPDATE driver_profiles SET status = 'OFFLINE' WHERE user_id = ?`, [prevDriver])
      }
    }
    return reply.send({ success: true, message: 'Driver unassigned.' })
  }

  // Validate driver exists with role 3
  const [dRows] = await db.query<RowDataPacket[]>(
    `SELECT u.id FROM users u
     JOIN driver_profiles dp ON dp.user_id = u.id
     WHERE u.id = ? AND u.role_id = 3 LIMIT 1`,
    [driver_id]
  )
  if (!(dRows as any[]).length) {
    return reply.status(400).send({ success: false, message: 'Driver not found or not a verified driver.' })
  }

  // Remove this driver from any other car_owner_vehicle first
  await db.query(
    `UPDATE car_owner_vehicles SET assigned_driver_id = NULL WHERE assigned_driver_id = ? AND id != ?`,
    [driver_id, id]
  )

  await db.query(
    `UPDATE car_owner_vehicles SET assigned_driver_id = ? WHERE id = ?`,
    [driver_id, id]
  )

  // Set driver AVAILABLE if verified
  await db.query(
    `UPDATE driver_profiles SET status = 'AVAILABLE' WHERE user_id = ? AND is_verified = 1`,
    [driver_id]
  )

  return reply.send({ success: true, message: 'Driver assigned to vehicle.' })
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
    WHERE u.role_id = 3 AND u.is_active = 1
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
