/**
 * Company Service (src/services/company.service.ts)
 *
 * Transport companies and their vehicles. A company is one role-6 login plus a
 * `car_owner_companies` row; a role-6 user with no such row is an individual
 * car owner, which is how the original owners keep working untouched.
 */

import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'

type Db = Pool | PoolConnection

export const COMPANY_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const
export type CompanyStatus = (typeof COMPANY_STATUSES)[number]

/** Orders that are actually moving. A vehicle on one of these must not vanish. */
export const IN_FLIGHT_ORDER_STATUSES = [
  'ASSIGNED', 'EN_ROUTE', 'AT_PICKUP', 'IN_TRANSIT',
  'AT_BORDER', 'IN_CUSTOMS', 'CUSTOMS_CLEARED',
]

/** Editable company fields. Deliberately excludes `status` — that is review-only. */
export interface CompanyProfileInput {
  company_name?: string
  legal_name?: string
  tin_number?: string
  license_number?: string
  city?: string
  address_line?: string
}

/**
 * A plate must be unique across all three vehicle tables. MySQL cannot express
 * a cross-table unique constraint, so it is checked here; each table's own
 * UNIQUE index remains the backstop for a race.
 */
export async function findPlateConflict(
  db: Db,
  plate: string,
  exclude?: { table: 'company_vehicles' | 'car_owner_vehicles'; id: string }
): Promise<string | null> {
  const checks: Array<{ table: string; label: string }> = [
    { table: 'company_vehicles', label: 'another company vehicle' },
    { table: 'car_owner_vehicles', label: 'a car owner vehicle' },
    { table: 'vehicles', label: 'a platform fleet vehicle' },
  ]

  for (const { table, label } of checks) {
    let sql = `SELECT id FROM \`${table}\` WHERE plate_number = ?`
    const params: unknown[] = [plate]
    if (exclude && exclude.table === table) {
      sql += ' AND id <> ?'
      params.push(exclude.id)
    }
    const [rows] = await db.query<RowDataPacket[]>(`${sql} LIMIT 1`, params)
    if (rows[0]) return label
  }
  return null
}

/** The company attached to a role-6 login, or null when they are an individual. */
export async function getCompanyByUserId(db: Db, userId: string) {
  const [[row]] = await db.query<RowDataPacket[]>(
    'SELECT * FROM car_owner_companies WHERE user_id = ? LIMIT 1',
    [userId]
  )
  return row ?? null
}

export interface CompanyDeletionImpact {
  company_id: string
  company_name: string
  vehicles: number
  assigned_drivers: number
  /** Roster drivers. Their accounts survive the delete — they are detached, not removed. */
  company_drivers: number
  active_orders: number
  owner_user_id: string
  owner_name: string
  owner_phone: string
}

/**
 * Exactly what deleting a company would destroy. Shown before the confirmation
 * so an irreversible action on a large fleet is never a blind one.
 */
export async function getCompanyDeletionImpact(
  db: Pool,
  companyId: string
): Promise<CompanyDeletionImpact | null> {
  const [[company]] = await db.query<RowDataPacket[]>(
    `SELECT c.id, c.company_name, c.user_id,
            CONCAT(u.first_name, ' ', IFNULL(u.last_name, '')) AS owner_name,
            u.phone_number AS owner_phone
       FROM car_owner_companies c
       JOIN users u ON u.id = c.user_id
      WHERE c.id = ? LIMIT 1`,
    [companyId]
  )
  if (!company) return null

  const inFlight = IN_FLIGHT_ORDER_STATUSES.map(() => '?').join(',')
  const [[counts]] = await db.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ?) AS vehicles,
       (SELECT COUNT(*) FROM company_vehicles WHERE company_id = ? AND assigned_driver_id IS NOT NULL) AS assigned_drivers,
       (SELECT COUNT(*) FROM driver_profiles WHERE company_id = ?) AS company_drivers,
       (SELECT COUNT(*) FROM orders o
          WHERE o.status IN (${inFlight})
            AND (o.driver_id IN (SELECT assigned_driver_id FROM company_vehicles
                                  WHERE company_id = ? AND assigned_driver_id IS NOT NULL)
              OR o.driver_id IN (SELECT user_id FROM driver_profiles WHERE company_id = ?))) AS active_orders`,
    [companyId, companyId, companyId, ...IN_FLIGHT_ORDER_STATUSES, companyId, companyId]
  )

  return {
    company_id: String(company.id),
    company_name: String(company.company_name),
    vehicles: Number(counts.vehicles),
    assigned_drivers: Number(counts.assigned_drivers),
    company_drivers: Number(counts.company_drivers),
    active_orders: Number(counts.active_orders),
    owner_user_id: String(company.user_id),
    owner_name: String(company.owner_name ?? '').trim(),
    owner_phone: String(company.owner_phone ?? ''),
  }
}

export interface CompanyDeletionResult {
  ok: boolean
  status: number
  message: string
  deletedVehicles?: number
}

/**
 * Permanently remove a company, every vehicle it owns, and its login.
 *
 * The login goes with it deliberately: a role-6 user with no company row would
 * otherwise reappear in the system as an "individual car owner", which is a
 * worse outcome than removing it.
 *
 * Refused outright while any of its drivers is mid-delivery — those jobs would
 * be stranded with no vehicle behind them.
 */
export async function deleteCompanyCompletely(
  pool: Pool,
  companyId: string
): Promise<CompanyDeletionResult> {
  const impact = await getCompanyDeletionImpact(pool, companyId)
  if (!impact) return { ok: false, status: 404, message: 'Company not found.' }

  if (impact.active_orders > 0) {
    return {
      ok: false,
      status: 409,
      message: `${impact.active_orders} delivery(s) are still in progress on this company's vehicles. Finish or cancel them first.`,
    }
  }

  const { setDriverOfflineWhenUnassigned } = await import('./vehicle-assignment.service.js')

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // Release the drivers before the rows vanish, so nobody is left marked as
    // holding a vehicle that no longer exists.
    const [drivers] = await conn.query<RowDataPacket[]>(
      'SELECT DISTINCT assigned_driver_id AS id FROM company_vehicles WHERE company_id = ? AND assigned_driver_id IS NOT NULL',
      [companyId]
    )
    await conn.query('UPDATE company_vehicles SET assigned_driver_id = NULL WHERE company_id = ?', [companyId])

    const [res] = await conn.query<any>('DELETE FROM company_vehicles WHERE company_id = ?', [companyId])
    await conn.query('DELETE FROM car_owner_companies WHERE id = ?', [companyId])
    await conn.query('DELETE FROM users WHERE id = ?', [impact.owner_user_id])

    for (const d of drivers) {
      await setDriverOfflineWhenUnassigned(conn, String(d.id))
    }

    await conn.commit()

    // The roster drivers were detached by the company_id foreign key, not
    // deleted — say so, because "deleted the company" must not be read as
    // "deleted its drivers".
    const detached = impact.company_drivers > 0
      ? ` ${impact.company_drivers} driver(s) were detached and kept as independent drivers.`
      : ''
    return {
      ok: true,
      status: 200,
      message: `${impact.company_name} deleted along with ${res?.affectedRows ?? 0} vehicle(s) and its login.${detached}`,
      deletedVehicles: Number(res?.affectedRows ?? 0),
    }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
