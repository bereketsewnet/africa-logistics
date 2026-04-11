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
import { sendPushToRole, sendPushToUser } from './push.service.js'

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
  icon_url: string | null
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
  channel: string   // 'main' | 'driver' | 'shipper'
  is_read: number
  created_at: string
  // raw fields
  sender_first_name?: string
  sender_last_name?: string
  sender_role_id?: number
  // computed in SELECT
  sender_name?: string
  sender_role?: string
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
  shipperId: string | null         // null for guest orders
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
  cargoImageUrl?: string | null
  paymentReceiptUrl?: string | null
  // Guest order fields (when shipperId is null)
  isGuestOrder?: boolean
  guestName?: string | null
  guestPhone?: string | null
  guestEmail?: string | null
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
    ct.name    AS cargo_type_name,
    ct.icon    AS cargo_type_icon,
    ct.icon_url AS cargo_type_icon_url,
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
        order_image_1_url, order_image_2_url,
        cargo_image_url, payment_receipt_url,
        is_guest_order, guest_name, guest_phone, guest_email
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, refCode, data.shipperId ?? null, data.cargoTypeId,
      data.pickupLat, data.pickupLng, data.pickupAddress,
      data.deliveryLat, data.deliveryLng, data.deliveryAddress,
      data.estimatedWeightKg, data.vehicleTypeRequired, data.specialInstructions,
      data.distanceKm, data.baseFare, data.perKmRate, data.citySurcharge, data.estimatedPrice,
      pickupHash, data.pickupOtp, deliveryHash, data.deliveryOtp,
      data.orderImage1Url ?? null, data.orderImage2Url ?? null,
      data.cargoImageUrl ?? null, data.paymentReceiptUrl ?? null,
      data.isGuestOrder ? 1 : 0, data.guestName ?? null, data.guestPhone ?? null, data.guestEmail ?? null,
    ]
  )

  // Record initial status in history
  const historyCreator = data.shipperId ?? 'guest'
  await db.query(
    `INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES (?, 'PENDING', ?, 'Order placed')`,
    [id, historyCreator === 'guest' ? null : historyCreator]
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
    `UPDATE orders SET status = ?, updated_at = NOW()${extra}, updated_by = ? WHERE id = ?`,
    [newStatus, changedBy, orderId]
  )
  // Record in history
  await db.query(
    `INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES (?, ?, ?, ?)`,
    [orderId, newStatus, changedBy, notes ?? null]
  )
}

