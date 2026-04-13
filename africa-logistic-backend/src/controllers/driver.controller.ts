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
import fs from 'fs'
import path from 'path'
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
  createCrossBorderDoc,
  type CrossBorderDocType,
  type OrderStatus,
} from '../services/order.service.js'
import { generateInvoice } from '../services/invoice.service.js'
import { wsManager } from '../utils/wsManager.js'
import {
  updateDriverAvailabilityStatus,
} from '../services/profile.service.js'
import { sendPushToRole, sendPushToUser } from '../services/push.service.js'
import { getOtpLockState, recordOtpFailure, clearOtpFailures } from '../utils/securityRateLimit.js'
import { sanitizeChatContent } from '../utils/privacy.js'

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
  border_crossing_ref?: string
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
interface DriverReportQuery { from?: string; to?: string }

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

/** GET /api/driver/report?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function getDriverReportHandler(
  request: FastifyRequest<{ Querystring: DriverReportQuery }>,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return

  const driver = request.user as any
  const db = request.server.db
  const now = new Date()
  const toDate = request.query.to ? new Date(request.query.to) : now
  const fromDate = request.query.from
    ? new Date(request.query.from)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const fromStr = fromDate.toISOString().slice(0, 10) + ' 00:00:00'
  const toStr = toDate.toISOString().slice(0, 10) + ' 23:59:59'

  const [profileRows] = await db.query<any[]>(`
    SELECT
      u.id,
      CONCAT_WS(' ', u.first_name, u.last_name)                     AS name,
      u.first_name,
      u.last_name,
      u.phone_number,
      u.email,
      dp.status,
      dp.is_verified,
      dp.rating,
      dp.total_trips,
      dp.national_id_status,
      dp.license_status,
      dp.libre_status,
      dpm.total_trips                                              AS metrics_total_trips,
      dpm.on_time_trips,
      dpm.late_trips,
      dpm.cancelled_trips,
      dpm.average_rating,
      dpm.total_earned,
      dpm.on_time_percentage,
      dpm.bonus_earned,
      dpm.last_trip_date,
      dpm.streak_days,
      v.plate_number,
      v.vehicle_type,
      v.max_capacity_kg,
      v.driver_submission_status,
      v.is_approved,
      v.is_active
    FROM users u
    LEFT JOIN driver_profiles dp             ON dp.user_id = u.id
    LEFT JOIN driver_performance_metrics dpm ON dpm.driver_id = u.id
    LEFT JOIN vehicles v                     ON v.driver_id = u.id AND v.is_active = 1
    WHERE u.id = ?
    LIMIT 1
  `, [driver.id])

  const profile = profileRows[0] ?? {}

  const [summaryRows] = await db.query<any[]>(`
    SELECT
      COUNT(*)                                                                 AS total_jobs,
      SUM(CASE WHEN o.status IN ('DELIVERED','COMPLETED') THEN 1 ELSE 0 END)   AS completed_jobs,
      SUM(CASE WHEN o.status IN ('ASSIGNED','EN_ROUTE','AT_PICKUP','IN_TRANSIT',
                                 'AT_BORDER','IN_CUSTOMS','CUSTOMS_CLEARED')
               THEN 1 ELSE 0 END)                                              AS active_jobs,
      SUM(CASE WHEN o.status = 'CANCELLED' THEN 1 ELSE 0 END)                   AS cancelled_jobs,
      SUM(CASE WHEN o.status = 'FAILED' THEN 1 ELSE 0 END)                      AS failed_jobs,
      SUM(o.is_cross_border)                                                    AS cross_border_jobs,
      ROUND(SUM(COALESCE(o.distance_km, 0)), 1)                                 AS total_distance_km,
      ROUND(AVG(CASE WHEN o.distance_km > 0 THEN o.distance_km END), 1)         AS avg_distance_km,
      ROUND(AVG(CASE WHEN o.assigned_at IS NOT NULL
                     THEN TIMESTAMPDIFF(MINUTE, o.created_at, o.assigned_at) END), 1) AS avg_assign_min,
      ROUND(AVG(CASE WHEN o.picked_up_at IS NOT NULL AND o.delivered_at IS NOT NULL
                     THEN TIMESTAMPDIFF(MINUTE, o.picked_up_at, o.delivered_at) / 60 END), 2) AS avg_delivery_hours,
      ROUND(SUM(COALESCE(oi.driver_amount, 0)), 2)                              AS period_earnings,
      ROUND(AVG(CASE WHEN dr.stars > 0 THEN dr.stars END), 2)                   AS period_avg_rating,
      COUNT(DISTINCT dr.id)                                                     AS reviews_count
    FROM orders o
    LEFT JOIN order_invoices oi ON oi.order_id = o.id
    LEFT JOIN driver_ratings dr ON dr.order_id = o.id AND dr.driver_id = o.driver_id AND dr.is_deleted = 0
    WHERE o.driver_id = ?
      AND o.created_at BETWEEN ? AND ?
  `, [driver.id, fromStr, toStr])

  const summary = summaryRows[0] ?? {}

  const [dailyRows] = await db.query<any[]>(`
    SELECT
      DATE(o.created_at)                                           AS date,
      COUNT(*)                                                     AS jobs,
      SUM(CASE WHEN o.status IN ('DELIVERED','COMPLETED') THEN 1 ELSE 0 END) AS completed,
      ROUND(SUM(COALESCE(o.distance_km, 0)), 1)                    AS km,
      ROUND(SUM(COALESCE(oi.driver_amount, 0)), 2)                 AS earnings
    FROM orders o
    LEFT JOIN order_invoices oi ON oi.order_id = o.id
    WHERE o.driver_id = ?
      AND o.created_at BETWEEN ? AND ?
    GROUP BY DATE(o.created_at)
    ORDER BY date ASC
  `, [driver.id, fromStr, toStr])

  const [statusRows] = await db.query<any[]>(`
    SELECT o.status, COUNT(*) AS count
    FROM orders o
    WHERE o.driver_id = ?
      AND o.created_at BETWEEN ? AND ?
    GROUP BY o.status
    ORDER BY count DESC
  `, [driver.id, fromStr, toStr])

  const [ratingRows] = await db.query<any[]>(`
    SELECT stars, COUNT(*) AS count
    FROM driver_ratings
    WHERE driver_id = ?
      AND is_deleted = 0
      AND created_at BETWEEN ? AND ?
    GROUP BY stars
    ORDER BY stars ASC
  `, [driver.id, fromStr, toStr])

  const [jobRows] = await db.query<any[]>(`
    SELECT
      o.id,
      o.reference_code,
      o.status,
      o.pickup_address,
      o.delivery_address,
      o.created_at,
      o.delivered_at,
      ROUND(COALESCE(oi.driver_amount, 0), 2)                     AS driver_amount,
      ROUND(COALESCE(o.final_price, o.estimated_price, 0), 2)     AS order_value,
      ROUND(COALESCE(o.distance_km, 0), 1)                        AS distance_km,
      o.is_cross_border
    FROM orders o
    LEFT JOIN order_invoices oi ON oi.order_id = o.id
    WHERE o.driver_id = ?
      AND o.created_at BETWEEN ? AND ?
    ORDER BY o.created_at DESC
    LIMIT 10
  `, [driver.id, fromStr, toStr])

  const [feedbackRows] = await db.query<any[]>(`
    SELECT
      dr.id,
      dr.stars,
      COALESCE(dr.comment, '')                                    AS comment,
      dr.created_at,
      CONCAT_WS(' ', u.first_name, u.last_name)                   AS shipper_name
    FROM driver_ratings dr
    JOIN users u ON u.id = dr.shipper_id
    WHERE dr.driver_id = ?
      AND dr.is_deleted = 0
    ORDER BY dr.created_at DESC
    LIMIT 8
  `, [driver.id])

  const [reviewRows] = await db.query<any[]>(`
    SELECT document_type, action, COALESCE(reason, '') AS reason, reviewed_at
    FROM driver_document_reviews
    WHERE driver_id = ?
    ORDER BY reviewed_at DESC
    LIMIT 8
  `, [driver.id])

  return reply.send({
    success: true,
    report: {
      generated_at: new Date().toISOString(),
      date_range: {
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
      },
      driver: {
        id: String(profile.id ?? driver.id),
        name: String(profile.name ?? ''),
        first_name: String(profile.first_name ?? ''),
        last_name: String(profile.last_name ?? ''),
        phone_number: String(profile.phone_number ?? ''),
        email: String(profile.email ?? ''),
        status: String(profile.status ?? 'OFFLINE'),
        is_verified: Boolean(profile.is_verified),
        rating: Number(profile.rating ?? profile.average_rating ?? 0),
        total_trips: Number(profile.metrics_total_trips ?? profile.total_trips ?? 0),
        national_id_status: String(profile.national_id_status ?? 'PENDING'),
        license_status: String(profile.license_status ?? 'PENDING'),
        libre_status: String(profile.libre_status ?? 'PENDING'),
        on_time_percentage: Number(profile.on_time_percentage ?? 0),
        total_earned: Number(profile.total_earned ?? 0),
        bonus_earned: Number(profile.bonus_earned ?? 0),
        average_rating: Number(profile.average_rating ?? 0),
        streak_days: Number(profile.streak_days ?? 0),
        last_trip_date: profile.last_trip_date ? String(profile.last_trip_date) : null,
        vehicle: profile.plate_number ? {
          plate_number: String(profile.plate_number),
          vehicle_type: String(profile.vehicle_type ?? '—'),
          max_capacity_kg: Number(profile.max_capacity_kg ?? 0),
          driver_submission_status: String(profile.driver_submission_status ?? 'APPROVED'),
          is_approved: Boolean(profile.is_approved),
          is_active: Boolean(profile.is_active),
        } : null,
      },
      summary: {
        total_jobs: Number(summary.total_jobs ?? 0),
        completed_jobs: Number(summary.completed_jobs ?? 0),
        active_jobs: Number(summary.active_jobs ?? 0),
        cancelled_jobs: Number(summary.cancelled_jobs ?? 0),
        failed_jobs: Number(summary.failed_jobs ?? 0),
        cross_border_jobs: Number(summary.cross_border_jobs ?? 0),
        total_distance_km: Number(summary.total_distance_km ?? 0),
        avg_distance_km: Number(summary.avg_distance_km ?? 0),
        avg_assign_min: Number(summary.avg_assign_min ?? 0),
        avg_delivery_hours: Number(summary.avg_delivery_hours ?? 0),
        period_earnings: Number(summary.period_earnings ?? 0),
        period_avg_rating: Number(summary.period_avg_rating ?? 0),
        reviews_count: Number(summary.reviews_count ?? 0),
      },
      daily: (dailyRows as any[]).map((row) => ({
        date: String(row.date),
        jobs: Number(row.jobs ?? 0),
        completed: Number(row.completed ?? 0),
        km: Number(row.km ?? 0),
        earnings: Number(row.earnings ?? 0),
      })),
      status_breakdown: (statusRows as any[]).map((row) => ({
        status: String(row.status),
        count: Number(row.count ?? 0),
      })),
      rating_breakdown: (ratingRows as any[]).map((row) => ({
        stars: Number(row.stars ?? 0),
        count: Number(row.count ?? 0),
      })),
      recent_jobs: (jobRows as any[]).map((row) => ({
        id: String(row.id),
        reference_code: String(row.reference_code),
        status: String(row.status),
        pickup_address: String(row.pickup_address ?? ''),
        delivery_address: String(row.delivery_address ?? ''),
        created_at: String(row.created_at),
        delivered_at: row.delivered_at ? String(row.delivered_at) : null,
        driver_amount: Number(row.driver_amount ?? 0),
        order_value: Number(row.order_value ?? 0),
        distance_km: Number(row.distance_km ?? 0),
        is_cross_border: Boolean(row.is_cross_border),
      })),
      recent_feedback: (feedbackRows as any[]).map((row) => ({
        id: String(row.id),
        stars: Number(row.stars ?? 0),
        comment: String(row.comment ?? ''),
        created_at: String(row.created_at),
        shipper_name: String(row.shipper_name ?? 'Shipper'),
      })),
      document_reviews: (reviewRows as any[]).map((row) => ({
        document_type: String(row.document_type),
        action: String(row.action),
        reason: String(row.reason ?? ''),
        reviewed_at: String(row.reviewed_at),
      })),
    },
  })
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
 *   IN_TRANSIT → AT_BORDER  (cross-border orders only)
 *   AT_BORDER  → IN_CUSTOMS
 *   IN_CUSTOMS → CUSTOMS_CLEARED
 *   CUSTOMS_CLEARED → IN_TRANSIT
 */
