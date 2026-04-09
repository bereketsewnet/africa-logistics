/**
 * Order Service (src/services/order.service.ts)
 *
 * All database operations for the Order Management Engine:
 *  - Cargo types CRUD
 *  - Order creation, retrieval, status management
 *  - OTP generation and verification
 *  - Driver location pings
 *  - In-app order messages
 *  - Reference code generation
 */

import { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { sendOrderStatusEmail } from './email.service.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'EN_ROUTE'
  | 'AT_PICKUP'
  | 'IN_TRANSIT'
  | 'AT_BORDER'
  | 'IN_CUSTOMS'
  | 'CUSTOMS_CLEARED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED'

export interface CargoTypeRow extends RowDataPacket {
  id: number
  name: string
  description: string | null
  requires_special_handling: number
  icon: string | null
  is_active: number
  created_at: string
}

export interface OrderRow extends RowDataPacket {
  id: string
  reference_code: string
  shipper_id: string
  driver_id: string | null
  vehicle_id: string | null
  cargo_type_id: number
  cargo_type_name?: string
  pickup_lat: number
  pickup_lng: number
  pickup_address: string | null
  delivery_lat: number
  delivery_lng: number
  delivery_address: string | null
  estimated_weight_kg: number | null
  vehicle_type_required: string | null
  special_instructions: string | null
  distance_km: number
  base_fare: number
  per_km_rate: number
  city_surcharge: number
  estimated_price: number
  final_price: number | null
  status: OrderStatus
  pickup_otp_hash: string
  pickup_otp: string | null
  delivery_otp_hash: string
  delivery_otp: string | null
  pickup_otp_verified_at: string | null
  delivery_otp_verified_at: string | null
  order_image_1_url: string | null
  order_image_2_url: string | null
  invoice_url: string | null
  payment_status: 'UNPAID' | 'ESCROWED' | 'SETTLED'
  assigned_at: string | null
  picked_up_at: string | null
  delivered_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  // joined user fields
  shipper_first_name?: string
  shipper_last_name?: string
  shipper_phone?: string
  driver_first_name?: string
  driver_last_name?: string
  driver_phone?: string
  driver_photo_url?: string | null
}

export interface StatusHistoryRow extends RowDataPacket {
  id: number
  order_id: string
  status: string
  changed_by: string | null
  notes: string | null
  created_at: string
  changer_name?: string
}

export interface MessageRow extends RowDataPacket {
  id: string
  order_id: string
  sender_id: string
  message: string
  is_read: number
  created_at: string
  sender_first_name?: string
  sender_last_name?: string
  sender_role_id?: number
}

export interface LocationRow extends RowDataPacket {
  id: number
  driver_id: string
  order_id: string | null
  lat: number
  lng: number
  heading: number | null
  speed_kmh: number | null
  recorded_at: string
}

export interface CreateOrderData {
  shipperId: string
  cargoTypeId: number
  pickupLat: number
  pickupLng: number
  pickupAddress: string | null
  deliveryLat: number
  deliveryLng: number
  deliveryAddress: string | null
  estimatedWeightKg: number | null
  vehicleTypeRequired: string
  specialInstructions: string | null
  distanceKm: number
  baseFare: number
  perKmRate: number
  citySurcharge: number
  estimatedPrice: number
  pickupOtp: string    // plain text — we hash it here
  deliveryOtp: string  // plain text — we hash it here
  orderImage1Url?: string | null
  orderImage2Url?: string | null
}

// ─── OTP Utilities ────────────────────────────────────────────────────────────

/** Generate a cryptographically secure 6-digit OTP */
export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString()
}

/** Hash an OTP for secure storage */
export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10)
}