export async function updateOrderInternalNotes(
  db: Pool,
  orderId: string,
  internalNotes: string,
  adminId: string,
  currentStatus: string
): Promise<void> {
  await db.query(
    `UPDATE orders SET internal_notes = ?, updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [internalNotes, adminId, orderId]
  )
  await db.query(
    `INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES (?, ?, ?, ?)` ,
    [orderId, currentStatus, adminId, 'Internal notes updated by admin']
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
    `UPDATE orders SET driver_id = ?, vehicle_id = ?, status = 'ASSIGNED', assigned_at = NOW(), updated_by = ? WHERE id = ?`,
    [driverId, vehicleId, adminId, orderId]
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
    `UPDATE orders SET status = 'CANCELLED', updated_at = NOW(), updated_by = ? WHERE id = ? AND status IN ('PENDING','ASSIGNED')`,
    [cancelledBy, orderId]
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

/** Returns all active/on-job drivers with their latest location ping */
export async function getActiveDriversWithLocation(db: Pool): Promise<any[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       u.id AS driver_id,
       u.first_name, u.last_name, u.phone_number, u.profile_photo_url,
       dp.status AS driver_status, dp.is_verified, dp.rating, dp.total_trips,
       CAST(dl.lat AS DOUBLE) AS lat,
       CAST(dl.lng AS DOUBLE) AS lng,
       dl.heading, dl.speed_kmh, dl.recorded_at AS location_at,
       o.id AS order_id, o.reference_code, o.status,
       o.pickup_address, o.delivery_address,
       CAST(o.pickup_lat  AS DOUBLE) AS pickup_lat,
       CAST(o.pickup_lng  AS DOUBLE) AS pickup_lng,
       CAST(o.delivery_lat AS DOUBLE) AS delivery_lat,
       CAST(o.delivery_lng AS DOUBLE) AS delivery_lng,
       o.pickup_otp, o.delivery_otp,
       CAST(o.distance_km AS DOUBLE) AS distance_km,
       CAST(o.estimated_price AS DOUBLE) AS estimated_price,
       CAST(o.final_price AS DOUBLE) AS final_price,
       CAST(o.estimated_weight_kg AS DOUBLE) AS estimated_weight_kg,
       o.vehicle_type_required AS vehicle_type,
       o.is_guest_order, o.guest_name,
       ct.name AS cargo_type_name, ct.icon AS cargo_type_icon, ct.icon_url AS cargo_type_icon_url,
       s.first_name AS shipper_first_name, s.last_name AS shipper_last_name,
       s.phone_number AS shipper_phone
     FROM users u
     LEFT JOIN driver_profiles dp ON dp.user_id = u.id
     JOIN (
       SELECT dl_inner.*,
              ROW_NUMBER() OVER (PARTITION BY dl_inner.driver_id ORDER BY dl_inner.recorded_at DESC, dl_inner.id DESC) AS rn
       FROM driver_locations dl_inner
     ) dl ON dl.driver_id = u.id AND dl.rn = 1
     LEFT JOIN orders o ON o.id = (
       SELECT id FROM orders
       WHERE driver_id = u.id AND status IN ('ASSIGNED','EN_ROUTE','AT_PICKUP','IN_TRANSIT')
       ORDER BY created_at DESC LIMIT 1
     )
     LEFT JOIN cargo_types ct ON ct.id = o.cargo_type_id
     LEFT JOIN users s ON s.id = o.shipper_id
     WHERE u.role_id = 3
     ORDER BY dl.recorded_at DESC`
  )
  return rows as any[]
}