const DRIVER_ALLOWED_TRANSITIONS: Record<string, OrderStatus[]> = {
  ASSIGNED:        ['EN_ROUTE'],
  EN_ROUTE:        ['AT_PICKUP'],
  AT_PICKUP:       ['IN_TRANSIT'],
  IN_TRANSIT:      ['DELIVERED', 'AT_BORDER'],
  AT_BORDER:       ['IN_CUSTOMS'],
  IN_CUSTOMS:      ['CUSTOMS_CLEARED'],
  CUSTOMS_CLEARED: ['IN_TRANSIT'],
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

  // AT_BORDER is only allowed for cross-border orders
  if (status === 'AT_BORDER' && !order.is_cross_border) {
    return reply.status(400).send({ success: false, message: 'AT_BORDER transition is only allowed for cross-border orders.' })
  }

  // IN_TRANSIT transition requires pickup OTP to have been verified
  if (status === 'IN_TRANSIT' && order.status === 'AT_PICKUP' && !order.pickup_otp_verified_at) {
    return reply.status(400).send({ success: false, message: 'Pickup OTP must be verified before marking IN_TRANSIT.' })
  }

  await updateOrderStatus(request.server.db, order.id, status, driver.id, notes)

  // If driver is arriving at border, record the border_crossing_ref if provided
  if (status === 'AT_BORDER' && request.body.border_crossing_ref) {
    await request.server.db.query(
      `UPDATE orders SET border_crossing_ref = ? WHERE id = ?`,
      [request.body.border_crossing_ref, order.id]
    )
  }

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

  const otpKey = `driver:pickup:order:${order.id}`
  const lock = getOtpLockState(otpKey)
  if (lock.locked) {
    return reply
      .status(429)
      .header('Retry-After', String(lock.retryAfterSeconds))
      .send({ success: false, message: 'Too many failed OTP attempts. Pickup verification is temporarily locked.' })
  }

  const valid = await verifyOtpHash(String(request.body.otp), order.pickup_otp_hash)
  if (!valid) {
    const state = recordOtpFailure(otpKey, 5, 15 * 60 * 1000, 30 * 60 * 1000)
    if (state.locked) {
      return reply
        .status(429)
        .header('Retry-After', String(state.retryAfterSeconds))
        .send({ success: false, message: 'Too many failed OTP attempts. Pickup verification is temporarily locked.' })
    }
    return reply.status(403).send({ success: false, message: 'Invalid pickup OTP.' })
  }

  clearOtpFailures(otpKey)

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

  const otpKey = `driver:delivery:order:${order.id}`
  const lock = getOtpLockState(otpKey)
  if (lock.locked) {
    return reply
      .status(429)
      .header('Retry-After', String(lock.retryAfterSeconds))
      .send({ success: false, message: 'Too many failed OTP attempts. Delivery verification is temporarily locked.' })
  }

  const valid = await verifyOtpHash(String(request.body.otp), order.delivery_otp_hash)
  if (!valid) {
    const state = recordOtpFailure(otpKey, 5, 15 * 60 * 1000, 30 * 60 * 1000)
    if (state.locked) {
      return reply
        .status(429)
        .header('Retry-After', String(state.retryAfterSeconds))
        .send({ success: false, message: 'Too many failed OTP attempts. Delivery verification is temporarily locked.' })
    }
    return reply.status(403).send({ success: false, message: 'Invalid delivery OTP.' })
  }

  clearOtpFailures(otpKey)

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

  const sanitized = messages.map((m: any) => ({ ...m, message: sanitizeChatContent(String(m.message ?? '')) }))
  return reply.send({ success: true, messages: sanitized })
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

  const cleanedMessage = sanitizeChatContent(message.trim())

  // Restrict driver to main/driver channels only
  const allowedCh = ['main', 'driver']
  const channelBody = (request.body as any).channel
  const channel = channelBody && allowedCh.includes(channelBody) ? channelBody : 'main'
  const msg = await createOrderMessage(request.server.db, order.id, driver.id, cleanedMessage, channel)
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

// ─── Cross-Border Document Upload ────────────────────────────────────────────

interface UploadCBDocBody {
  document_type: CrossBorderDocType
  file_base64: string       // data URI or raw base64
  notes?: string
}

/**
 * POST /api/driver/jobs/:id/cross-border-doc
 * Upload a cross-border document (checkpoint photo, commercial invoice scan, etc.)
 * Body: { document_type, file_base64, notes? }
 */
export async function uploadCrossBorderDocHandler(
  request: FastifyRequest<{ Params: JobParams; Body: UploadCBDocBody }>,
  reply:   FastifyReply
) {
  if (!requireDriver(request, reply)) return
  const driver = request.user as any
  const order  = await getOrderById(request.server.db, request.params.id)

  if (!order)                        return reply.status(404).send({ success: false, message: 'Job not found.' })
  if (order.driver_id !== driver.id) return reply.status(403).send({ success: false, message: 'Not your job.' })
  if (!order.is_cross_border)        return reply.status(400).send({ success: false, message: 'This is not a cross-border order.' })

  const VALID_DOC_TYPES: CrossBorderDocType[] = [
    'COMMERCIAL_INVOICE', 'BILL_OF_LADING', 'PACKING_LIST',
    'CERTIFICATE_OF_ORIGIN', 'CHECKPOINT_PHOTO', 'OTHER',
  ]
  const { document_type, file_base64, notes } = request.body
  if (!VALID_DOC_TYPES.includes(document_type)) {
    return reply.status(400).send({ success: false, message: `document_type must be one of: ${VALID_DOC_TYPES.join(', ')}` })
  }
  if (!file_base64?.trim()) {
    return reply.status(400).send({ success: false, message: 'file_base64 is required.' })
  }

  // Save file to disk
  const match = file_base64.match(/^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/)
  const raw   = match ? match[2] : file_base64
  const mime  = match ? match[1] : 'image/jpeg'
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'application/pdf': 'pdf',
  }
  const ext = extMap[mime] ?? 'jpg'
  const dir  = path.join(process.cwd(), 'uploads', 'cross-border')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const filename = `cb_${order.id}_${document_type}_${Date.now()}.${ext}`
  fs.writeFileSync(path.join(dir, filename), Buffer.from(raw, 'base64'))
  const fileUrl = `/uploads/cross-border/${filename}`

  const docId = await createCrossBorderDoc(
    request.server.db, order.id, driver.id, document_type, fileUrl, notes ?? null
  )

  wsManager.broadcast(order.id, 'CB_DOC_UPLOADED', { doc_id: docId, document_type, file_url: fileUrl })

  return reply.status(201).send({
    success: true,
    message: 'Document uploaded successfully. Pending admin review.',
    doc_id: docId,
    file_url: fileUrl,
  })
}
