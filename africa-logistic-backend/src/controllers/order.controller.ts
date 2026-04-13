/**
 * Order Controller (src/controllers/order.controller.ts)
 *
 * Handles all Shipper-facing Order Management endpoints:
 *  - GET  /api/orders/cargo-types      — list cargo types for order form
 *  - POST /api/orders/quote            — calculate price quote
 *  - POST /api/orders                  — place a new order
 *  - GET  /api/orders                  — my order history (paginated)
 *  - GET  /api/orders/:id              — single order details
 *  - GET  /api/orders/:id/track        — latest driver GPS location
 *  - GET  /api/orders/:id/history      — status change history
 *  - GET  /api/orders/:id/messages     — in-app chat messages
 *  - POST /api/orders/:id/messages     — send a message
 *  - POST /api/orders/:id/cancel       — cancel a PENDING order
 *  - GET  /api/orders/:id/invoice      — download PDF invoice
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import {
  listActiveCargoTypes,
  createOrder,
  getOrderById,
  listOrders,
  getOrderStatusHistory,
  getOrderTrackingInfo,
  getOrderMessages,
  createOrderMessage,
  markMessagesRead,
  cancelOrder,
  generateOtp,
  getUnreadCounts,
  listCrossBorderDocs,
  createCrossBorderDoc,
  reviewCrossBorderDoc,
} from '../services/order.service.js'
import { findUserById } from '../services/auth.service.js'
import {
  getRouteDistanceKm,
  reverseGeocode,
  getPricingRule,
  calculateQuote,
} from '../services/pricing.service.js'
import { generateInvoice } from '../services/invoice.service.js'
import { sendOrderPlacedEmail } from '../services/email.service.js'
import { sanitizeChatContent } from '../utils/privacy.js'
import { wsManager } from '../utils/wsManager.js'
import {
  createDriverRating,
  getDriverRatingSummary,
  hasRatedOrder,
} from '../services/profile.service.js'
import { notifyAdminsOfEvent, sendPushToRole, sendPushToUser } from '../services/push.service.js'
import fs from 'fs'
import path from 'path'

// ─── Body / Param types ───────────────────────────────────────────────────────

interface QuoteBody {
  pickup_lat: number
  pickup_lng: number
  delivery_lat: number
  delivery_lng: number
  vehicle_type: string
  estimated_weight_kg?: number
  is_cross_border?: boolean
}

interface PlaceOrderBody {
  cargo_type_id: number
  pickup_lat: number
  pickup_lng: number
  pickup_address?: string
  delivery_lat: number
  delivery_lng: number
  delivery_address?: string
  estimated_weight_kg?: number
  vehicle_type: string
  special_instructions?: string
  order_image_1?: string  // base64
  order_image_2?: string  // base64
  // Quote lock-in (caller echoes back the server's quote for auditability)
  distance_km?: number
  estimated_price?: number
  // Cross-border
  is_cross_border?: boolean
  pickup_country_id?: number
  delivery_country_id?: number
  hs_code?: string
  shipper_tin?: string
}

interface OrderParams { id: string }

interface SendMessageBody { message: string }
interface UploadCrossBorderDocBody { document_type: string; file_base64: string; notes?: string }

interface OrderListQuery {
  page?: string
  limit?: string
  status?: string
}

interface ShipperReportQuery {
  from?: string
  to?: string
}

function parseDateOnly(input: string | undefined, fallback: Date): Date {
  if (!input) return fallback
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return fallback
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  return new Date(y, mo, d)
}

function sqlDateTime(date: Date, endOfDay = false): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d} ${endOfDay ? '23:59:59' : '00:00:00'}`
}

function sqlDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
// ─── Image helpers ─────────────────────────────────────────────────────────────

function saveOrderImage(base64Data: string, orderId: string, slot: 1 | 2): string {
  const match = base64Data.match(/^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/)
  const raw  = match ? match[2] : base64Data
  const ext  = match?.[1].split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
  const dir  = path.join(process.cwd(), 'uploads', 'order-images')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const filename = `${orderId}-${slot}.${ext}`
  fs.writeFileSync(path.join(dir, filename), Buffer.from(raw, 'base64'))
  return `/uploads/order-images/${filename}`
}

function saveCrossBorderDocFile(orderId: string, documentType: string, fileBase64: string): string {
  const match = fileBase64.match(/^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/)
  const raw   = match ? match[2] : fileBase64
  const mime  = match ? match[1] : 'image/jpeg'
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'application/pdf': 'pdf',
  }
  const ext = extMap[mime] ?? 'jpg'

  const dir = path.join(process.cwd(), 'uploads', 'cross-border')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const filename = `cb_${orderId}_${documentType}_${Date.now()}.${ext}`
  fs.writeFileSync(path.join(dir, filename), Buffer.from(raw, 'base64'))
  return `/uploads/cross-border/${filename}`
}
// ─── Helper ───────────────────────────────────────────────────────────────────

/** Ensure user has shipper role (role_id = 2). Admins and dispatchers may also access. */
function guardOrderAccess(request: FastifyRequest, reply: FastifyReply): boolean {
  const roleId = (request.user as any).role_id
  // Shippers (2) can access their own orders; Admins (1) and Dispatchers (4) have admin routes
  if (roleId === 2 || roleId === 1 || roleId === 4) return true
  reply.status(403).send({ success: false, message: 'Access denied.' })
  return false
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/** GET /api/orders/cargo-types */
export async function listCargoTypesHandler(
  request: FastifyRequest,
  reply:   FastifyReply
) {
  const types = await listActiveCargoTypes(request.server.db)
  return reply.send({ success: true, cargo_types: types })
}

/** POST /api/orders/quote */
export async function getQuoteHandler(
  request: FastifyRequest<{ Body: QuoteBody }>,
  reply:   FastifyReply
) {
  const { pickup_lat, pickup_lng, delivery_lat, delivery_lng, vehicle_type, estimated_weight_kg, is_cross_border } = request.body

  if (!pickup_lat || !pickup_lng || !delivery_lat || !delivery_lng || !vehicle_type) {
    return reply.status(400).send({ success: false, message: 'pickup_lat, pickup_lng, delivery_lat, delivery_lng, vehicle_type are required.' })
  }

  const rule = await getPricingRule(request.server.db, vehicle_type)
  if (!rule) {
    return reply.status(400).send({ success: false, message: `No pricing rule found for vehicle type: ${vehicle_type}` })
  }

  // Get actual route distance (Mapbox if configured, else Haversine)
  const distanceKm = await getRouteDistanceKm(pickup_lat, pickup_lng, delivery_lat, delivery_lng)

  // Reverse geocode in parallel
  const [pickupAddr, deliveryAddr] = await Promise.all([
    reverseGeocode(pickup_lat, pickup_lng),
    reverseGeocode(delivery_lat, delivery_lng),
  ])

  const quote = calculateQuote(distanceKm, rule, estimated_weight_kg, is_cross_border)

  return reply.send({
    success: true,
    quote: {
      ...quote,
      pickup_address:   pickupAddr,
      delivery_address: deliveryAddr,
    },
  })
}

/** POST /api/orders — Place a new order */
export async function placeOrderHandler(
  request: FastifyRequest<{ Body: PlaceOrderBody }>,
  reply:   FastifyReply
) {
  const user = request.user as any
  if (user.role_id !== 2) {
    return reply.status(403).send({ success: false, message: 'Only shippers can place orders.' })
  }

  const {
    cargo_type_id, pickup_lat, pickup_lng, delivery_lat, delivery_lng,
    estimated_weight_kg, vehicle_type, special_instructions,
    is_cross_border, pickup_country_id, delivery_country_id, hs_code, shipper_tin,
  } = request.body

  if (!cargo_type_id || !pickup_lat || !pickup_lng || !delivery_lat || !delivery_lng || !vehicle_type) {
    return reply.status(400).send({ success: false, message: 'cargo_type_id, pickup coordinates, delivery coordinates and vehicle_type are required.' })
  }

  // Lock in the price fresh from the server (never trust client-submitted price)
  const rule = await getPricingRule(request.server.db, vehicle_type)
  if (!rule) {
    return reply.status(400).send({ success: false, message: `No pricing rule for vehicle type: ${vehicle_type}` })
  }

  const distanceKm = await getRouteDistanceKm(pickup_lat, pickup_lng, delivery_lat, delivery_lng)

  // Reverse geocode addresses (best effort)
  let pickupAddr   = request.body.pickup_address ?? null
  let deliveryAddr = request.body.delivery_address ?? null
  if (!pickupAddr || !deliveryAddr) {
    const [pa, da] = await Promise.all([
      pickupAddr   ? Promise.resolve(pickupAddr)   : reverseGeocode(pickup_lat, pickup_lng),
      deliveryAddr ? Promise.resolve(deliveryAddr) : reverseGeocode(delivery_lat, delivery_lng),
    ])
    pickupAddr   = pa
    deliveryAddr = da
  }

  const quote      = calculateQuote(distanceKm, rule, estimated_weight_kg, is_cross_border)
  const pickupOtp  = generateOtp()
  const deliveryOtp = generateOtp()

  // ─── CHECK WALLET BALANCE ─────────────────────────────────────────────────────
  const { validateOrderPayment } = await import('../services/payment.service.js')
  const paymentValidation = await validateOrderPayment(request.server.db, user.id, quote.estimated_price)

  if (!paymentValidation.hasSufficientBalance) {
    return reply.status(402).send({
      success: false,
      message: `Insufficient wallet balance. You need ${paymentValidation.shortfall.toFixed(2)} ETB more.`,
      current_balance: paymentValidation.currentBalance,
      required_balance: quote.estimated_price,
      shortfall: paymentValidation.shortfall,
      action: 'RECHARGE_WALLET',
    })
  }

  // Save order images if provided
  const tempId = require('node:crypto').randomUUID()
  let img1Url: string | null = null
  let img2Url: string | null = null
  try {
    if (request.body.order_image_1) img1Url = saveOrderImage(request.body.order_image_1, tempId, 1)
    if (request.body.order_image_2) img2Url = saveOrderImage(request.body.order_image_2, tempId, 2)
  } catch { /* image save failures don't block order placement */ }

  const orderId = await createOrder(request.server.db, {
    shipperId:           user.id,
    cargoTypeId:         cargo_type_id,
    pickupLat:           pickup_lat,
    pickupLng:           pickup_lng,
    pickupAddress:       pickupAddr,
    deliveryLat:         delivery_lat,
    deliveryLng:         delivery_lng,
    deliveryAddress:     deliveryAddr,
    estimatedWeightKg:   estimated_weight_kg ?? null,
    vehicleTypeRequired: vehicle_type,
    specialInstructions: special_instructions ?? null,
    distanceKm:          quote.distance_km,
    baseFare:            quote.base_fare,
    perKmRate:           quote.per_km_rate,
    citySurcharge:       quote.city_surcharge,
    estimatedPrice:      quote.estimated_price,
    pickupOtp,
    deliveryOtp,
    orderImage1Url:      img1Url,
    orderImage2Url:      img2Url,
    isCrossBorder:       is_cross_border ?? false,
    pickupCountryId:     pickup_country_id ?? 1,
    deliveryCountryId:   delivery_country_id ?? 1,
    hsCode:              hs_code ?? null,
    shipperTin:          shipper_tin ?? null,
  })

  const order = await getOrderById(request.server.db, orderId)

  // Fire-and-forget: send OTP confirmation email to shipper
  findUserById(request.server.db, user.id).then(shipper => {
    if (!shipper?.email || !shipper.is_email_verified) return
    sendOrderPlacedEmail(shipper.email, {
      referenceCode:   order!.reference_code,
      recipientName:   shipper.first_name,
      pickupAddress:   pickupAddr   ?? 'N/A',
      deliveryAddress: deliveryAddr ?? 'N/A',
      pickupOtp,
      deliveryOtp,
      estimatedPrice: `${Number(order!.estimated_price).toFixed(2)} ETB`,
    }).catch(() => { /* never block the response */ })
  }).catch(() => { /* never block the response */ })

  // Return OTPs to the shipper in plain text so they can give them to driver at pickup/delivery
  notifyAdminsOfEvent(
    request.server.db,
    `New Order Received: ${order!.reference_code}`,
    `A new shipment request was created by ${user.first_name ?? 'a shipper'}.`,
    '/admin'
  ).catch(() => {})

  return reply.status(201).send({
    success: true,
    message: 'Order placed successfully.',
    order,
    otps: {
      pickup_otp:   pickupOtp,
      delivery_otp: deliveryOtp,
    },
  })
}

/** GET /api/orders */
export async function listMyOrdersHandler(
  request: FastifyRequest<{ Querystring: OrderListQuery }>,
  reply:   FastifyReply
) {
  const user = request.user as any
  if (!guardOrderAccess(request, reply)) return

  const page  = parseInt(request.query.page  ?? '1',  10)
  const limit = parseInt(request.query.limit ?? '20', 10)

  const { orders, total } = await listOrders(request.server.db, {
    shipperId: user.role_id === 2 ? user.id : undefined,
    status: request.query.status,
    page,
    limit,
  })

  return reply.send({
    success: true,
    orders,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  })
}

/** GET /api/orders/report?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function getShipperReportHandler(
  request: FastifyRequest<{ Querystring: ShipperReportQuery }>,
  reply: FastifyReply
) {
  const user = request.user as any
  if (user.role_id !== 2) {
    return reply.status(403).send({ success: false, message: 'Shipper access only.' })
  }

  const db = request.server.db
  const now = new Date()
  const toDate = parseDateOnly(request.query.to, now)
  const fromDate = parseDateOnly(
    request.query.from,
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  )

  const fromStr = sqlDateTime(fromDate, false)
  const toStr = sqlDateTime(toDate, true)

  const [shipperRows] = await db.query<any[]>(`
    SELECT id, first_name, last_name, phone_number, email
    FROM users
    WHERE id = ?
    LIMIT 1
  `, [user.id])
  const shipper = shipperRows[0] ?? {}

  const [summaryRows] = await db.query<any[]>(`
    SELECT
      COUNT(*) AS total_orders,
      SUM(CASE WHEN status IN ('DELIVERED','COMPLETED') THEN 1 ELSE 0 END) AS completed_orders,
      SUM(CASE WHEN status IN ('ASSIGNED','EN_ROUTE','AT_PICKUP','IN_TRANSIT','AT_BORDER','IN_CUSTOMS','CUSTOMS_CLEARED') THEN 1 ELSE 0 END) AS active_orders,
      SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_orders,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_orders,
      SUM(is_cross_border) AS cross_border_orders,
      ROUND(SUM(COALESCE(final_price, estimated_price, 0)), 2) AS total_spent,
      ROUND(AVG(COALESCE(final_price, estimated_price, 0)), 2) AS avg_order_value,
      ROUND(SUM(COALESCE(distance_km, 0)), 1) AS total_distance_km,
      ROUND(AVG(CASE WHEN picked_up_at IS NOT NULL AND delivered_at IS NOT NULL
                     THEN TIMESTAMPDIFF(MINUTE, picked_up_at, delivered_at) / 60 END), 2) AS avg_delivery_hours,
      SUM(CASE WHEN payment_status = 'SETTLED' THEN 1 ELSE 0 END) AS paid_orders,
      SUM(CASE WHEN payment_status IN ('UNPAID','ESCROWED') THEN 1 ELSE 0 END) AS unpaid_orders
    FROM orders
    WHERE shipper_id = ?
      AND created_at BETWEEN ? AND ?
  `, [user.id, fromStr, toStr])
  const summary = summaryRows[0] ?? {}

  const [dailyRows] = await db.query<any[]>(`
    SELECT
      DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
      COUNT(*) AS orders,
      SUM(CASE WHEN status IN ('DELIVERED','COMPLETED') THEN 1 ELSE 0 END) AS completed,
      ROUND(SUM(COALESCE(final_price, estimated_price, 0)), 2) AS spent,
      ROUND(SUM(COALESCE(distance_km, 0)), 1) AS distance_km
    FROM orders
    WHERE shipper_id = ?
      AND created_at BETWEEN ? AND ?
    GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
    ORDER BY date ASC
  `, [user.id, fromStr, toStr])

  const [statusRows] = await db.query<any[]>(`
    SELECT status, COUNT(*) AS count
    FROM orders
    WHERE shipper_id = ?
      AND created_at BETWEEN ? AND ?
    GROUP BY status
    ORDER BY count DESC
  `, [user.id, fromStr, toStr])

  const [paymentRows] = await db.query<any[]>(`
    SELECT payment_status, COUNT(*) AS count
    FROM orders
    WHERE shipper_id = ?
      AND created_at BETWEEN ? AND ?
    GROUP BY payment_status
    ORDER BY count DESC
  `, [user.id, fromStr, toStr])

  const [vehicleRows] = await db.query<any[]>(`
    SELECT
      COALESCE(vehicle_type_required, 'Unspecified') AS vehicle_type,
      COUNT(*) AS orders,
      ROUND(SUM(COALESCE(final_price, estimated_price, 0)), 2) AS spent,
      ROUND(AVG(COALESCE(distance_km, 0)), 1) AS avg_km
    FROM orders
    WHERE shipper_id = ?
      AND created_at BETWEEN ? AND ?
    GROUP BY vehicle_type_required
    ORDER BY orders DESC
  `, [user.id, fromStr, toStr])

  const [routeRows] = await db.query<any[]>(`
    SELECT
      TRIM(SUBSTRING_INDEX(pickup_address, ',', 1)) AS from_city,
      TRIM(SUBSTRING_INDEX(delivery_address, ',', 1)) AS to_city,
      COUNT(*) AS count,
      ROUND(AVG(COALESCE(distance_km, 0)), 1) AS avg_km
    FROM orders
    WHERE shipper_id = ?
      AND created_at BETWEEN ? AND ?
      AND pickup_address IS NOT NULL
      AND delivery_address IS NOT NULL
    GROUP BY from_city, to_city
    ORDER BY count DESC
    LIMIT 8
  `, [user.id, fromStr, toStr])

  const [recentRows] = await db.query<any[]>(`
    SELECT
      o.id,
      o.reference_code,
      o.status,
      o.payment_status,
      o.pickup_address,
      o.delivery_address,
      o.created_at,
      o.delivered_at,
      ROUND(COALESCE(o.final_price, o.estimated_price, 0), 2) AS amount,
      ROUND(COALESCE(o.distance_km, 0), 1) AS distance_km,
      o.is_cross_border,
      CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name
    FROM orders o
    LEFT JOIN users d ON d.id = o.driver_id
    WHERE o.shipper_id = ?
      AND o.created_at BETWEEN ? AND ?
    ORDER BY o.created_at DESC
    LIMIT 10
  `, [user.id, fromStr, toStr])

  const [ratingRows] = await db.query<any[]>(`
    SELECT
      COUNT(*) AS ratings_given,
      ROUND(AVG(stars), 2) AS avg_stars_given
    FROM driver_ratings
    WHERE shipper_id = ?
      AND is_deleted = 0
      AND created_at BETWEEN ? AND ?
  `, [user.id, fromStr, toStr])
  const ratings = ratingRows[0] ?? {}

  return reply.send({
    success: true,
    report: {
      generated_at: new Date().toISOString(),
      date_range: {
        from: sqlDate(fromDate),
        to: sqlDate(toDate),
      },
      shipper: {
        id: String(shipper.id ?? user.id),
        first_name: String(shipper.first_name ?? ''),
        last_name: String(shipper.last_name ?? ''),
        name: `${String(shipper.first_name ?? '')} ${String(shipper.last_name ?? '')}`.trim(),
        phone_number: String(shipper.phone_number ?? ''),
        email: String(shipper.email ?? ''),
      },
      summary: {
        total_orders: Number(summary.total_orders ?? 0),
        completed_orders: Number(summary.completed_orders ?? 0),
        active_orders: Number(summary.active_orders ?? 0),
        cancelled_orders: Number(summary.cancelled_orders ?? 0),
        failed_orders: Number(summary.failed_orders ?? 0),
        cross_border_orders: Number(summary.cross_border_orders ?? 0),
        total_spent: Number(summary.total_spent ?? 0),
        avg_order_value: Number(summary.avg_order_value ?? 0),
        total_distance_km: Number(summary.total_distance_km ?? 0),
        avg_delivery_hours: Number(summary.avg_delivery_hours ?? 0),
        paid_orders: Number(summary.paid_orders ?? 0),
        unpaid_orders: Number(summary.unpaid_orders ?? 0),
      },
      daily: (dailyRows as any[]).map((row) => ({
        date: String(row.date),
        orders: Number(row.orders ?? 0),
        completed: Number(row.completed ?? 0),
        spent: Number(row.spent ?? 0),
        distance_km: Number(row.distance_km ?? 0),
      })),
      by_status: (statusRows as any[]).map((row) => ({
        status: String(row.status),
        count: Number(row.count ?? 0),
      })),
      by_payment: (paymentRows as any[]).map((row) => ({
        payment_status: String(row.payment_status),
        count: Number(row.count ?? 0),
      })),
      by_vehicle: (vehicleRows as any[]).map((row) => ({
        vehicle_type: String(row.vehicle_type),
        orders: Number(row.orders ?? 0),
        spent: Number(row.spent ?? 0),
        avg_km: Number(row.avg_km ?? 0),
      })),
      top_routes: (routeRows as any[]).map((row) => ({
        from_city: String(row.from_city ?? ''),
        to_city: String(row.to_city ?? ''),
        count: Number(row.count ?? 0),
        avg_km: Number(row.avg_km ?? 0),
      })),
      recent_orders: (recentRows as any[]).map((row) => ({
        id: String(row.id),
        reference_code: String(row.reference_code),
        status: String(row.status),
        payment_status: String(row.payment_status),
        pickup_address: String(row.pickup_address ?? ''),
        delivery_address: String(row.delivery_address ?? ''),
        created_at: String(row.created_at),
        delivered_at: row.delivered_at ? String(row.delivered_at) : null,
        amount: Number(row.amount ?? 0),
        distance_km: Number(row.distance_km ?? 0),
        is_cross_border: Boolean(row.is_cross_border),
        driver_name: String(row.driver_name ?? 'Unassigned'),
      })),
      feedback: {
        ratings_given: Number(ratings.ratings_given ?? 0),
        avg_stars_given: Number(ratings.avg_stars_given ?? 0),
      },
    },
  })
}

/** GET /api/orders/:id */
export async function getOrderHandler(
  request: FastifyRequest<{ Params: OrderParams }>,
  reply:   FastifyReply
) {
  const user  = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  // Shippers can only see their own orders
  if (user.role_id === 2 && order.shipper_id !== user.id) {
    return reply.status(403).send({ success: false, message: 'Access denied.' })
  }
  // Drivers can only see their assigned orders
  if (user.role_id === 3 && order.driver_id !== user.id) {
    return reply.status(403).send({ success: false, message: 'Access denied.' })
  }

  return reply.send({ success: true, order })
}

/** GET /api/orders/:id/track */
export async function trackOrderHandler(
  request: FastifyRequest<{ Params: OrderParams }>,
  reply:   FastifyReply
) {
  const user  = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  if (user.role_id === 2 && order.shipper_id !== user.id) {
    return reply.status(403).send({ success: false, message: 'Access denied.' })
  }

  const location = await getOrderTrackingInfo(request.server.db, request.params.id)

  return reply.send({
    success: true,
    status: order.status,
    driver: order.driver_id ? {
      id:        order.driver_id,
      name:      `${order.driver_first_name ?? ''} ${order.driver_last_name ?? ''}`.trim(),
      photo_url: order.driver_photo_url,
    } : null,
    location: location ? {
      lat:         location.lat,
      lng:         location.lng,
      heading:     location.heading,
      speed_kmh:   location.speed_kmh,
      recorded_at: location.recorded_at,
    } : null,
  })
}

/** GET /api/orders/:id/history */
export async function getOrderHistoryHandler(
  request: FastifyRequest<{ Params: OrderParams }>,
  reply:   FastifyReply
) {
  const history = await getOrderStatusHistory(request.server.db, request.params.id)
  return reply.send({ success: true, history })
}

/** GET /api/orders/:id/cross-border-docs */
export async function getCrossBorderDocsHandler(
  request: FastifyRequest<{ Params: OrderParams }>,
  reply: FastifyReply
) {
  const user = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })
  if (user.role_id === 2 && order.shipper_id !== user.id) {
    return reply.status(403).send({ success: false, message: 'Access denied.' })
  }
  if (!order.is_cross_border) {
    return reply.status(400).send({ success: false, message: 'This is not a cross-border order.' })
  }

  const docs = await listCrossBorderDocs(request.server.db, request.params.id)
  return reply.send({ success: true, documents: docs })
}