/** Verify a plain OTP against its stored hash */
export async function verifyOtpHash(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

// ─── Reference Code ───────────────────────────────────────────────────────────

export async function generateReferenceCode(db: Pool): Promise<string> {
  const year = new Date().getFullYear()
  const pattern = `AL-${year}-%`
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as cnt FROM orders WHERE reference_code LIKE ?`,
    [pattern]
  )
  const seq = ((rows[0].cnt as number) + 1).toString().padStart(5, '0')
  return `AL-${year}-${seq}`
}

// ─── Cargo Types ──────────────────────────────────────────────────────────────

export async function listActiveCargoTypes(db: Pool): Promise<CargoTypeRow[]> {
  const [rows] = await db.query<CargoTypeRow[]>(
    `SELECT * FROM cargo_types WHERE is_active = 1 ORDER BY name ASC`
  )
  return rows
}

export async function listAllCargoTypes(db: Pool): Promise<CargoTypeRow[]> {
  const [rows] = await db.query<CargoTypeRow[]>(
    `SELECT * FROM cargo_types ORDER BY is_active DESC, name ASC`
  )
  return rows
}

export async function createCargoType(
  db: Pool,
  data: { name: string; description?: string; requires_special_handling?: boolean; icon?: string; icon_url?: string }
): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO cargo_types (name, description, requires_special_handling, icon, icon_url) VALUES (?, ?, ?, ?, ?)`,
    [data.name, data.description ?? null, data.requires_special_handling ? 1 : 0, data.icon ?? null, data.icon_url ?? null]
  )
  return result.insertId
}

export async function updateCargoType(
  db: Pool,
  id: number,
  data: { name?: string; description?: string; requires_special_handling?: boolean; icon?: string; icon_url?: string; is_active?: boolean }
): Promise<void> {
  const fields: string[] = []
  const values: any[] = []
  if (data.name !== undefined)                     { fields.push('name = ?');                     values.push(data.name) }
  if (data.description !== undefined)              { fields.push('description = ?');              values.push(data.description) }
  if (data.requires_special_handling !== undefined){ fields.push('requires_special_handling = ?'); values.push(data.requires_special_handling ? 1 : 0) }
  if (data.icon !== undefined)                     { fields.push('icon = ?');                     values.push(data.icon) }
  if (data.icon_url !== undefined)                 { fields.push('icon_url = ?');                 values.push(data.icon_url) }
  if (data.is_active !== undefined)                { fields.push('is_active = ?');                values.push(data.is_active ? 1 : 0) }
  if (fields.length === 0) return
  values.push(id)
  await db.query(`UPDATE cargo_types SET ${fields.join(', ')} WHERE id = ?`, values)
}

// ─── Orders ───────────────────────────────────────────────────────────────────

const ORDER_SELECT = `
  SELECT
    o.*,
    ct.name   AS cargo_type_name,
    s.first_name AS shipper_first_name,
    s.last_name  AS shipper_last_name,
    s.phone_number AS shipper_phone,
    d.first_name AS driver_first_name,
    d.last_name  AS driver_last_name,
    d.phone_number AS driver_phone,
    d.profile_photo_url AS driver_photo_url
  FROM orders o
  LEFT JOIN cargo_types ct ON ct.id = o.cargo_type_id
  LEFT JOIN users s ON s.id = o.shipper_id
  LEFT JOIN users d ON d.id = o.driver_id
`

