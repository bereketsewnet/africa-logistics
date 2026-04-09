/**
 * Driver Controller (src/controllers/driver.controller.ts)
 *
 * Handles all Driver-facing job endpoints:
 *  - GET  /api/driver/jobs              — my assigned/active jobs
 *  - GET  /api/driver/jobs/:id          — single job details
 *  - PATCH /api/driver/jobs/:id/accept  — accept an assigned job
 *  - PATCH /api/driver/jobs/:id/decline — decline an assigned job
 *  - PATCH /api/driver/jobs/:id/status  — update job status (EN_ROUTE → AT_PICKUP → IN_TRANSIT → DELIVERED)
 *  - POST  /api/driver/jobs/:id/verify-pickup   — verify pickup OTP → unlocks IN_TRANSIT
 *  - POST  /api/driver/jobs/:id/verify-delivery — verify delivery OTP → triggers DELIVERED + invoice
 *  - POST  /api/driver/location         — ping GPS location (high-frequency)
 *  - GET  /api/driver/jobs/:id/messages — read chat
 *  - POST /api/driver/jobs/:id/messages — send chat message
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import {
  getOrderById,
  getDriverOrders,
  updateOrderStatus,
  releaseDriver,
  pingDriverLocation,
  getOrderMessages,
  createOrderMessage,
  markMessagesRead,
  verifyOtpHash,
  markPickupOtpVerified,
  markDeliveryOtpVerified,
  type OrderStatus,
} from '../services/order.service.js'
import { generateInvoice } from '../services/invoice.service.js'
import { wsManager } from '../utils/wsManager.js'

// ─── Guard ────────────────────────────────────────────────────────────────────

function requireDriver(request: FastifyRequest, reply: FastifyReply): boolean {
  if ((request.user as any).role_id !== 3) {
    reply.status(403).send({ success: false, message: 'Driver access only.' })
    return false
  }
  return true
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobParams { id: string }

interface StatusUpdateBody {
  status: OrderStatus
  notes?: string
}

interface VerifyOtpBody { otp: string }

interface LocationBody {
  lat: number
  lng: number
  order_id?: string
  heading?: number
  speed_kmh?: number
}

interface SendMessageBody { message: string }

// ─── Handlers ─────────────────────────────────────────────────────────────────

/** GET /api/driver/jobs */
export async function getDriverJobsHandler(
  request: FastifyRequest,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver = request.user as any
  const jobs   = await getDriverOrders(request.server.db, driver.id)
  return reply.send({ success: true, jobs })
}

/** GET /api/driver/jobs/:id */
export async function getDriverJobHandler(
  request: FastifyRequest<{ Params: JobParams }>,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver = request.user as any
  const order  = await getOrderById(request.server.db, request.params.id)

  if (!order)                           return reply.status(404).send({ success: false, message: 'Job not found.' })
  if (order.driver_id !== driver.id)    return reply.status(403).send({ success: false, message: 'Not your job.' })

  return reply.send({ success: true, job: order })
}

/** PATCH /api/driver/jobs/:id/accept */
export async function acceptJobHandler(
  request: FastifyRequest<{ Params: JobParams }>,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver = request.user as any
  const order  = await getOrderById(request.server.db, request.params.id)

  if (!order)                         return reply.status(404).send({ success: false, message: 'Job not found.' })
  if (order.driver_id !== driver.id)  return reply.status(403).send({ success: false, message: 'Not your job.' })
  if (order.status !== 'ASSIGNED')    return reply.status(400).send({ success: false, message: `Cannot accept job in status: ${order.status}` })

  await updateOrderStatus(request.server.db, order.id, 'EN_ROUTE', driver.id, 'Driver accepted and is en route')
  wsManager.broadcast(order.id, 'STATUS_CHANGED', { status: 'EN_ROUTE', driver_id: driver.id })

  return reply.send({ success: true, message: 'Job accepted. Status set to EN_ROUTE.' })
}