/** POST /api/orders/:id/cross-border-doc */
export async function uploadCrossBorderDocHandler(
  request: FastifyRequest<{ Params: OrderParams; Body: UploadCrossBorderDocBody }>,
  reply: FastifyReply
) {
  const user = request.user as any
  if (user.role_id !== 2) {
    return reply.status(403).send({ success: false, message: 'Only shippers can upload here.' })
  }

  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })
  if (order.shipper_id !== user.id) return reply.status(403).send({ success: false, message: 'Access denied.' })
  if (!order.is_cross_border) {
    return reply.status(400).send({ success: false, message: 'This is not a cross-border order.' })
  }

  const { document_type, file_base64, notes } = request.body
  const VALID_DOC_TYPES = ['COMMERCIAL_INVOICE', 'BILL_OF_LADING', 'PACKING_LIST', 'CERTIFICATE_OF_ORIGIN', 'CHECKPOINT_PHOTO', 'OTHER']
  if (!VALID_DOC_TYPES.includes(document_type)) {
    return reply.status(400).send({ success: false, message: `document_type must be one of: ${VALID_DOC_TYPES.join(', ')}` })
  }
  if (!file_base64?.trim()) {
    return reply.status(400).send({ success: false, message: 'file_base64 is required.' })
  }

  const fileUrl = saveCrossBorderDocFile(order.id, document_type, file_base64)
  const docId = await createCrossBorderDoc(request.server.db, order.id, user.id, document_type as any, fileUrl, notes ?? null)

  wsManager.broadcast(order.id, 'CB_DOC_UPLOADED', { doc_id: docId, document_type, file_url: fileUrl })

  return reply.status(201).send({
    success: true,
    message: 'Document uploaded successfully. Pending admin review.',
    doc_id: docId,
    file_url: fileUrl,
  })
}