export async function createOrder(db: Pool, data: CreateOrderData): Promise<string> {
  const id            = uuidv4()
  const refCode       = await generateReferenceCode(db)
  const pickupHash    = await hashOtp(data.pickupOtp)
  const deliveryHash  = await hashOtp(data.deliveryOtp)

  await db.query(
    `INSERT INTO orders (
        id, reference_code, shipper_id, cargo_type_id,
        pickup_lat, pickup_lng, pickup_address,
        delivery_lat, delivery_lng, delivery_address,
        estimated_weight_kg, vehicle_type_required, special_instructions,
        distance_km, base_fare, per_km_rate, city_surcharge, estimated_price,
        pickup_otp_hash, pickup_otp, delivery_otp_hash, delivery_otp,
        order_image_1_url, order_image_2_url
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, refCode, data.shipperId, data.cargoTypeId,
      data.pickupLat, data.pickupLng, data.pickupAddress,
      data.deliveryLat, data.deliveryLng, data.deliveryAddress,
      data.estimatedWeightKg, data.vehicleTypeRequired, data.specialInstructions,
      data.distanceKm, data.baseFare, data.perKmRate, data.citySurcharge, data.estimatedPrice,
      pickupHash, data.pickupOtp, deliveryHash, data.deliveryOtp,
      data.orderImage1Url ?? null, data.orderImage2Url ?? null,
    ]
  )

  // Record initial status in history
  await db.query(
    `INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES (?, 'PENDING', ?, 'Order placed')`,
    [id, data.shipperId]
  )

  return id
}

export async function getOrderById(db: Pool, id: string): Promise<OrderRow | null> {
  const [rows] = await db.query<OrderRow[]>(`${ORDER_SELECT} WHERE o.id = ? LIMIT 1`, [id])
  return rows[0] ?? null
}

export async function getOrderByReference(db: Pool, ref: string): Promise<OrderRow | null> {
  const [rows] = await db.query<OrderRow[]>(`${ORDER_SELECT} WHERE o.reference_code = ? LIMIT 1`, [ref])
  return rows[0] ?? null
}

export interface OrderFilters {
  status?: string
  shipperId?: string
  driverId?: string
  page?: number
  limit?: number
  search?: string
  dateFrom?: string
  dateTo?: string
}

export async function listOrders(
  db: Pool,
  filters: OrderFilters = {}
): Promise<{ orders: OrderRow[]; total: number }> {
  const {
    status, shipperId, driverId,
    page = 1, limit = 20,
    search, dateFrom, dateTo,
  } = filters

  const where: string[] = []
  const params: any[] = []

  if (status)     { where.push('o.status = ?');             params.push(status) }
  if (shipperId)  { where.push('o.shipper_id = ?');         params.push(shipperId) }
  if (driverId)   { where.push('o.driver_id = ?');          params.push(driverId) }
  if (search)     { where.push('(o.reference_code LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`) }
  if (dateFrom)   { where.push('o.created_at >= ?');        params.push(dateFrom) }
  if (dateTo)     { where.push('o.created_at <= ?');        params.push(dateTo) }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const [countRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM orders o
     LEFT JOIN users s ON s.id = o.shipper_id
     ${whereClause}`,
    params
  )
  const total = countRows[0].total as number

  const offset = (page - 1) * limit
  const [orders] = await db.query<OrderRow[]>(
    `${ORDER_SELECT} ${whereClause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )

  return { orders, total }
}

export async function updateOrderStatus(
  db: Pool,
  orderId: string,
  newStatus: OrderStatus,
  changedBy: string,
  notes?: string
): Promise<void> {
  // Update main order row + timestamp fields
  const timestampFields: Partial<Record<OrderStatus, string>> = {
    ASSIGNED:    'assigned_at = NOW()',
    AT_PICKUP:   'picked_up_at = NOW()',
    DELIVERED:   'delivered_at = NOW()',
    COMPLETED:   'completed_at = NOW()',
  }
  const extra = timestampFields[newStatus] ? `, ${timestampFields[newStatus]}` : ''
  await db.query(
    `UPDATE orders SET status = ?, updated_at = NOW()${extra} WHERE id = ?`,
    [newStatus, orderId]
  )
  // Record in history
  await db.query(
    `INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES (?, ?, ?, ?)`,
    [orderId, newStatus, changedBy, notes ?? null]
  )
}

export async function assignOrderToDriver(
  db: Pool,
  orderId: string,
  driverId: string,
  vehicleId: string | null,
  adminId: string
): Promise<void> {
  await db.query(
    `UPDATE orders SET driver_id = ?, vehicle_id = ?, status = 'ASSIGNED', assigned_at = NOW() WHERE id = ?`,
    [driverId, vehicleId, orderId]
  )
  await db.query(
    `INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES (?, 'ASSIGNED', ?, 'Driver assigned by admin')`,
    [orderId, adminId]
  )
  // Mark driver as ON_JOB
  await db.query(
    `UPDATE driver_profiles SET status = 'ON_JOB' WHERE user_id = ?`,
    [driverId]
  )
}

