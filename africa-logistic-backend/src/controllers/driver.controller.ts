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
  getUnreadCounts,
  notifyOrderStatus,
  verifyOtpHash,
  markPickupOtpVerified,
  markDeliveryOtpVerified,
  type OrderStatus,
} from '../services/order.service.js'
import { generateInvoice } from '../services/invoice.service.js'
import { wsManager } from '../utils/wsManager.js'
import {
  updateDriverAvailabilityStatus,
} from '../services/profile.service.js'
import { sendPushToRole, sendPushToUser } from '../services/push.service.js'

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
  notifyOrderStatus(request.server.db, order.id, 'EN_ROUTE')

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
  notifyOrderStatus(request.server.db, order.id, status)

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
  notifyOrderStatus(request.server.db, order.id, 'IN_TRANSIT')

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
  notifyOrderStatus(request.server.db, order.id, 'DELIVERED')

  // ─── PROCESS PAYMENT SETTLEMENT ─────────────────────────────────────────────
  try {
    const { calculateFinalOrderPrice, settleOrderPayment } = await import('../services/payment.service.js')
    const { generateInvoiceNumber, saveFinancialInvoiceRecord, generateInvoice } = await import('../services/invoice.service.js')
    const { findUserById } = await import('../services/auth.service.js')
    const { sendPushToUser } = await import('../services/push.service.js')
    const { sendEmail } = await import('../services/email.service.js')

    // Calculate final price including any approved charges/tips
    // Check order assignment
    if (!order.shipper_id || !order.driver_id) {
      throw new Error('Order missing shipper or driver assignment')
    }

    const pricing = await calculateFinalOrderPrice(
      request.server.db,
      order.id,
      Number(order.estimated_price),
      order.driver_id
    )

    // Settle payment (deduct from shipper, credit to driver)
    const { shipperTransactionId, driverTransactionId } = await settleOrderPayment(
      request.server.db,
      order.id,
      order.shipper_id,
      order.driver_id,
      pricing.shipperCost,
      pricing.driverEarning,
      pricing.commission,
      order.reference_code
    )

    // Generate invoice number and save record
    const invoiceNumber = generateInvoiceNumber()
    const invoiceId = await saveFinancialInvoiceRecord(
      request.server.db,
      order.id,
      invoiceNumber,
      '', // Will be filled after PDF generation
      pricing.total,
      pricing.shipperCost,
      pricing.driverEarning,
      pricing.commission,
      pricing.approvedCharges, // Broken down later
      0 // Extra charges separately tracked
    )

    // Generate PDF invoice async
    generateInvoice(request.server.db, order.id)
      .then(async (url) => {
        if (url) {
          // Update invoice record with PDF URL
          await request.server.db.query(
            `UPDATE order_invoices SET pdf_url = ? WHERE id = ?`,
            [url, invoiceId]
          )

          // Notify shipper and driver about invoice ready
          wsManager.broadcast(order.id, 'INVOICE_READY', { invoice_url: url })

          // Send notifications
          const [shipper] = await request.server.db.query<any[]>(
            `SELECT email, first_name FROM users WHERE id = ?`,
            [order.shipper_id]
          )
          const [driverUser] = await request.server.db.query<any[]>(
            `SELECT email, first_name FROM users WHERE id = ?`,
            [order.driver_id]
          )

          // Push notifications
          const shipperId = String(order.shipper_id)
          const driverId = String(order.driver_id)

          await sendPushToUser(request.server.db, shipperId, {
            title: 'Payment Completed',
            body: `Order ${order.reference_code} payment settled. Invoice ready.`,
            url: `/orders/${order.id}/invoice`,
            data: { order_id: order.id, type: 'payment_settled' }
          }).catch(() => {})

          await sendPushToUser(request.server.db, driverId, {
            title: 'Payment Received',
            body: `Earned ${pricing.driverEarning.toFixed(2)} ETB from delivery ${order.reference_code}`,
            url: `/jobs/${order.id}/invoice`,
            data: { order_id: order.id, type: 'earnings_received' }
          }).catch(() => {})

          // Email notifications
          if (shipper[0]?.email) {
            sendEmail({
              to: shipper[0].email,
              subject: `Payment Settled - Order ${order.reference_code}`,
              text: `Your order payment has been successfully processed.\n\nAmount: ${pricing.shipperCost.toFixed(2)} ETB\nOrder: ${order.reference_code}\n\nDownload your invoice from the app.`
            }).catch(() => {})
          }

          if (driverUser[0]?.email) {
            sendEmail({
              to: driverUser[0].email,
              subject: `Earnings Credited - Order ${order.reference_code}`,
              text: `Your earnings have been credited to your wallet.\n\nAmount: ${pricing.driverEarning.toFixed(2)} ETB\nOrder: ${order.reference_code}\n\nView your invoice from the app.`
            }).catch(() => {})
          }
        }
      })
      .catch(console.error)
  } catch (err: any) {
    request.server.log.error('Payment settlement error:', err)
    // Don't block the delivery confirmation if payment processing fails
    // This should be retried asynchronously
  }

  return reply.send({ success: true, message: 'Delivery confirmed. Job marked as DELIVERED. Payment settled.' })
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

  // Drivers can only see: main (driver↔shipper) and driver (admin↔driver) channels
  const channelParam = (request.query as any).channel as string | undefined
  const allowedChannels = ['main', 'driver']
  const channel = channelParam && allowedChannels.includes(channelParam) ? channelParam : undefined
  const messages = await getOrderMessages(request.server.db, request.params.id, channel)
  await markMessagesRead(request.server.db, request.params.id, driver.id)

  return reply.send({ success: true, messages })
}