/** PUT /api/orders/:id/cross-border-docs/:docId/review
 * Allow shipper (owner) to mark their own uploaded documents as APPROVED/REJECTED
 * Body: { action: 'APPROVED'|'REJECTED'|'PENDING_REVIEW', review_notes?: string }
 */
export async function shipperReviewCrossBorderDocHandler(
  request: FastifyRequest<{ Params: { id: string; docId: string }; Body: { action?: string; review_notes?: string } }>,
  reply: FastifyReply
) {
  const user = request.user as any
  if (user.role_id !== 2) return reply.status(403).send({ success: false, message: 'Shipper access only.' })

  const body = (request.body as any) ?? {}
  const actionInput = String(body.action ?? '').trim().toLowerCase()
  const actionMap: Record<string, string> = {
    approve: 'APPROVED', approved: 'APPROVED',
    reject: 'REJECTED',  rejected: 'REJECTED',
    pending_review: 'PENDING_REVIEW',
  }
  const rawAction = actionMap[actionInput] ?? String(body.action ?? '').trim().toUpperCase()
  const review_notes = body.review_notes ?? null
  const allowed = ['APPROVED', 'REJECTED', 'PENDING_REVIEW']
  if (!rawAction) return reply.status(400).send({ success: false, message: 'action is required in request body.' })
  if (!allowed.includes(rawAction)) return reply.status(400).send({ success: false, message: 'action must be APPROVED, REJECTED, or PENDING_REVIEW.' })
  if (rawAction === 'REJECTED' && !(String(review_notes ?? '').trim())) {
    return reply.status(400).send({ success: false, message: 'review_notes is required when rejecting.' })
  }

  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })
  if (String(order.shipper_id) !== String(user.id)) return reply.status(403).send({ success: false, message: 'Access denied.' })
  if (!order.is_cross_border) return reply.status(400).send({ success: false, message: 'This is not a cross-border order.' })

  const docId = String(request.params.docId || '').trim()
  if (!docId) return reply.status(400).send({ success: false, message: 'Invalid docId.' })

  // Verify doc belongs to this order
  const [docRows] = await request.server.db.query<any[]>(
    `SELECT id FROM cross_border_documents WHERE id = ? AND order_id = ?`,
    [docId, request.params.id]
  )
  if (!docRows[0]) return reply.status(404).send({ success: false, message: 'Document not found on this order.' })

  await reviewCrossBorderDoc(request.server.db, docId, user.id, rawAction as any, review_notes ?? null)

  // Notify driver if assigned
  if (order?.driver_id) {
    const { sendPushToUser: pushToUser } = await import('../services/push.service.js')
    await pushToUser(request.server.db, order.driver_id, {
      title: `Document ${rawAction === 'APPROVED' ? 'Approved ✓' : rawAction === 'REJECTED' ? 'Rejected ✗' : 'Under Review'}`,
      body: `Cross-border document for order ${order.reference_code} has been ${rawAction.toLowerCase()}.`,
      url: '/driver/jobs',
      data: { order_id: order.id, doc_id: docId, type: 'CB_DOC_REVIEWED' },
    }).catch(() => {})
  }

  return reply.send({ success: true, message: `Document ${rawAction.toLowerCase()}.` })
}

