/**
 * User Deletion Service (src/services/staff-deletion.service.ts)
 *
 * Hard-deletes an account. The `users` table is referenced by 30 foreign keys,
 * several of them NOT NULL and a few cascading — notably
 * `order_driver_payments.admin_id`/`driver_id` and `wallets.user_id`, which
 * chains on to `wallet_transactions` and `manual_payment_records`. A naive
 * DELETE therefore either fails outright or silently takes financial records
 * down with the account, so every reference is handled explicitly here.
 *
 * Two deliberately different policies:
 *
 *  - Staff and admins (roles 1, 4, 5, custom): protective. Their approvals and
 *    payouts are kept — nulled or repointed at the tombstone user — and the
 *    delete refuses outright if it would destroy money records.
 *
 *  - Shipper, Driver and CarOwner (roles 2, 3, 6): full erasure. These accounts
 *    own wallets, orders and vehicles, so the caller is shown an exact impact
 *    count first and must confirm. Their orders are either deleted with them or
 *    detached and kept as records, at the caller's choice.
 */

import { Pool, PoolConnection } from 'mysql2/promise'
import { DELETED_STAFF_USER_ID } from '../plugins/db.js'

/** Roles whose accounts own operational data and get the full-erasure path. */
const CUSTOMER_ROLE_IDS = [2, 3, 6] // Shipper, Driver, CarOwner

export interface UserDeletionRefusal {
  ok: false
  status: number
  message: string
}

export interface UserDeletionSuccess {
  ok: true
  deletedName: string
  preservedRecords: number
  deletedOrders: number
  detachedOrders: number
}

export interface UserDeletionImpact {
  user_id: string
  role_id: number
  name: string
  is_customer_role: boolean
  orders_as_shipper: number
  orders_as_driver: number
  active_orders: number
  wallet_balance: number
  wallet_transactions: number
  manual_payments: number
  withdrawal_requests: number
  driver_ratings: number
  vehicles: number
}

/** Audit columns that accept NULL — the record survives with no approver. */
const NULLABLE_REFERENCES: Array<{ table: string; column: string }> = [
  { table: 'car_owner_vehicles',     column: 'reviewed_by' },
  { table: 'driver_profiles',        column: 'verified_by_admin_id' },
  { table: 'manual_payment_records', column: 'approved_by' },
  { table: 'order_charges',          column: 'approved_by' },
  { table: 'wallet_transactions',    column: 'related_user_id' },
  { table: 'withdrawal_requests',    column: 'reviewed_by' },
]

/**
 * NOT NULL audit columns. Repointed at the tombstone user so the underlying
 * record (a payout, a receipt, a document review) is kept intact.
 */
const REPOINTED_REFERENCES: Array<{ table: string; column: string }> = [
  { table: 'cross_border_documents',  column: 'uploaded_by' },
  { table: 'driver_document_reviews', column: 'reviewed_by' },
  { table: 'manual_payment_records',  column: 'submitted_by' },
  { table: 'order_charges',           column: 'added_by' },
  { table: 'order_driver_payments',   column: 'admin_id' },
  { table: 'order_messages',          column: 'sender_id' },
]

/** Rows that belong only to the person and carry no business record. */
const PERSONAL_TABLES = [
  'email_verifications',
  'notification_preferences',
  'phone_change_requests',
  'web_push_subscriptions',
]

const IN_FLIGHT_STATUSES = [
  'ASSIGNED', 'EN_ROUTE', 'AT_PICKUP', 'IN_TRANSIT',
  'AT_BORDER', 'IN_CUSTOMS', 'CUSTOMS_CLEARED',
]

/**
 * Exactly what deleting this account would remove. Shown to the admin before
 * they confirm, so an irreversible delete is never a blind one.
 */
export async function getUserDeletionImpact(db: Pool, userId: string): Promise<UserDeletionImpact | null> {
  const [[user]] = await db.query<any[]>(
    `SELECT id, role_id, first_name, last_name FROM users WHERE id = ? LIMIT 1`,
    [userId]
  )
  if (!user) return null

  const inFlight = IN_FLIGHT_STATUSES.map(() => '?').join(',')

  const [[counts]] = await db.query<any[]>(
    `SELECT
       (SELECT COUNT(*) FROM orders WHERE shipper_id = ?) AS orders_as_shipper,
       (SELECT COUNT(*) FROM orders WHERE driver_id = ?)  AS orders_as_driver,
       (SELECT COUNT(*) FROM orders WHERE (shipper_id = ? OR driver_id = ?)
          AND status IN (${inFlight}))                    AS active_orders,
       (SELECT COUNT(*) FROM driver_ratings WHERE driver_id = ? OR shipper_id = ?) AS driver_ratings,
       (SELECT COUNT(*) FROM withdrawal_requests WHERE user_id = ?) AS withdrawal_requests,
       (SELECT COUNT(*) FROM vehicles WHERE driver_id = ?) AS vehicles`,
    [userId, userId, userId, userId, ...IN_FLIGHT_STATUSES, userId, userId, userId, userId]
  )

  const [[wallet]] = await db.query<any[]>(
    `SELECT id, balance FROM wallets WHERE user_id = ? LIMIT 1`,
    [userId]
  )

  let walletTransactions = 0
  let manualPayments = 0
  if (wallet) {
    const [[w]] = await db.query<any[]>(
      `SELECT
         (SELECT COUNT(*) FROM wallet_transactions WHERE wallet_id = ?) AS tx,
         (SELECT COUNT(*) FROM manual_payment_records WHERE wallet_id = ?) AS mp`,
      [wallet.id, wallet.id]
    )
    walletTransactions = Number(w.tx)
    manualPayments = Number(w.mp)
  }

  return {
    user_id: user.id,
    role_id: Number(user.role_id),
    name: `${user.first_name} ${user.last_name ?? ''}`.trim(),
    is_customer_role: CUSTOMER_ROLE_IDS.includes(Number(user.role_id)),
    orders_as_shipper: Number(counts.orders_as_shipper),
    orders_as_driver: Number(counts.orders_as_driver),
    active_orders: Number(counts.active_orders),
    wallet_balance: wallet ? Number(wallet.balance) : 0,
    wallet_transactions: walletTransactions,
    manual_payments: manualPayments,
    withdrawal_requests: Number(counts.withdrawal_requests),
    driver_ratings: Number(counts.driver_ratings),
    vehicles: Number(counts.vehicles),
  }
}

