/**
 * Company Portal Service (src/services/company-portal.service.ts)
 *
 * The company's own view of itself — distinct from company.service.ts, which
 * serves the admin managing every company.
 *
 * SECURITY — the one rule this whole file exists to enforce: a company id is
 * ALWAYS taken from the authenticated session (`request.company.id`), never from
 * a body, param or query string. Every read and write is additionally scoped
 * `WHERE company_id = ?`, so a guessed vehicle or driver UUID matches zero rows
 * and comes back 404. Nothing here should ever let one company see another's
 * fleet, roster or documents.
 */

import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'

type Db = Pool | PoolConnection

/**
 * Editing one of these on an already-approved vehicle sends it back for review.
 *
 * They are the fields that decide what the truck IS and what it may legally
 * carry. Without this a company could get a small van approved and then quietly
 * rewrite it into a 40-tonne trailer, inheriting the approval.
 */
export const VEHICLE_IDENTITY_FIELDS = ['plate_number', 'vehicle_type', 'max_capacity_kg'] as const

/** Freely editable — appearance and description, nothing a review depends on. */
export const VEHICLE_COSMETIC_FIELDS = ['model', 'color', 'year', 'description'] as const

export const VEHICLE_SORT_COLUMNS: Record<string, string> = {
  created_at: 'v.created_at',
  plate_number: 'v.plate_number',
  vehicle_type: 'v.vehicle_type',
  status: 'v.status',
  operational_status: 'v.operational_status',
}

export interface CompanyContext {
  id: string
  user_id: string
  company_name: string
  status: string
}

/**
 * The company behind a role-6 login, or null when this is an individual car
 * owner. The UNIQUE index on car_owner_companies.user_id is what makes this a
 * one-row answer.
 */
export async function getCompanyForUser(db: Db, userId: string): Promise<CompanyContext | null> {
  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT id, user_id, company_name, status
       FROM car_owner_companies WHERE user_id = ? LIMIT 1`,
    [userId]
  )
  if (!row) return null
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    company_name: String(row.company_name),
    status: String(row.status),
  }
}

/** Fleet and roster counts for the portal header. */
export async function getCompanyStats(db: Db, companyId: string) {
  const [[stats]] = await db.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ?) AS vehicles,
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ? AND status = 'APPROVED') AS vehicles_approved,
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ? AND status = 'PENDING')  AS vehicles_pending,
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ? AND status = 'REJECTED') AS vehicles_rejected,
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ? AND operational_status = 'ACTIVE') AS vehicles_active,
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ? AND assigned_driver_id IS NOT NULL) AS vehicles_with_driver,
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ?
          AND status = 'APPROVED' AND operational_status = 'ACTIVE') AS vehicles_dispatchable,
       (SELECT COUNT(*) FROM driver_profiles WHERE company_id = ?) AS drivers,
       (SELECT COUNT(*) FROM driver_profiles WHERE company_id = ? AND is_verified = 1) AS drivers_verified,
       (SELECT COUNT(*) FROM driver_profiles WHERE company_id = ? AND is_verified = 0) AS drivers_pending`,
    Array(10).fill(companyId)
  )
  return stats
}

/**
 * Everything the company's overview screen needs, in one round trip.
 *
 * Alongside the counts it returns the specific rows that need attention, because
 * a number alone ("3 awaiting approval") tells a fleet manager there is a
 * problem without telling them which truck it is.
 */
