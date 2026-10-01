/**
 * Vehicle Assignment Service (src/services/vehicle-assignment.service.ts)
 *
 * A driver may hold at most ONE vehicle at a time, across every table that can
 * hold one. That rule was previously enforced by hand in three places, each
 * knowing a different subset of the tables, and the admin path had drifted:
 * it ran without a transaction, silently stole a driver from another vehicle,
 * and reset an ON_JOB driver mid-delivery. Everything now routes through here,
 * so adding a new kind of vehicle means adding one entry to VEHICLE_SCOPES and
 * every caller learns about it at once.
 *
 * SECURITY: the scope maps to a table name through this whitelist only. A table
 * name must never come from request input — it is interpolated into SQL.
 */

import { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'

export type VehicleScope = 'FLEET' | 'INDIVIDUAL' | 'COMPANY'

interface ScopeConfig {
  /** Physical table. Whitelisted constant — never request input. */
  table: string
  /** Column holding the driver id. */
  driverColumn: string
  /** Extra predicate deciding whether a row still counts as holding the driver. */
  activePredicate: string
  /**
   * How this table says "approved". The three tables disagree: the platform
   * fleet predates the review workflow and uses `is_approved`, while the two
   * newer tables use `status = 'APPROVED'`. Naming the predicate per scope is
   * what lets one assignment path serve all three.
   */
  approvedPredicate: string
  label: string
}

export const VEHICLE_SCOPES: Record<VehicleScope, ScopeConfig> = {
  // Platform-owned fleet. A deactivated vehicle releases its driver.
  FLEET: {
    table: 'vehicles',
    driverColumn: 'driver_id',
    activePredicate: 'is_active = 1',
    approvedPredicate: 'is_approved = 1',
    label: 'platform fleet vehicle',
  },
  // Individual car owner's vehicle.
  INDIVIDUAL: {
    table: 'car_owner_vehicles',
    driverColumn: 'assigned_driver_id',
    activePredicate: '1 = 1',
    approvedPredicate: "status = 'APPROVED'",
    label: 'car owner vehicle',
  },
  // Truck belonging to a transport company. Adding it here is what stops a
  // driver being booked on a company truck and an individual's truck at once —
  // every free-driver check iterates this map.
  COMPANY: {
    table: 'company_vehicles',
    driverColumn: 'assigned_driver_id',
    activePredicate: '1 = 1',
    approvedPredicate: "status = 'APPROVED'",
    label: 'company vehicle',
  },
}

export interface DriverAssignmentHold {
  scope: VehicleScope
  vehicleId: string
  label: string
}

type Db = Pool | PoolConnection

/**
 * Every vehicle currently holding this driver, across all scopes.
 *
 * `exclude` skips one row so a caller can ask "is this driver free *apart from*
 * the vehicle I am about to assign them to".
 */
export async function findDriverAssignments(
  db: Db,
  driverId: string,
  exclude?: { scope: VehicleScope; vehicleId: string },
  forUpdate = false
): Promise<DriverAssignmentHold[]> {
  const holds: DriverAssignmentHold[] = []

  for (const [scope, cfg] of Object.entries(VEHICLE_SCOPES) as [VehicleScope, ScopeConfig][]) {
    const params: unknown[] = [driverId]
    let sql =
      `SELECT id FROM \`${cfg.table}\` ` +
      `WHERE \`${cfg.driverColumn}\` = ? AND ${cfg.activePredicate}`

    if (exclude && exclude.scope === scope) {
      sql += ' AND id <> ?'
      params.push(exclude.vehicleId)
    }
    sql += ' LIMIT 1'
    // FOR UPDATE only inside a transaction; it locks the row against a
    // concurrent assignment of the same driver.
    if (forUpdate) sql += ' FOR UPDATE'

    const [rows] = await db.query<RowDataPacket[]>(sql, params)
    if (rows[0]) {
      holds.push({ scope, vehicleId: String(rows[0].id), label: cfg.label })
    }
  }

  return holds
}

/** True when no vehicle in any scope currently holds this driver. */
export async function isDriverFree(
  db: Db,
  driverId: string,
  exclude?: { scope: VehicleScope; vehicleId: string }
): Promise<boolean> {
  const holds = await findDriverAssignments(db, driverId, exclude)
  return holds.length === 0
}

/**
 * Put a driver back OFFLINE once they hold no vehicle anywhere.
 *
 * Never disturbs a driver who is ON_JOB (they are mid-delivery) or SUSPENDED
 * (an admin decision that outranks this bookkeeping).
 */
export async function setDriverOfflineWhenUnassigned(db: Db, driverId: string): Promise<void> {
  if (!driverId) return
  if (!(await isDriverFree(db, driverId))) return

  await db.query(
    `UPDATE driver_profiles
        SET status = CASE WHEN status IN ('ON_JOB','SUSPENDED') THEN status ELSE 'OFFLINE' END
      WHERE user_id = ?`,
    [driverId]
  )
}

/** Mark a driver available, unless they are already out on a job. */
export async function setDriverAvailable(db: Db, driverId: string): Promise<void> {
  await db.query(
    `UPDATE driver_profiles
        SET status = CASE WHEN status = 'ON_JOB' THEN status ELSE 'AVAILABLE' END
      WHERE user_id = ? AND is_verified = 1`,
    [driverId]
  )
}

/**
 * A driver may only be attached to a vehicle once they are active, verified and
 * not suspended. The libre is deliberately absent — it proves vehicle ownership,
 * and a hired driver has none.
 *
 * Documents are checked "approved where present", not "must exist". Documents are
 * optional throughout this product: an admin can create a driver without any, and
 * demanding an APPROVED status here made such a driver permanently unassignable —
 * registered successfully, then silently impossible to put in a truck. The real
 * gate is `is_verified = 1`: a human admin verifying the driver is the check, and
 * a document that WAS uploaded must still have passed review.
 */
export async function findAssignableDriver(
  db: Db,
  driverId: string,
  forUpdate = false
): Promise<{ id: string; first_name: string; last_name: string | null } | null> {
  const [[driver]] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.first_name, u.last_name
       FROM users u
       JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.id = ?
        AND u.role_id = 3
        AND u.is_active = 1
        AND dp.is_verified = 1
        AND dp.status <> 'SUSPENDED'
        AND dp.national_id_status <> 'REJECTED'
        AND dp.license_status     <> 'REJECTED'
        AND (dp.national_id_url IS NULL OR dp.national_id_url = '' OR dp.national_id_status = 'APPROVED')
        AND (dp.license_url     IS NULL OR dp.license_url     = '' OR dp.license_status     = 'APPROVED')
      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [driverId]
  )
  return (driver as any) ?? null
}

