/**
 * Company Import Commit Service (src/services/company-import-commit.service.ts)
 *
 * The one place a bulk import is written, used by both the admin screens and the
 * company portal. Kept apart from `company-import.service.ts`, which parses and
 * judges and deliberately never writes.
 *
 * The two callers differ only in what the rows are worth on arrival:
 *
 *  - An **admin** importing a roster IS the approval, so vehicles land APPROVED
 *    and drivers verified — the same rule the single-vehicle admin form follows.
 *  - A **company** importing its own roster is making a submission, so vehicles
 *    land PENDING and drivers unverified, and nothing can be dispatched until an
 *    admin has reviewed it.
 *
 * Everything else — the transaction, the per-row savepoints, the password
 * generation, the duplicate handling — is identical and therefore shared. Two
 * copies of this loop would have been two chances to get a transaction wrong.
 *
 * A driver on the same row is linked to that row's vehicle in both modes, even
 * when unverified. The link records who crews what, which is exactly what the
 * company is telling us; approval is what lets the pair carry cargo. The
 * interactive assign endpoint refuses an unverified driver because there the
 * company is claiming a driver is ready now — a different claim.
 */

import type { Pool, PoolConnection } from 'mysql2/promise'
import { v4 as uuidv4 } from 'uuid'
import { validateRows, type PreparedRow } from './company-import.service.js'

export interface ImportedDriver {
  row: number
  id: string
  name: string
  phone_number: string
  password: string
  plate_number: string | null
}

export interface CommitResult {
  vehicles_created: number
  drivers_created: number
  links_made: number
  skipped: Array<{ row: number; message: string }>
  drivers: ImportedDriver[]
}

export interface CommitOptions {
  companyId: string
  /** The signed-in admin, or null when a company is importing its own roster. */
  actorId: string | null
  rows: PreparedRow[]
  validVehicleTypes: string[]
  /**
   * True for an admin import: vehicles APPROVED, drivers verified. False for a
   * company import: both await review.
   */
  autoApprove: boolean
}

/**
 * Writes one chunk. Throws if the chunk as a whole cannot be saved, having
 * already rolled it back — the caller turns that into a retryable response.
 */