/** GET /api/orders/:id/messages */
export async function getMessagesHandler(
  request: FastifyRequest<{ Params: OrderParams }>,
  reply:   FastifyReply
) {
  const user  = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  const isParty = order.shipper_id === user.id || order.driver_id === user.id || user.role_id <= 2
  if (!isParty) return reply.status(403).send({ success: false, message: 'Access denied.' })

  // Shippers can only see their channels: main (driver↔shipper) and shipper (admin↔shipper)
  const channelParam = (request.query as any).channel as string | undefined
  const allowedChannels = ['main', 'shipper']
  const channel = channelParam && allowedChannels.includes(channelParam) ? channelParam : undefined
  const messages = await getOrderMessages(request.server.db, request.params.id, channel)
  await markMessagesRead(request.server.db, request.params.id, user.id)

  const sanitized = messages.map((m: any) => ({ ...m, message: sanitizeChatContent(String(m.message ?? '')) }))
  return reply.send({ success: true, messages: sanitized })
}

/** POST /api/orders/:id/messages */
export async function sendMessageHandler(
  request: FastifyRequest<{ Params: OrderParams; Body: SendMessageBody & { channel?: string } }>,
  reply:   FastifyReply
) {
  const user  = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  const isParty = order.shipper_id === user.id || order.driver_id === user.id || user.role_id <= 2
  if (!isParty) return reply.status(403).send({ success: false, message: 'Access denied.' })

  const { message } = request.body
  if (!message?.trim()) return reply.status(400).send({ success: false, message: 'Message cannot be empty.' })

  const cleanedMessage = sanitizeChatContent(message.trim())

  // Restrict shipper to main/shipper channels only
  const allowedCh = ['main', 'shipper']
  const channel = request.body.channel && allowedCh.includes(request.body.channel) ? request.body.channel : 'main'
  const msg = await createOrderMessage(request.server.db, request.params.id, user.id, cleanedMessage, channel)

  // Broadcast to WS subscribers
  wsManager.broadcast(request.params.id, 'NEW_MESSAGE', { message: msg })

  if (channel === 'main' && order.driver_id && order.driver_id !== user.id) {
    await sendPushToUser(request.server.db, order.driver_id, {
      title: `New Message on ${order.reference_code}`,
      body: `From ${user.first_name ?? 'Shipper'} ${user.last_name ?? ''}`.trim(),
      url: '/driver/jobs',
      data: { order_id: order.id, reference_code: order.reference_code, type: 'NEW_CHAT_MESSAGE' },
    }).catch(() => {})
  }

  if (user.role_id !== 1) {
    await sendPushToRole(request.server.db, 1, {
      title: `Order Chat: ${order.reference_code}`,
      body: `New ${channel} message from ${user.role_name ?? 'user'}.`,
      url: '/admin',
      data: { order_id: order.id, reference_code: order.reference_code, channel, type: 'ADMIN_ORDER_CHAT_ALERT' },
    }).catch(() => {})
  }

  return reply.status(201).send({ success: true, message: msg })
}