/** PATCH /api/driver/jobs/:id/decline */
export async function declineJobHandler(
  request: FastifyRequest<{ Params: JobParams }>,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver = request.user as any
  const order  = await getOrderById(request.server.db, request.params.id)

  if (!order)                         return reply.status(404).send({ success: false, message: 'Job not found.' })
  if (order.driver_id !== driver.id)  return reply.status(403).send({ success: false, message: 'Not your job.' })
  if (!['ASSIGNED', 'EN_ROUTE'].includes(order.status)) {
    return reply.status(400).send({ success: false, message: `Cannot decline job in status: ${order.status}` })
  }

  // Unassign driver, revert order to PENDING, release driver status
  await request.server.db.query(
    `UPDATE orders SET driver_id = NULL, vehicle_id = NULL, status = 'PENDING', assigned_at = NULL WHERE id = ?`,
    [order.id]
  )
  await request.server.db.query(
    `INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES (?, 'PENDING', ?, 'Driver declined job')`,
    [order.id, driver.id]
  )
  await releaseDriver(request.server.db, driver.id)
  wsManager.broadcast(order.id, 'STATUS_CHANGED', { status: 'PENDING' })

  return reply.send({ success: true, message: 'Job declined. Order returned to PENDING.' })
}

/**
 * PATCH /api/driver/jobs/:id/status
 * Allowed driver-driven transitions:
 *   ASSIGNED → EN_ROUTE
 *   EN_ROUTE → AT_PICKUP
 *   IN_TRANSIT → DELIVERED  (use verify-delivery-otp instead for OTP flow)
 */
const DRIVER_ALLOWED_TRANSITIONS: Record<string, OrderStatus[]> = {
  ASSIGNED:   ['EN_ROUTE'],
  EN_ROUTE:   ['AT_PICKUP'],
  AT_PICKUP:  ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED'],
}

export async function updateJobStatusHandler(
  request: FastifyRequest<{ Params: JobParams; Body: StatusUpdateBody }>,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver    = request.user as any
  const { status, notes } = request.body
  const order  = await getOrderById(request.server.db, request.params.id)

  if (!order)                         return reply.status(404).send({ success: false, message: 'Job not found.' })
  if (order.driver_id !== driver.id)  return reply.status(403).send({ success: false, message: 'Not your job.' })

  const allowed = DRIVER_ALLOWED_TRANSITIONS[order.status] ?? []
  if (!allowed.includes(status)) {
    return reply.status(400).send({
      success: false,
      message: `Cannot transition from ${order.status} → ${status}. Allowed transitions: ${allowed.join(', ')}`,
    })
  }

  // IN_TRANSIT transition requires pickup OTP to have been verified
  if (status === 'IN_TRANSIT' && !order.pickup_otp_verified_at) {
    return reply.status(400).send({ success: false, message: 'Pickup OTP must be verified before marking IN_TRANSIT.' })
  }

  await updateOrderStatus(request.server.db, order.id, status, driver.id, notes)
  wsManager.broadcast(order.id, 'STATUS_CHANGED', { status })

  // If delivered, trigger invoice generation asynchronously
  if (status === 'DELIVERED') {
    await releaseDriver(request.server.db, driver.id)
    generateInvoice(request.server.db, order.id).catch(console.error)
  }

  return reply.send({ success: true, message: `Job status updated to ${status}.` })
}

/** POST /api/driver/jobs/:id/verify-pickup */
export async function verifyPickupOtpHandler(
  request: FastifyRequest<{ Params: JobParams; Body: VerifyOtpBody }>,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver = request.user as any
  const order  = await getOrderById(request.server.db, request.params.id)

  if (!order)                         return reply.status(404).send({ success: false, message: 'Job not found.' })
  if (order.driver_id !== driver.id)  return reply.status(403).send({ success: false, message: 'Not your job.' })
  if (order.status !== 'AT_PICKUP')   return reply.status(400).send({ success: false, message: 'Driver must be AT_PICKUP to verify pickup OTP.' })
  if (order.pickup_otp_verified_at)   return reply.status(400).send({ success: false, message: 'Pickup OTP already verified.' })

  const valid = await verifyOtpHash(String(request.body.otp), order.pickup_otp_hash)
  if (!valid) return reply.status(400).send({ success: false, message: 'Invalid pickup OTP.' })

  await markPickupOtpVerified(request.server.db, order.id)
  // Automatically advance to IN_TRANSIT
  await updateOrderStatus(request.server.db, order.id, 'IN_TRANSIT', driver.id, 'Pickup OTP verified')
  wsManager.broadcast(order.id, 'STATUS_CHANGED', { status: 'IN_TRANSIT' })

  return reply.send({ success: true, message: 'Pickup verified. Status advanced to IN_TRANSIT.' })
}