export async function commitImportRows(db: Pool, opts: CommitOptions): Promise<CommitResult> {
  const { companyId, actorId, rows, validVehicleTypes, autoApprove } = opts

  // Re-check the whole chunk against the database before opening a transaction.
  // The rows came back from a browser, so uniqueness must never depend on them,
  // and somebody else may have taken a plate since the preview ran.
  const recheck = await validateRows(db, rows.map(r => ({ ...r })), validVehicleTypes)
  const stillValid = new Map(recheck.rows.map(r => [r.row, r]))

  const { createCustomerAccount, CUSTOMER_ROLE_IDS } = await import('./customer-account.service.js')
  const { ensureDriverProfile } = await import('./profile.service.js')
  const { generateCredentialPassword } = await import('../controllers/admin.controller.js')

  const createdDrivers: ImportedDriver[] = []
  const skipped: Array<{ row: number; message: string }> = []
  let vehiclesCreated = 0
  let linksMade = 0

  const conn: PoolConnection = await db.getConnection()
  try {
    await conn.beginTransaction()

    for (const [index, incoming] of rows.entries()) {
      const row = stillValid.get(incoming.row)
      if (!row) {
        const why = recheck.problems.find(p => p.row === incoming.row && p.severity === 'error')
        skipped.push({ row: incoming.row, message: why?.message ?? 'Row is no longer valid.' })
        continue
      }

      // A savepoint per row, because `createCustomerAccount` may already have
      // inserted a users row before a later statement on the same row fails.
      // Without this, one duplicate email at row 37 would discard the 36 good
      // rows already written in this chunk. Expected failures roll back just
      // their own row; unexpected ones still take the whole chunk.
      const savepoint = `imp_${index}`
      await conn.query(`SAVEPOINT ${savepoint}`)

      let driverId: string | null = null
      let password = ''
      // Counted only once the row has actually survived to RELEASE, so a row
      // that rolls back cannot inflate the totals reported to the caller.
      let madeVehicle = false
      let madeLink = false

      try {
        // ── Driver first, so the vehicle can be inserted already linked ──
        if (row.has_driver && row.normalised_phone) {
          password = generateCredentialPassword()
          const created = await createCustomerAccount(conn, CUSTOMER_ROLE_IDS.DRIVER, {
            first_name: row.first_name!,
            last_name: row.last_name,
            phone_number: row.normalised_phone,
            email: row.email,
            password,
          })
          if (!created.ok) {
            skipped.push({ row: row.row, message: created.message })
          } else {
            driverId = created.id
            await ensureDriverProfile(conn, driverId)

            if (autoApprove) {
              await conn.query(
                `UPDATE driver_profiles
                    SET company_id = ?, is_verified = 1, status = 'AVAILABLE',
                        verified_at = NOW(), verified_by_admin_id = ?
                  WHERE user_id = ?`,
                [companyId, actorId, driverId]
              )
            } else {
              // created_by_company is what puts a document-less driver into the
              // admin's pending queue; without it they would be invisible there.
              await conn.query(
                `UPDATE driver_profiles
                    SET company_id = ?, created_by_company = 1,
                        is_verified = 0, status = 'OFFLINE'
                  WHERE user_id = ?`,
                [companyId, driverId]
              )
            }
            await conn.query('UPDATE users SET must_change_password = 1 WHERE id = ?', [driverId])
          }
        }

        // ── Vehicle, carrying the link if we just made a driver ──
        if (row.has_vehicle && row.plate_number && row.vehicle_type) {
          const vehicleId = uuidv4()
          const common = [
            vehicleId, companyId, row.plate_number, row.vehicle_type,
            row.model || null, row.color || null, row.year || null, row.max_capacity_kg || null,
            driverId,
          ]
          if (autoApprove) {
            await conn.query(
              `INSERT INTO company_vehicles
                 (id, company_id, plate_number, vehicle_type, model, color, year, max_capacity_kg,
                  assigned_driver_id, status, operational_status, created_by_company, reviewed_by, reviewed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 'ACTIVE', 0, ?, NOW())`,
              [...common, actorId]
            )
          } else {
            // PENDING with no reviewer recorded: operational_status is still
            // ACTIVE because that axis is the company's to set and says nothing
            // about approval. `effectiveVehicleState` is what keeps the two from
            // reading as contradictory on screen.
            await conn.query(
              `INSERT INTO company_vehicles
                 (id, company_id, plate_number, vehicle_type, model, color, year, max_capacity_kg,
                  assigned_driver_id, status, operational_status, created_by_company)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'ACTIVE', 1)`,
              common
            )
          }
          madeVehicle = true
          if (driverId) madeLink = true
        }

        if (driverId) {
          createdDrivers.push({
            row: row.row,
            id: driverId,
            name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
            phone_number: row.normalised_phone!,
            password,
            plate_number: row.has_vehicle ? row.plate_number ?? null : null,
          })
        }

        await conn.query(`RELEASE SAVEPOINT ${savepoint}`)
        if (madeVehicle) vehiclesCreated++
        if (madeLink) linksMade++
      } catch (rowErr: any) {
        // A unique-key clash that slipped between the re-check and the insert is
        // this row's problem, not the chunk's. Anything else is rethrown so the
        // whole chunk rolls back rather than silently importing half a file.
        if (rowErr?.code === 'ER_DUP_ENTRY') {
          await conn.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
          if (driverId) createdDrivers.pop()
          skipped.push({
            row: row.row,
            message: 'A plate, phone number or email on this row was taken by someone else while the import was running.',
          })
          continue
        }
        throw rowErr
      }
    }

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }

  return {
    vehicles_created: vehiclesCreated,
    drivers_created: createdDrivers.length,
    links_made: linksMade,
    skipped,
    // The only copy of these passwords. They are bcrypt-hashed on save and
    // cannot be read back, so the caller must keep them.
    drivers: createdDrivers,
  }
}