export async function cancelOrder(db: Pool, orderId: string, cancelledBy: string): Promise<void> {
  await db.query(
    `UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = ? AND status IN ('PENDING','ASSIGNED')`,
    [orderId]
  )
  await db.query(
    `INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES (?, 'CANCELLED', ?, 'Order cancelled')`,
    [orderId, cancelledBy]
  )
}

// ─── OTP Verification (Pickup / Delivery) ────────────────────────────────────

export async function markPickupOtpVerified(db: Pool, orderId: string): Promise<void> {
  await db.query(
    `UPDATE orders SET pickup_otp_verified_at = NOW() WHERE id = ?`,
    [orderId]
  )
}

export async function markDeliveryOtpVerified(db: Pool, orderId: string): Promise<void> {
  await db.query(
    `UPDATE orders SET delivery_otp_verified_at = NOW() WHERE id = ?`,
    [orderId]
  )
}

// ─── Status History ───────────────────────────────────────────────────────────

export async function getOrderStatusHistory(db: Pool, orderId: string): Promise<StatusHistoryRow[]> {
  const [rows] = await db.query<StatusHistoryRow[]>(
    `SELECT h.*, CONCAT(u.first_name, ' ', u.last_name) AS changer_name
       FROM order_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.order_id = ?
      ORDER BY h.created_at ASC`,
    [orderId]
  )
  return rows
}

// ─── Driver Location ──────────────────────────────────────────────────────────

export async function pingDriverLocation(
  db: Pool,
  driverId: string,
  orderId: string | null,
  lat: number,
  lng: number,
  heading?: number,
  speedKmh?: number
): Promise<void> {
  await db.query(
    `INSERT INTO driver_locations (driver_id, order_id, lat, lng, heading, speed_kmh) VALUES (?, ?, ?, ?, ?, ?)`,
    [driverId, orderId ?? null, lat, lng, heading ?? null, speedKmh ?? null]
  )
}

export async function getLatestDriverLocation(
  db: Pool,
  driverId: string
): Promise<LocationRow | null> {
  const [rows] = await db.query<LocationRow[]>(
    `SELECT * FROM driver_locations WHERE driver_id = ? ORDER BY recorded_at DESC LIMIT 1`,
    [driverId]
  )
  return rows[0] ?? null
}

export async function getOrderTrackingInfo(
  db: Pool,
  orderId: string
): Promise<LocationRow | null> {
  const [rows] = await db.query<LocationRow[]>(
    `SELECT dl.* FROM driver_locations dl
      JOIN orders o ON o.driver_id = dl.driver_id
     WHERE o.id = ?
     ORDER BY dl.recorded_at DESC LIMIT 1`,
    [orderId]
  )
  return rows[0] ?? null
}

// ─── In-App Chat Messages ─────────────────────────────────────────────────────

export async function getOrderMessages(db: Pool, orderId: string): Promise<MessageRow[]> {
  const [rows] = await db.query<MessageRow[]>(
    `SELECT m.*, u.first_name AS sender_first_name, u.last_name AS sender_last_name, u.role_id AS sender_role_id
       FROM order_messages m
       JOIN users u ON u.id = m.sender_id
      WHERE m.order_id = ?
      ORDER BY m.created_at ASC`,
    [orderId]
  )
  return rows
}