export async function getCompanyDashboard(db: Db, companyId: string) {
  const stats = await getCompanyStats(db, companyId)

  const [[breakdown]] = await db.query<RowDataPacket[]>(
    `SELECT
       SUM(operational_status = 'ACTIVE')         AS op_active,
       SUM(operational_status = 'INACTIVE')       AS op_inactive,
       SUM(operational_status = 'MAINTENANCE')    AS op_maintenance,
       SUM(operational_status = 'OUT_OF_SERVICE') AS op_out_of_service
     FROM company_vehicles WHERE company_id = ?`,
    [companyId]
  )

  // Trucks that are approved and on the road but have nobody to drive them —
  // idle capacity, which is the thing a fleet manager most wants surfaced.
  const [idleVehicles] = await db.query<RowDataPacket[]>(
    `SELECT id, plate_number, vehicle_type FROM company_vehicles
      WHERE company_id = ? AND status = 'APPROVED' AND operational_status = 'ACTIVE'
        AND assigned_driver_id IS NULL
      ORDER BY created_at DESC LIMIT 10`,
    [companyId]
  )

  const [pendingVehicles] = await db.query<RowDataPacket[]>(
    `SELECT id, plate_number, vehicle_type, created_at FROM company_vehicles
      WHERE company_id = ? AND status = 'PENDING'
      ORDER BY created_at DESC LIMIT 10`,
    [companyId]
  )

  const [rejectedVehicles] = await db.query<RowDataPacket[]>(
    `SELECT id, plate_number, vehicle_type, admin_note FROM company_vehicles
      WHERE company_id = ? AND status = 'REJECTED'
      ORDER BY reviewed_at DESC LIMIT 10`,
    [companyId]
  )

  const [unverifiedDrivers] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.first_name, u.last_name, u.phone_number, dp.rejection_reason
       FROM driver_profiles dp JOIN users u ON u.id = dp.user_id
      WHERE dp.company_id = ? AND dp.is_verified = 0
      ORDER BY u.created_at DESC LIMIT 10`,
    [companyId]
  )

  // Verified drivers with no truck — the mirror of idle vehicles.
  const [idleDrivers] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.first_name, u.last_name
       FROM driver_profiles dp JOIN users u ON u.id = dp.user_id
      WHERE dp.company_id = ? AND dp.is_verified = 1
        AND NOT EXISTS (SELECT 1 FROM company_vehicles v WHERE v.assigned_driver_id = u.id)
      ORDER BY u.first_name LIMIT 10`,
    [companyId]
  )

  return {
    stats: {
      ...stats,
      op_active:         Number(breakdown?.op_active ?? 0),
      op_inactive:       Number(breakdown?.op_inactive ?? 0),
      op_maintenance:    Number(breakdown?.op_maintenance ?? 0),
      op_out_of_service: Number(breakdown?.op_out_of_service ?? 0),
    },
    attention: {
      pending_vehicles: pendingVehicles,
      rejected_vehicles: rejectedVehicles,
      unverified_drivers: unverifiedDrivers,
      idle_vehicles: idleVehicles,
      idle_drivers: idleDrivers,
    },
  }
}

/**
 * Confirm a vehicle belongs to this company before anything touches it.
 * Returns null rather than throwing so callers answer 404 — a company must not
 * be able to tell "not yours" from "does not exist".
 */
export async function findOwnedVehicle(db: Db, companyId: string, vehicleId: string) {
  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT * FROM company_vehicles WHERE id = ? AND company_id = ? LIMIT 1`,
    [vehicleId, companyId]
  )
  return row ?? null
}

/** Same guarantee for a driver on this company's roster. */
export async function findOwnedDriver(db: Db, companyId: string, driverId: string) {
  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.first_name, u.last_name, u.phone_number, u.email, u.is_active,
            dp.company_id, dp.status, dp.is_verified
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
      WHERE dp.user_id = ? AND dp.company_id = ? LIMIT 1`,
    [driverId, companyId]
  )
  return row ?? null
}

/**
 * Does this edit change what the vehicle IS?
 *
 * Compares against the stored row so that re-submitting an unchanged value is
 * not treated as a change — otherwise saving a description would reset approval
 * simply because the form posted every field back.
 */
export function touchesIdentity(existing: RowDataPacket, body: Record<string, unknown>): boolean {
  return VEHICLE_IDENTITY_FIELDS.some(field => {
    const incoming = body[field]
    if (incoming === undefined) return false
    const before = existing[field]
    if (before === null || before === undefined) return incoming !== null && incoming !== ''
    return String(incoming).trim().toUpperCase() !== String(before).trim().toUpperCase()
  })
}