export async function hardDeleteUser(
  db: Pool,
  targetId: string,
  callerId: string,
  options: { deleteOrders?: boolean } = {}
): Promise<UserDeletionRefusal | UserDeletionSuccess> {
  if (targetId === DELETED_STAFF_USER_ID) {
    return { ok: false, status: 400, message: 'This is a reserved system record and cannot be deleted.' }
  }
  if (targetId === callerId) {
    return { ok: false, status: 400, message: 'You cannot delete your own account.' }
  }

  const [[target]] = await db.query<any[]>(
    `SELECT id, role_id, first_name, last_name FROM users WHERE id = ? LIMIT 1`,
    [targetId]
  )
  if (!target) {
    return { ok: false, status: 404, message: 'User not found.' }
  }

  const roleId = Number(target.role_id)
  const isCustomer = CUSTOMER_ROLE_IDS.includes(roleId)

  // Never leave the system without a way in.
  if (roleId === 1) {
    const [[{ remaining }]] = await db.query<any[]>(
      `SELECT COUNT(*) AS remaining FROM users WHERE role_id = 1 AND is_active = 1 AND id <> ?`,
      [targetId]
    )
    if (Number(remaining) === 0) {
      return { ok: false, status: 400, message: 'This is the last active admin and cannot be deleted.' }
    }
  }

  // A job still running must never lose its shipper or its driver mid-delivery.
  const inFlight = IN_FLIGHT_STATUSES.map(() => '?').join(',')
  const [[{ activeOrders }]] = await db.query<any[]>(
    `SELECT COUNT(*) AS activeOrders FROM orders
      WHERE (shipper_id = ? OR driver_id = ?) AND status IN (${inFlight})`,
    [targetId, targetId, ...IN_FLIGHT_STATUSES]
  )
  if (Number(activeOrders) > 0) {
    return {
      ok: false,
      status: 409,
      message: `This account has ${activeOrders} order(s) still in progress. Finish or cancel them before deleting.`,
    }
  }

  const [[wallet]] = await db.query<any[]>(
    `SELECT id, balance FROM wallets WHERE user_id = ? LIMIT 1`,
    [targetId]
  )

  if (!isCustomer) {
    // Staff policy: keep every financial record, refuse rather than destroy one.
    const [[{ orderCount }]] = await db.query<any[]>(
      `SELECT COUNT(*) AS orderCount FROM orders WHERE shipper_id = ? OR driver_id = ?`,
      [targetId, targetId]
    )
    if (Number(orderCount) > 0) {
      return {
        ok: false,
        status: 409,
        message: `This staff account is attached to ${orderCount} order(s) and cannot be deleted. Suspend it instead.`,
      }
    }
    if (wallet) {
      if (Math.abs(Number(wallet.balance)) > 0.004) {
        return {
          ok: false,
          status: 409,
          message: `This account still holds ${Number(wallet.balance).toFixed(2)} ETB. Move the balance to zero first, or suspend the account instead.`,
        }
      }
      const [[{ txCount }]] = await db.query<any[]>(
        `SELECT
           (SELECT COUNT(*) FROM wallet_transactions WHERE wallet_id = ?)
         + (SELECT COUNT(*) FROM manual_payment_records WHERE wallet_id = ?) AS txCount`,
        [wallet.id, wallet.id]
      )
      if (Number(txCount) > 0) {
        return {
          ok: false,
          status: 409,
          message: `This account has ${txCount} wallet record(s) that would be destroyed. Suspend it instead so the financial history is kept.`,
        }
      }
    }
  }

  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()

    let deletedOrders = 0
    let detachedOrders = 0

    if (isCustomer) {
      const result = await purgeCustomerData(conn, targetId, roleId, Boolean(options.deleteOrders))
      deletedOrders = result.deletedOrders
      detachedOrders = result.detachedOrders
    }

    for (const { table, column } of NULLABLE_REFERENCES) {
      await conn.query(`UPDATE \`${table}\` SET \`${column}\` = NULL WHERE \`${column}\` = ?`, [targetId])
    }

    let preservedRecords = 0
    for (const { table, column } of REPOINTED_REFERENCES) {
      const [res] = await conn.query<any>(
        `UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${column}\` = ?`,
        [DELETED_STAFF_USER_ID, targetId]
      )
      preservedRecords += Number(res?.affectedRows ?? 0)
    }

    // `orders.updated_by` has no foreign key, but a dangling id would show a
    // stale author on every order they last touched.
    await conn.query(`UPDATE orders SET updated_by = NULL WHERE updated_by = ?`, [targetId])

    for (const table of PERSONAL_TABLES) {
      await conn.query(`DELETE FROM \`${table}\` WHERE user_id = ?`, [targetId])
    }
    if (wallet) {
      // Cascades to wallet_transactions and manual_payment_records. For staff
      // the guards above have already proved both are empty.
      await conn.query(`DELETE FROM wallets WHERE id = ?`, [wallet.id])
    }

    await conn.query(`DELETE FROM users WHERE id = ?`, [targetId])
    await conn.commit()

    return {
      ok: true,
      deletedName: `${target.first_name} ${target.last_name ?? ''}`.trim(),
      preservedRecords,
      deletedOrders,
      detachedOrders,
    }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/**
 * Clears everything a Shipper, Driver or CarOwner owns, in dependency order, so
 * the final DELETE on `users` has nothing left pointing at it.
 */
async function purgeCustomerData(
  conn: PoolConnection,
  userId: string,
  roleId: number,
  deleteOrders: boolean
): Promise<{ deletedOrders: number; detachedOrders: number }> {
  let deletedOrders = 0
  let detachedOrders = 0

  const [ownedOrders] = await conn.query<any[]>(
    `SELECT id FROM orders WHERE shipper_id = ? OR driver_id = ?`,
    [userId, userId]
  )
  const orderIds = ownedOrders.map(r => String(r.id))

  if (deleteOrders && orderIds.length > 0) {
    const placeholders = orderIds.map(() => '?').join(',')
    // driver_ratings and driver_locations have no cascade from orders, so they
    // are cleared first; everything else hanging off an order cascades.
    await conn.query(`DELETE FROM driver_ratings  WHERE order_id IN (${placeholders})`, orderIds)
    await conn.query(`DELETE FROM driver_locations WHERE order_id IN (${placeholders})`, orderIds)
    const [res] = await conn.query<any>(`DELETE FROM orders WHERE id IN (${placeholders})`, orderIds)
    deletedOrders = Number(res?.affectedRows ?? 0)
  } else if (orderIds.length > 0) {
    // Keep the order records, but detach them from the deleted person. The
    // shipper side already allows NULL for guest orders.
    const [res1] = await conn.query<any>(`UPDATE orders SET shipper_id = NULL WHERE shipper_id = ?`, [userId])
    const [res2] = await conn.query<any>(`UPDATE orders SET driver_id  = NULL WHERE driver_id = ?`,  [userId])
    detachedOrders = Number(res1?.affectedRows ?? 0) + Number(res2?.affectedRows ?? 0)
  }

  // Ratings, locations and messages authored by this person, on any order.
  await conn.query(`DELETE FROM driver_ratings WHERE driver_id = ? OR shipper_id = ?`, [userId, userId])
  await conn.query(`DELETE FROM driver_locations WHERE driver_id = ?`, [userId])
  await conn.query(`DELETE FROM order_messages WHERE sender_id = ?`, [userId])
  await conn.query(`DELETE FROM cross_border_documents WHERE uploaded_by = ?`, [userId])
  await conn.query(`DELETE FROM order_charges WHERE added_by = ?`, [userId])

  // Driver-side records.
  await conn.query(`DELETE FROM driver_document_reviews WHERE driver_id = ?`, [userId])
  await conn.query(`DELETE FROM driver_performance_metrics WHERE driver_id = ?`, [userId])
  await conn.query(`DELETE FROM order_driver_payments WHERE driver_id = ?`, [userId])
  await conn.query(`DELETE FROM driver_profiles WHERE user_id = ?`, [userId])

  // Fleet vehicles are company assets — unassign rather than delete.
  await conn.query(`UPDATE vehicles SET driver_id = NULL WHERE driver_id = ?`, [userId])
  await conn.query(`UPDATE car_owner_vehicles SET assigned_driver_id = NULL WHERE assigned_driver_id = ?`, [userId])

  // A car owner's own vehicles would cascade on delete; remove them explicitly
  // so the outcome is visible here rather than a side effect.
  if (roleId === 6) {
    await conn.query(`DELETE FROM car_owner_vehicles WHERE owner_id = ?`, [userId])
  }

  await conn.query(`DELETE FROM withdrawal_requests WHERE user_id = ?`, [userId])
  await conn.query(`DELETE FROM manual_payment_records WHERE submitted_by = ?`, [userId])

  return { deletedOrders, detachedOrders }
}