export async function createOrderMessage(
  db: Pool,
  orderId: string,
  senderId: string,
  message: string
): Promise<MessageRow> {
  const id = uuidv4()
  await db.query(
    `INSERT INTO order_messages (id, order_id, sender_id, message) VALUES (?, ?, ?, ?)`,
    [id, orderId, senderId, message]
  )
  const [rows] = await db.query<MessageRow[]>(
    `SELECT m.*, u.first_name AS sender_first_name, u.last_name AS sender_last_name, u.role_id AS sender_role_id
       FROM order_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
    [id]
  )
  return rows[0]
}

export async function markMessagesRead(db: Pool, orderId: string, readerId: string): Promise<void> {
  await db.query(
    `UPDATE order_messages SET is_read = 1 WHERE order_id = ? AND sender_id != ?`,
    [orderId, readerId]
  )
}

/** Returns unread message counts per order for the given user */
export async function getUnreadCounts(db: Pool, userId: string): Promise<Record<string, number>> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT om.order_id, COUNT(*) AS unread_count
     FROM order_messages om
     JOIN orders o ON o.id = om.order_id
     WHERE om.is_read = 0 AND om.sender_id != ?
       AND (o.shipper_id = ? OR o.driver_id = ?)
     GROUP BY om.order_id`,
    [userId, userId, userId]
  )
  const result: Record<string, number> = {}
  for (const r of rows) result[r.order_id] = r.unread_count as number
  return result
}

/**
 * Notify shipper and/or driver by email when an order status changes.
 * Respects: is_email_verified AND notification_preferences.email_enabled AND order_updates.
 * Fire-and-forget (errors are swallowed so they never block the main flow).
 */
export async function notifyOrderStatus(db: Pool, orderId: string, newStatus: OrderStatus): Promise<void> {
  try {
    const order = await getOrderById(db, orderId)
    if (!order) return

    interface UserNotifRow extends RowDataPacket {
      id: string; first_name: string; last_name: string; email: string | null
      is_email_verified: number
      email_enabled: number | null; order_updates: number | null
    }

    const [users] = await db.query<UserNotifRow[]>(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.is_email_verified,
              np.email_enabled, np.order_updates
       FROM users u
       LEFT JOIN notification_preferences np ON np.user_id = u.id
       WHERE u.id IN (?, ?)`,
      [order.shipper_id, order.driver_id ?? order.shipper_id]
    )

    const driverUser = users.find(u => u.id === order.driver_id)
    const driverName = driverUser ? `${driverUser.first_name} ${driverUser.last_name}` : undefined

    for (const u of users) {
      if (!u.email) continue
      if (!u.is_email_verified) continue
      // Default to enabled if no prefs row exists
      if ((u.email_enabled ?? 1) === 0) continue
      if ((u.order_updates ?? 1) === 0) continue

      const isShipper = u.id === order.shipper_id
      await sendOrderStatusEmail(u.email, {
        referenceCode: order.reference_code,
        status: newStatus,
        pickupAddress:  order.pickup_address  ?? '',
        deliveryAddress: order.delivery_address ?? '',
        recipientName: `${u.first_name} ${u.last_name}`,
        recipientRole: isShipper ? 'shipper' : 'driver',
        driverName: isShipper ? driverName : undefined,
      }).catch(() => {/* ignore individual send failures */})
    }
  } catch { /* never throw — notifications must not break the main flow */ }
}

// ─── Driver job helpers ───────────────────────────────────────────────────────

/** Get all orders assigned to a specific driver (active + recent) */
export async function getDriverOrders(
  db: Pool,
  driverId: string
): Promise<OrderRow[]> {
  const [rows] = await db.query<OrderRow[]>(
    `${ORDER_SELECT}
     WHERE o.driver_id = ?
     ORDER BY FIELD(o.status,
       'EN_ROUTE','AT_PICKUP','IN_TRANSIT','ASSIGNED',
       'DELIVERED','COMPLETED','CANCELLED','FAILED') ASC,
       o.updated_at DESC
     LIMIT 50`,
    [driverId]
  )
  return rows
}

/** Update driver profile status back to AVAILABLE once job completes */
export async function releaseDriver(db: Pool, driverId: string): Promise<void> {
  await db.query(
    `UPDATE driver_profiles SET status = 'AVAILABLE' WHERE user_id = ?`,
    [driverId]
  )
}

/** Attach generated invoice URL to an order */
export async function setOrderInvoiceUrl(
  db: Pool,
  orderId: string,
  invoiceUrl: string
): Promise<void> {
  await db.query(
    `UPDATE orders SET invoice_url = ?, final_price = COALESCE(final_price, estimated_price) WHERE id = ?`,
    [invoiceUrl, orderId]
  )
}