/** POST /api/orders/:id/cancel */
export async function cancelOrderHandler(
  request: FastifyRequest<{ Params: OrderParams }>,
  reply:   FastifyReply
) {
  const user  = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  if (user.role_id === 2 && order.shipper_id !== user.id) {
    return reply.status(403).send({ success: false, message: 'Access denied.' })
  }
  if (!['PENDING', 'ASSIGNED'].includes(order.status)) {
    return reply.status(400).send({ success: false, message: `Cannot cancel an order with status: ${order.status}` })
  }

  await cancelOrder(request.server.db, order.id, user.id)
  wsManager.broadcast(order.id, 'STATUS_CHANGED', { status: 'CANCELLED' })

  return reply.send({ success: true, message: 'Order cancelled.' })
}

/** GET /api/orders/:id/invoice */
export async function downloadInvoiceHandler(
  request: FastifyRequest<{ Params: OrderParams }>,
  reply:   FastifyReply
) {
  const user  = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  if (user.role_id === 2 && order.shipper_id !== user.id) {
    return reply.status(403).send({ success: false, message: 'Access denied.' })
  }
  if (!['DELIVERED', 'COMPLETED'].includes(order.status)) {
    return reply.status(400).send({ success: false, message: 'Invoice is only available after delivery.' })
  }

  const invoiceUrl = await generateInvoice(request.server.db, order.id)
  if (!invoiceUrl) return reply.status(500).send({ success: false, message: 'Failed to generate invoice.' })

  // Stream the PDF file
  const filePath = path.join(process.cwd(), invoiceUrl)
  if (!fs.existsSync(filePath)) {
    return reply.status(404).send({ success: false, message: 'Invoice file not found.' })
  }

  const stream = fs.createReadStream(filePath)
  return reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `attachment; filename="${order.reference_code}.pdf"`)
    .send(stream)
}