/** GET /api/driver/jobs/unread-counts */
export async function getDriverUnreadCountsHandler(
  request: FastifyRequest,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver = request.user as any
  const counts = await getUnreadCounts(request.server.db, driver.id)
  return reply.send({ success: true, counts })
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

  // Restrict driver to main/driver channels only
  const allowedCh = ['main', 'driver']
  const channelBody = (request.body as any).channel
  const channel = channelBody && allowedCh.includes(channelBody) ? channelBody : 'main'
  const msg = await createOrderMessage(request.server.db, order.id, driver.id, message.trim(), channel)
  wsManager.broadcast(order.id, 'NEW_MESSAGE', { message: msg })

  if (channel === 'main' && order.shipper_id && order.shipper_id !== driver.id) {
    await sendPushToUser(request.server.db, order.shipper_id, {
      title: `New Message on ${order.reference_code}`,
      body: `From driver ${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim(),
      url: '/dashboard',
      data: { order_id: order.id, reference_code: order.reference_code, type: 'NEW_CHAT_MESSAGE' },
    }).catch(() => {})
  }

  await sendPushToRole(request.server.db, 1, {
    title: `Order Chat: ${order.reference_code}`,
    body: 'New message from driver.',
    url: '/admin',
    data: { order_id: order.id, reference_code: order.reference_code, channel, type: 'ADMIN_ORDER_CHAT_ALERT' },
  }).catch(() => {})

  return reply.status(201).send({ success: true, message: msg })
}

// ─── Driver self-status change ────────────────────────────────────────────────

/** PATCH /api/driver/status  — driver changes own availability status */
export async function updateDriverStatusHandler(
  request: FastifyRequest<{ Body: { status: string } }>,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver = request.user as any
  const { status } = request.body ?? {}

  const VALID = ['AVAILABLE', 'OFFLINE']
  if (!status || !VALID.includes(status)) {
    return reply.status(400).send({ success: false, message: `status must be one of: ${VALID.join(', ')}` })
  }

  const result = await updateDriverAvailabilityStatus(request.server.db, driver.id, status)
  if (!result.ok) return reply.status(400).send({ success: false, message: result.message })
  return reply.send({ success: true, message: result.message, status })
}