/** POST /api/driver/jobs/:id/verify-delivery */
export async function verifyDeliveryOtpHandler(
  request: FastifyRequest<{ Params: JobParams; Body: VerifyOtpBody }>,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver = request.user as any
  const order  = await getOrderById(request.server.db, request.params.id)

  if (!order)                          return reply.status(404).send({ success: false, message: 'Job not found.' })
  if (order.driver_id !== driver.id)   return reply.status(403).send({ success: false, message: 'Not your job.' })
  if (order.status !== 'IN_TRANSIT')   return reply.status(400).send({ success: false, message: 'Driver must be IN_TRANSIT to verify delivery OTP.' })
  if (order.delivery_otp_verified_at)  return reply.status(400).send({ success: false, message: 'Delivery OTP already verified.' })

  const valid = await verifyOtpHash(String(request.body.otp), order.delivery_otp_hash)
  if (!valid) return reply.status(400).send({ success: false, message: 'Invalid delivery OTP.' })

  await markDeliveryOtpVerified(request.server.db, order.id)
  await updateOrderStatus(request.server.db, order.id, 'DELIVERED', driver.id, 'Delivery OTP verified — completed')
  await releaseDriver(request.server.db, driver.id)
  wsManager.broadcast(order.id, 'STATUS_CHANGED', { status: 'DELIVERED' })

  // Generate invoice async
  generateInvoice(request.server.db, order.id)
    .then(url => { if (url) wsManager.broadcast(order.id, 'INVOICE_READY', { invoice_url: url }) })
    .catch(console.error)

  return reply.send({ success: true, message: 'Delivery confirmed. Job marked as DELIVERED.' })
}

/** POST /api/driver/location — High-frequency GPS ping */
export async function pingLocationHandler(
  request: FastifyRequest<{ Body: LocationBody }>,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver = request.user as any
  const { lat, lng, order_id, heading, speed_kmh } = request.body

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return reply.status(400).send({ success: false, message: 'lat and lng are required numbers.' })
  }

  await pingDriverLocation(request.server.db, driver.id, order_id ?? null, lat, lng, heading, speed_kmh)

  // If on an active job, broadcast to order subscribers
  if (order_id) {
    wsManager.broadcast(order_id, 'LOCATION_UPDATE', { lat, lng, heading, speed_kmh, recorded_at: new Date().toISOString() })
  }

  return reply.status(200).send({ success: true })
}

/** GET /api/driver/jobs/:id/messages */
export async function getDriverJobMessagesHandler(
  request: FastifyRequest<{ Params: JobParams }>,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver = request.user as any
  const order  = await getOrderById(request.server.db, request.params.id)

  if (!order)                        return reply.status(404).send({ success: false, message: 'Job not found.' })
  if (order.driver_id !== driver.id) return reply.status(403).send({ success: false, message: 'Not your job.' })

  const messages = await getOrderMessages(request.server.db, request.params.id)
  await markMessagesRead(request.server.db, request.params.id, driver.id)

  return reply.send({ success: true, messages })
}

/** POST /api/driver/jobs/:id/messages */
export async function sendDriverMessageHandler(
  request: FastifyRequest<{ Params: JobParams; Body: SendMessageBody }>,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver = request.user as any
  const order  = await getOrderById(request.server.db, request.params.id)

  if (!order)                        return reply.status(404).send({ success: false, message: 'Job not found.' })
  if (order.driver_id !== driver.id) return reply.status(403).send({ success: false, message: 'Not your job.' })

  const { message } = request.body
  if (!message?.trim()) return reply.status(400).send({ success: false, message: 'Message cannot be empty.' })

  const msg = await createOrderMessage(request.server.db, order.id, driver.id, message.trim())
  wsManager.broadcast(order.id, 'NEW_MESSAGE', { message: msg })

  return reply.status(201).send({ success: true, message: msg })
}
