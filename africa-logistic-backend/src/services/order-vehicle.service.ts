/**
 * Order Vehicle Service (src/services/order-vehicle.service.ts)
 *
 * The one place that answers two questions about the truck on a delivery order:
 * "which vehicle is this?" and "may it be used?".
 *
 * Background worth knowing before changing anything here: `orders.vehicle_id` was
 * historically **write-only**. Nothing read it, nothing joined it, and it had no
 * foreign key — it was an unvalidated CHAR(36) that happened to receive platform
 * fleet ids from the admin UI. A vehicle belonging to a car owner or a transport
 * company could therefore never reach an order at all.
 *
 * Two things follow from that, and both are deliberate:
 *
 *  - `orders.vehicle_source` has to travel with `vehicle_id`, because the id alone
 *    cannot be resolved back to a row: it could live in any of three tables.
 *  - Validation applies on WRITE ONLY. Existing rows are never re-checked or
 *    rewritten; whatever they hold is historical record.
 */

import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { VEHICLE_SCOPES, type VehicleScope } from './vehicle-assignment.service.js'

type Db = Pool | PoolConnection

/** How a scope is spelled in `orders.vehicle_source`. */
const SCOPE_TO_SOURCE: Record<VehicleScope, 'FLEET' | 'CAR_OWNER' | 'COMPANY'> = {
  FLEET: 'FLEET',
  INDIVIDUAL: 'CAR_OWNER',
  COMPANY: 'COMPANY',
}

export type VehicleSource = 'FLEET' | 'CAR_OWNER' | 'COMPANY'

export interface ResolvedVehicle {
  id: string
  plate_number: string
  vehicle_type: string | null
  max_capacity_kg: number | null
  source: VehicleSource
  /** Set only for a company truck, so dispatch can show whose fleet it is. */
  company_name?: string | null
  /** The driver currently attached to this vehicle, if any. */
  assigned_driver_id: string | null
}

/**
 * Per-scope column mapping. The three tables grew at different times and disagree:
 * the platform fleet predates the review workflow and uses `is_approved` /
 * `is_active`, while the two newer tables use `status` / `operational_status`.
 * Naming the differences once here is what lets one function serve all three.
 */
interface ScopeShape {
  scope: VehicleScope
  /** Expression yielding 1 when the vehicle is approved for use. */
  approvedExpr: string
  /** Expression yielding 1 when the vehicle is operationally usable. */
  operationalExpr: string
  /** Human wording when the vehicle is not approved. */
  notApprovedReason: string
  /** Builds the wording when the vehicle is not operational. */
  notOperationalReason: (row: RowDataPacket) => string
  /** Extra SELECT columns, e.g. the company name. */
  extraSelect: string
  extraJoin: string
}

const SCOPE_SHAPES: ScopeShape[] = [
  {
    scope: 'FLEET',
    approvedExpr: 'v.is_approved = 1',
    operationalExpr: 'v.is_active = 1',
    notApprovedReason: 'has not been approved yet',
    notOperationalReason: () => 'is deactivated',
    extraSelect: 'NULL AS company_name',
    extraJoin: '',
  },
  {
    scope: 'INDIVIDUAL',
    approvedExpr: "v.status = 'APPROVED'",
    operationalExpr: "v.operational_status = 'ACTIVE'",
    notApprovedReason: 'has not been approved yet',
    notOperationalReason: row =>
      `is marked ${String(row.operational_status ?? '').replace(/_/g, ' ').toLowerCase()}`,
    extraSelect: 'NULL AS company_name',
    extraJoin: '',
  },
  {
    scope: 'COMPANY',
    approvedExpr: "v.status = 'APPROVED'",
    operationalExpr: "v.operational_status = 'ACTIVE'",
    notApprovedReason: 'has not been approved yet',
    notOperationalReason: row =>
      `is marked ${String(row.operational_status ?? '').replace(/_/g, ' ').toLowerCase()}`,
    extraSelect: 'c.company_name',
    extraJoin: 'LEFT JOIN car_owner_companies c ON c.id = v.company_id',
  },
]

function shapeFor(scope: VehicleScope): ScopeShape {
  const shape = SCOPE_SHAPES.find(s => s.scope === scope)
  if (!shape) throw new Error(`No shape configured for vehicle scope ${scope}`)
  return shape
}

function toResolved(row: RowDataPacket, scope: VehicleScope): ResolvedVehicle {
  return {
    id: String(row.id),
    plate_number: String(row.plate_number),
    vehicle_type: row.vehicle_type != null ? String(row.vehicle_type) : null,
    max_capacity_kg: row.max_capacity_kg != null ? Number(row.max_capacity_kg) : null,
    source: SCOPE_TO_SOURCE[scope],
    company_name: row.company_name != null ? String(row.company_name) : null,
    assigned_driver_id: row.assigned_driver_id != null ? String(row.assigned_driver_id) : null,
  }
}