/** GET /api/orders/unread-counts — unread message counts per order for the current user */
export async function getUnreadCountsHandler(
  request: FastifyRequest,
  reply:   FastifyReply
) {
  const user = request.user as any
  const counts = await getUnreadCounts(request.server.db, user.id)
  return reply.send({ success: true, counts })
}

// ─── Driver Rating ─────────────────────────────────────────────────────────────

/**
 * POST /api/orders/:id/rate-driver
 * Body: { stars: 1-5, comment?: string }
 * Only the shipper of a DELIVERED/COMPLETED order can rate.
 */
export async function rateDriverHandler(
  request: FastifyRequest<{ Params: OrderParams; Body: { stars: number; comment?: string } }>,
  reply:   FastifyReply
) {
  const user  = request.user as any
  if (user.role_id !== 2) return reply.status(403).send({ success: false, message: 'Only shippers can rate drivers.' })

  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })
  if (order.shipper_id !== user.id) return reply.status(403).send({ success: false, message: 'This is not your order.' })
  if (!['DELIVERED', 'COMPLETED'].includes(order.status)) {
    return reply.status(400).send({ success: false, message: 'You can only rate after delivery.' })
  }
  if (!order.driver_id) return reply.status(400).send({ success: false, message: 'No driver assigned to this order.' })

  const alreadyRated = await hasRatedOrder(request.server.db, order.id)
  if (alreadyRated) return reply.status(409).send({ success: false, message: 'You have already rated this delivery.' })

  const { stars, comment } = request.body ?? {}
  if (!stars || stars < 1 || stars > 5) {
    return reply.status(400).send({ success: false, message: 'stars must be between 1 and 5.' })
  }

  await createDriverRating(
    request.server.db,
    order.driver_id,
    user.id,
    order.id,
    Math.round(stars),
    comment?.trim() || null
  )

  return reply.status(201).send({ success: true, message: 'Rating submitted. Thank you!' })
}