export interface AssignResult {
  ok: boolean
  status: number
  message: string
}

/**
 * Attach or detach a driver on one vehicle, transactionally.
 *
 * `ownerScope` restricts the row to a single owner/company so a car owner can
 * only ever touch their own vehicle; admins pass it undefined.
 */
export async function assignDriverToVehicle(params: {
  pool: Pool
  scope: VehicleScope
  vehicleId: string
  driverId: string | null
  /** Restrict to one owner: e.g. { column: 'owner_id', value: ownerUserId } */
  ownerScope?: { column: string; value: string }
  /** Admins may attach a driver to a vehicle that is not yet approved. */
  requireApproved?: boolean
}): Promise<AssignResult> {
  const { pool, scope, vehicleId, driverId, ownerScope, requireApproved = true } = params
  const cfg = VEHICLE_SCOPES[scope]
  if (!cfg) return { ok: false, status: 400, message: 'Unknown vehicle type.' }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const where = [`id = ?`]
    const args: unknown[] = [vehicleId]
    if (ownerScope) {
      where.push(`\`${ownerScope.column}\` = ?`)
      args.push(ownerScope.value)
    }

    const [[vehicle]] = await conn.query<RowDataPacket[]>(
      `SELECT id, (${cfg.approvedPredicate}) AS is_approved_flag,
              \`${cfg.driverColumn}\` AS current_driver_id
         FROM \`${cfg.table}\`
        WHERE ${where.join(' AND ')}
        LIMIT 1 FOR UPDATE`,
      args
    )
    if (!vehicle) {
      await conn.rollback()
      return { ok: false, status: 404, message: 'Vehicle not found.' }
    }
    if (requireApproved && Number(vehicle.is_approved_flag) !== 1) {
      await conn.rollback()
      return { ok: false, status: 403, message: 'This vehicle must be approved before assigning a driver.' }
    }

    const previousDriverId = (vehicle.current_driver_id as string | null) ?? null

    // ── Unassign ──────────────────────────────────────────────────────────────
    if (!driverId) {
      await conn.query(
        `UPDATE \`${cfg.table}\` SET \`${cfg.driverColumn}\` = NULL WHERE id = ?`,
        [vehicleId]
      )
      if (previousDriverId) await setDriverOfflineWhenUnassigned(conn, previousDriverId)
      await conn.commit()
      return { ok: true, status: 200, message: 'Driver unassigned from this vehicle.' }
    }

    const driver = await findAssignableDriver(conn, driverId, true)
    if (!driver) {
      await conn.rollback()
      return {
        ok: false,
        status: 400,
        message: 'Select an active, verified driver who is not suspended. Any document they did upload must be approved.',
      }
    }

    if (previousDriverId === driverId) {
      await conn.commit()
      return { ok: true, status: 200, message: 'This driver is already assigned to this vehicle.' }
    }

    // The driver must not already hold another vehicle in ANY scope. Refusing
    // is deliberate: silently stealing them leaves the other vehicle driverless
    // without telling anybody.
    const holds = await findDriverAssignments(conn, driverId, { scope, vehicleId }, true)
    if (holds.length > 0) {
      await conn.rollback()
      return {
        ok: false,
        status: 409,
        message: `This driver is already assigned to another ${holds[0].label}. Unassign them there first.`,
      }
    }

    await conn.query(
      `UPDATE \`${cfg.table}\` SET \`${cfg.driverColumn}\` = ? WHERE id = ?`,
      [driverId, vehicleId]
    )
    await setDriverAvailable(conn, driverId)
    if (previousDriverId) await setDriverOfflineWhenUnassigned(conn, previousDriverId)

    await conn.commit()
    return {
      ok: true,
      status: 200,
      message: `${driver.first_name} ${driver.last_name ?? ''}`.trim() + ' assigned to this vehicle.',
    }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