/** Returns verified+available drivers sorted by Haversine distance to a pickup point */
export async function getSuggestedDriversForOrder(
  db: Pool,
  pickupLat: number,
  pickupLng: number
): Promise<any[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       u.id AS user_id,
       u.first_name, u.last_name, u.phone_number, u.profile_photo_url,
       dp.status AS driver_status, dp.rating, dp.total_trips,
       v.id AS vehicle_id, v.plate_number, v.vehicle_type,
       CAST(dl.lat AS DOUBLE) AS lat,
       CAST(dl.lng AS DOUBLE) AS lng,
       dl.recorded_at AS location_at,
       (6371 * 2 * ASIN(SQRT(
         POW(SIN((RADIANS(CAST(dl.lat AS DOUBLE)) - RADIANS(?)) / 2), 2) +
         COS(RADIANS(?)) * COS(RADIANS(CAST(dl.lat AS DOUBLE))) *
         POW(SIN((RADIANS(CAST(dl.lng AS DOUBLE)) - RADIANS(?)) / 2), 2)
       ))) AS distance_km
     FROM users u
     JOIN driver_profiles dp ON dp.user_id = u.id AND dp.is_verified = 1 AND dp.status = 'AVAILABLE'
     JOIN (
       SELECT dl_inner.*,
              ROW_NUMBER() OVER (PARTITION BY dl_inner.driver_id ORDER BY dl_inner.recorded_at DESC, dl_inner.id DESC) AS rn
       FROM driver_locations dl_inner
     ) dl ON dl.driver_id = u.id AND dl.rn = 1
     LEFT JOIN vehicles v ON v.driver_id = u.id AND v.is_active = 1
     WHERE u.role_id = 3 AND u.is_active = 1
     ORDER BY distance_km ASC
     LIMIT 10`,
    [pickupLat, pickupLat, pickupLng]
  )
  return rows as any[]
}

// ─── In-App Chat Messages ─────────────────────────────────────────────────────

export async function getOrderMessages(
  db: Pool,
  orderId: string,
  channel?: string
): Promise<MessageRow[]> {
  const params: any[] = [orderId]
  let channelClause = ''
  if (channel) {
    channelClause = ' AND m.channel = ?'
    params.push(channel)
  }
  const [rows] = await db.query<MessageRow[]>(
    `SELECT m.*,
        u.first_name AS sender_first_name, u.last_name AS sender_last_name,
        u.role_id AS sender_role_id,
        CONCAT(u.first_name, ' ', u.last_name) AS sender_name,
        CASE u.role_id WHEN 1 THEN 'Admin' WHEN 2 THEN 'Shipper' WHEN 3 THEN 'Driver' ELSE 'User' END AS sender_role
       FROM order_messages m
       JOIN users u ON u.id = m.sender_id
      WHERE m.order_id = ?${channelClause}
      ORDER BY m.created_at ASC`,
    params
  )
  return rows
}

export async function createOrderMessage(
  db: Pool,
  orderId: string,
  senderId: string,
  message: string,
  channel = 'main'
): Promise<MessageRow> {
  const id = uuidv4()
  await db.query(
    `INSERT INTO order_messages (id, order_id, sender_id, message, channel) VALUES (?, ?, ?, ?, ?)`,
    [id, orderId, senderId, message, channel]
  )
  const [rows] = await db.query<MessageRow[]>(
    `SELECT m.*,
        u.first_name AS sender_first_name, u.last_name AS sender_last_name,
        u.role_id AS sender_role_id,
        CONCAT(u.first_name, ' ', u.last_name) AS sender_name,
        CASE u.role_id WHEN 1 THEN 'Admin' WHEN 2 THEN 'Shipper' WHEN 3 THEN 'Driver' ELSE 'User' END AS sender_role
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
      id: string; role_id: number; first_name: string; last_name: string; email: string | null
      is_email_verified: number
      email_enabled: number | null
      browser_enabled: number | null
      order_updates: number | null
    }

    const [users] = await db.query<UserNotifRow[]>(
      `SELECT u.id, u.role_id, u.first_name, u.last_name, u.email, u.is_email_verified,
              np.email_enabled, np.browser_enabled, np.order_updates
       FROM users u
       LEFT JOIN notification_preferences np ON np.user_id = u.id
       WHERE u.id IN (?, ?)`,
      [order.shipper_id, order.driver_id ?? order.shipper_id]
    )

    const driverUser = users.find(u => u.id === order.driver_id)
    const driverName = driverUser ? `${driverUser.first_name} ${driverUser.last_name}` : undefined

    for (const u of users) {
      const isShipper = u.id === order.shipper_id

      // Default to enabled if no prefs row exists.
      if ((u.order_updates ?? 1) === 1 && (u.browser_enabled ?? 1) === 1) {
        const statusLabel = String(newStatus).replace(/_/g, ' ')
        const url = u.role_id === 3 ? '/driver/jobs' : '/dashboard'
        await sendPushToUser(db, u.id, {
          title: `Order ${order.reference_code}`,
          body: `Status changed to ${statusLabel}`,
          url,
          data: {
            order_id: order.id,
            reference_code: order.reference_code,
            status: newStatus,
          },
        }).catch(() => {})
      }

      if (u.email && u.is_email_verified && (u.email_enabled ?? 1) === 1 && (u.order_updates ?? 1) === 1) {
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
    }

    await sendPushToRole(db, 1, {
      title: `Order ${order.reference_code}`,
      body: `Status changed to ${String(newStatus).replace(/_/g, ' ')}`,
      url: '/admin',
      data: {
        order_id: order.id,
        reference_code: order.reference_code,
        status: newStatus,
        type: 'ORDER_STATUS_CHANGED',
      },
    }).catch(() => {})
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
