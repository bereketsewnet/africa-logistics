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
import { wsManager } from '../utils/wsManager.js'
import fs from 'fs'
import path from 'path'

// ─── Body / Param types ───────────────────────────────────────────────────────

interface QuoteBody {
  pickup_lat: number
  pickup_lng: number
  delivery_lat: number
  delivery_lng: number
  vehicle_type: string
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
  // Quote lock-in (caller echoes back the server's quote for auditability)
  distance_km?: number
  estimated_price?: number
}

interface OrderParams { id: string }

interface SendMessageBody { message: string }

interface OrderListQuery {
  page?: string
  limit?: string
  status?: string
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
  const { pickup_lat, pickup_lng, delivery_lat, delivery_lng, vehicle_type } = request.body

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

  const quote = calculateQuote(distanceKm, rule)

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

  const quote      = calculateQuote(distanceKm, rule)
  const pickupOtp  = generateOtp()
  const deliveryOtp = generateOtp()

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

  const messages = await getOrderMessages(request.server.db, request.params.id)
  await markMessagesRead(request.server.db, request.params.id, user.id)

  return reply.send({ success: true, messages })
}

/** POST /api/orders/:id/messages */
export async function sendMessageHandler(
  request: FastifyRequest<{ Params: OrderParams; Body: SendMessageBody }>,
  reply:   FastifyReply
) {
  const user  = request.user as any
  const order = await getOrderById(request.server.db, request.params.id)
  if (!order) return reply.status(404).send({ success: false, message: 'Order not found.' })

  const isParty = order.shipper_id === user.id || order.driver_id === user.id || user.role_id <= 2
  if (!isParty) return reply.status(403).send({ success: false, message: 'Access denied.' })

  const { message } = request.body
  if (!message?.trim()) return reply.status(400).send({ success: false, message: 'Message cannot be empty.' })

  const msg = await createOrderMessage(request.server.db, request.params.id, user.id, message.trim())

  // Broadcast to WS subscribers
  wsManager.broadcast(request.params.id, 'NEW_MESSAGE', { message: msg })

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