/**
 * The truck this driver is currently attached to, looked for in every fleet.
 *
 * Iterates VEHICLE_SCOPES rather than naming tables, so the day a fourth kind of
 * vehicle is added this function learns about it for free — the same reason the
 * assignment service is built that way.
 */
export async function resolveDriverVehicle(
  db: Db,
  driverId: string
): Promise<ResolvedVehicle | null> {
  for (const scope of Object.keys(VEHICLE_SCOPES) as VehicleScope[]) {
    const cfg = VEHICLE_SCOPES[scope]
    const shape = shapeFor(scope)
    const [[row]] = await db.query<RowDataPacket[]>(
      `SELECT v.id, v.plate_number, v.vehicle_type, v.max_capacity_kg,
              v.\`${cfg.driverColumn}\` AS assigned_driver_id,
              ${shape.extraSelect}
         FROM \`${cfg.table}\` v
         ${shape.extraJoin}
        WHERE v.\`${cfg.driverColumn}\` = ? AND ${cfg.activePredicate}
        LIMIT 1`,
      [driverId]
    )
    if (row) return toResolved(row, scope)
  }
  return null
}

export interface VehicleValidation {
  ok: boolean
  /** Present whenever the vehicle row was found, even if it was refused. */
  vehicle?: ResolvedVehicle
  /** True when this vehicle is the one the driver is actually attached to. */
  belongsToDriver?: boolean
  /** Readable refusal, suitable for showing an admin verbatim. */
  reason?: string
}

/**
 * Find a vehicle in whichever fleet holds it, and decide whether an order may be
 * assigned to it.
 *
 * Refuses a truck that is not approved, or not operationally usable — a vehicle in
 * maintenance or still awaiting approval must not be sent out with cargo. This is
 * the first validation `orders.vehicle_id` has ever had.
 *
 * `belongsToDriver` is REPORTED, NOT ENFORCED. The owner's rule is that the vehicle
 * on an order is a snapshot of that one trip, so an admin may deliberately record a
 * different truck; the caller surfaces the mismatch rather than blocking it. Nothing
 * here ever writes to a vehicle's own driver column.
 */
export async function validateOrderVehicle(
  db: Db,
  vehicleId: string,
  driverId: string | null
): Promise<VehicleValidation> {
  for (const scope of Object.keys(VEHICLE_SCOPES) as VehicleScope[]) {
    const cfg = VEHICLE_SCOPES[scope]
    const shape = shapeFor(scope)

    const [[row]] = await db.query<RowDataPacket[]>(
      `SELECT v.*, (${shape.approvedExpr}) AS is_approved_flag,
              (${shape.operationalExpr}) AS is_operational_flag,
              v.\`${cfg.driverColumn}\` AS assigned_driver_id,
              ${shape.extraSelect}
         FROM \`${cfg.table}\` v
         ${shape.extraJoin}
        WHERE v.id = ? LIMIT 1`,
      [vehicleId]
    )
    if (!row) continue

    const vehicle = toResolved(row, scope)
    const belongsToDriver = Boolean(driverId) && vehicle.assigned_driver_id === driverId

    if (Number(row.is_approved_flag) !== 1) {
      return {
        ok: false, vehicle, belongsToDriver,
        reason: `${vehicle.plate_number} ${shape.notApprovedReason}, so it cannot be sent out with an order.`,
      }
    }
    if (Number(row.is_operational_flag) !== 1) {
      return {
        ok: false, vehicle, belongsToDriver,
        reason: `${vehicle.plate_number} ${shape.notOperationalReason(row)}, so it cannot be sent out with an order.`,
      }
    }

    return { ok: true, vehicle, belongsToDriver }
  }

  return { ok: false, reason: 'That vehicle no longer exists.' }
}

/**
 * Work out what to store on the order.
 *
 * No vehicle supplied → use whatever the driver is currently on, which is the
 * common case and spares the admin a decision. A vehicle supplied → validate it.
 */
export async function resolveOrderVehicle(
  db: Db,
  driverId: string,
  requestedVehicleId?: string | null
): Promise<{ ok: true; vehicleId: string | null; source: VehicleSource | null; vehicle: ResolvedVehicle | null; belongsToDriver: boolean }
         | { ok: false; reason: string }> {
  if (!requestedVehicleId) {
    const resolved = await resolveDriverVehicle(db, driverId)
    // A driver with no truck is allowed: the order records no vehicle rather than
    // being blocked, which is how assignment behaved before any of this existed.
    return {
      ok: true,
      vehicleId: resolved?.id ?? null,
      source: resolved?.source ?? null,
      vehicle: resolved,
      belongsToDriver: true,
    }
  }

  const check = await validateOrderVehicle(db, requestedVehicleId, driverId)
  if (!check.ok) return { ok: false, reason: check.reason ?? 'That vehicle cannot be used.' }

  return {
    ok: true,
    vehicleId: check.vehicle!.id,
    source: check.vehicle!.source,
    vehicle: check.vehicle!,
    belongsToDriver: Boolean(check.belongsToDriver),
  }
}