/**
 * GET /api/orders/drivers/:driverId/rating-summary
 * Public within authenticated users — returns combined rating + system score.
 */
export async function getDriverRatingSummaryHandler(
  request: FastifyRequest<{ Params: { driverId: string } }>,
  reply:   FastifyReply
) {
  const summary = await getDriverRatingSummary(request.server.db, request.params.driverId)
  return reply.send({ success: true, summary })
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── TIP SYSTEM ────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/orders/:id/add-tip
 * Shipper adds optional tip to order (only allowed for DELIVERED orders)
 * Body: { tip_amount, rating_stars }
 */
export async function addTipHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { tip_amount: number; rating_stars?: number } }>,
  reply:   FastifyReply
) {
  const user = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)

  if (!order) {
    return reply.status(404).send({ success: false, message: 'Order not found' })
  }

  if (order.shipper_id !== user.id) {
    return reply.status(403).send({ success: false, message: 'Only shipper can add tip' })
  }

  if (!['DELIVERED', 'COMPLETED'].includes(order.status)) {
    return reply.status(400).send({ success: false, message: 'Can only add tip to delivered orders' })
  }

  if (!order.driver_id) {
    return reply.status(400).send({ success: false, message: 'Driver not assigned to this order' })
  }

  const { tip_amount, rating_stars = 5 } = request.body

  if (typeof tip_amount !== 'number' || tip_amount <= 0 || tip_amount > 50000) {
    return reply.status(400).send({ success: false, message: 'Tip must be between 1 and 50,000 ETB' })
  }

  if (!Number.isInteger(rating_stars) || rating_stars < 1 || rating_stars > 5) {
    return reply.status(400).send({ success: false, message: 'Rating must be 1-5 stars' })
  }

  try {
    const { addOrderCharge, applyOrderCharge } = await import('../services/payment.service.js')
    const { checkSufficientBalance, addWalletTransaction } = await import('../services/wallet.service.js')
    const { sendPushToUser } = await import('../services/push.service.js')

    const hasBalance = await checkSufficientBalance(request.server.db, user.id, tip_amount)
    if (!hasBalance) {
      return reply.status(400).send({ success: false, message: 'Insufficient wallet balance for this tip' })
    }

    // Add tip as charge
    const chargeId = await addOrderCharge(
      request.server.db,
      request.params.id,
      'TIP',
      tip_amount,
      `Tip (${rating_stars}★ rating)${rating_stars >= 4 ? ' - Excellent Service' : rating_stars >= 3 ? ' - Good Service' : rating_stars >= 2 ? ' - Acceptable Service' : ' - Please improve'}`,
      user.id,
      true
    )

    // Auto-apply the charge
    await applyOrderCharge(request.server.db, chargeId, user.id)

    // Wallet ledger transfer (shipper -> driver)
    await addWalletTransaction(
      request.server.db,
      user.id,
      'TIP',
      tip_amount,
      `Tip paid to driver - ${order.reference_code}`,
      request.params.id,
      order.reference_code,
      String(order.driver_id),
      { type: 'tip_payment', charge_id: chargeId }
    )

    await addWalletTransaction(
      request.server.db,
      String(order.driver_id),
      'CREDIT',
      tip_amount,
      `Tip received from shipper - ${order.reference_code}`,
      request.params.id,
      order.reference_code,
      user.id,
      { type: 'tip_income', charge_id: chargeId }
    )

    // Notify driver immediately
    const driverId = String(order.driver_id)
    await sendPushToUser(request.server.db, driverId, {
      title: `${rating_stars}★ Tip Received!`,
      body: `You received a ${tip_amount.toFixed(2)} ETB tip from order ${order.reference_code}`,
      url: `/jobs/${request.params.id}`,
      data: { order_id: request.params.id, type: 'tip_received', amount: tip_amount }
    }).catch(() => {})

    return reply.status(201).send({
      success: true,
      message: `Tip of ${tip_amount.toFixed(2)} ETB added successfully`,
      charge_id: chargeId,
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to add tip' })
  }
}

/**
 * GET /api/orders/:id/charges
 * Get all charges (tips, extra fees) for an order
 */
export async function getOrderChargesHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply:   FastifyReply
) {
  const user = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)

  if (!order) {
    return reply.status(404).send({ success: false, message: 'Order not found' })
  }

  // Only shipper, driver, or admin can view charges
  if (order.shipper_id !== user.id && order.driver_id !== user.id && user.role_id !== 1) {
    return reply.status(403).send({ success: false, message: 'Not authorized' })
  }

  try {
    const { getOrderCharges } = await import('../services/payment.service.js')
    const { charges, totalOptional, totalApproved } = await getOrderCharges(request.server.db, request.params.id)

    return reply.send({
      success: true,
      charges: charges.map((c) => ({
        id: c.id,
        type: c.charge_type,
        amount: Number(c.amount),
        description: c.description,
        is_optional: Boolean(c.is_optional),
        status: c.status,
      })),
      summary: {
        total_optional: totalOptional,
        total_approved: totalApproved,
        total: totalOptional + totalApproved,
      },
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to fetch charges' })
  }
}

/**
 * POST /api/orders/:id/extra-charge
 * Admin or shipper adds extra charge (waiting time, loading fee, etc.)
 * Body: { charge_type, amount, description, is_optional }
 */
export async function addExtraChargeHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { charge_type: string; amount: number; description?: string; is_optional?: boolean } }>,
  reply:   FastifyReply
) {
  const user = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)

  if (!order) {
    return reply.status(404).send({ success: false, message: 'Order not found' })
  }

  // Only admin or shipper can add charges
  if (user.role_id !== 1 && order.shipper_id !== user.id) {
    return reply.status(403).send({ success: false, message: 'Not authorized' })
  }

  const validTypes = ['TIP', 'WAITING_TIME', 'LOADING_FEE', 'SPECIAL_HANDLING', 'OTHER']
  if (!validTypes.includes(request.body.charge_type)) {
    return reply.status(400).send({ success: false, message: `charge_type must be one of: ${validTypes.join(', ')}` })
  }

  const { charge_type, amount, description, is_optional = true } = request.body

  if (typeof amount !== 'number' || amount <= 0 || amount > 100000) {
    return reply.status(400).send({ success: false, message: 'Amount must be between 0.01 and 100,000' })
  }

  try {
    const { addOrderCharge } = await import('../services/payment.service.js')

    const chargeId = await addOrderCharge(
      request.server.db,
      request.params.id,
      charge_type as any,
      amount,
      description || null,
      user.id,
      is_optional
    )

    return reply.status(201).send({
      success: true,
      message: 'Charge added successfully',
      charge_id: chargeId,
    })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to add charge' })
  }
}

/**
 * GET /api/orders/:id/has-rated
 * Lets the frontend check whether the current user has already rated this order.
 */
export async function hasRatedOrderHandler(
  request: FastifyRequest<{ Params: OrderParams }>,
  reply:   FastifyReply
) {
  const user  = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })
  if (order.shipper_id !== user.id) return reply.status(403).send({ success: false, message: 'Not your order.' })

  const rated = await hasRatedOrder(request.server.db, order.id)
  return reply.send({ success: true, has_rated: rated })
}