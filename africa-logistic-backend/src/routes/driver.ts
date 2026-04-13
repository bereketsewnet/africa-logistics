/**
 * Driver Routes (src/routes/driver.ts)
 *
 * Prefix: /api/driver  (registered in app.ts)
 * All routes require a valid JWT with role_id = 3 (Driver).
 */

import { FastifyInstance } from 'fastify'
import {
  getDriverJobsHandler,
  getDriverJobHandler,
  acceptJobHandler,
  declineJobHandler,
  updateJobStatusHandler,
  verifyPickupOtpHandler,
  verifyDeliveryOtpHandler,
  pingLocationHandler,
  getDriverJobMessagesHandler,
  sendDriverMessageHandler,
  getDriverUnreadCountsHandler,
  updateDriverStatusHandler,
  uploadCrossBorderDocHandler,
} from '../controllers/driver.controller.js'

export default async function driverRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate)

  // ── GPS Location Ping ─────────────────────────────────────────────────────────

  /**
   * POST /api/driver/location
   * Body: { lat, lng, order_id?, heading?, speed_kmh? }
   * High-frequency endpoint — called every ~5s while driver is on a job.
   */
  fastify.post('/location', pingLocationHandler)

  // ── Job Management ────────────────────────────────────────────────────────────

  /** GET /api/driver/jobs — all active + recent jobs for this driver */
  fastify.get('/jobs', getDriverJobsHandler)

  /** GET /api/driver/jobs/unread-counts — unread message counts per job */
  fastify.get('/jobs/unread-counts', getDriverUnreadCountsHandler)

  /** GET /api/driver/jobs/:id — single job details */
  fastify.get('/jobs/:id', getDriverJobHandler)

  /**
   * PATCH /api/driver/jobs/:id/accept
   * Accept an ASSIGNED job → transitions to EN_ROUTE.
   */
  fastify.patch('/jobs/:id/accept', acceptJobHandler)

  /**
   * PATCH /api/driver/jobs/:id/decline
   * Decline a job → order returns to PENDING, driver released.
   */
  fastify.patch('/jobs/:id/decline', declineJobHandler)

  /**
   * PATCH /api/driver/jobs/:id/status
   * Body: { status: 'EN_ROUTE' | 'AT_PICKUP' | 'IN_TRANSIT' | 'DELIVERED', notes? }
   * Allowed driver-driven transitions only (enforced in controller).
   */
  fastify.patch('/jobs/:id/status', updateJobStatusHandler)

  // ── OTP Verification ──────────────────────────────────────────────────────────

  /**
   * POST /api/driver/jobs/:id/verify-pickup
   * Body: { otp: '123456' }
   * Verifies the pickup OTP provided by the shipper → advances to IN_TRANSIT.
   */
  fastify.post('/jobs/:id/verify-pickup', verifyPickupOtpHandler)

  /**
   * POST /api/driver/jobs/:id/verify-delivery
   * Body: { otp: '654321' }
   * Verifies the delivery OTP → marks DELIVERED, triggers invoice generation.
   */
  fastify.post('/jobs/:id/verify-delivery', verifyDeliveryOtpHandler)

  // ── In-App Chat ───────────────────────────────────────────────────────────────

  /** GET /api/driver/jobs/:id/messages — read chat thread */
  fastify.get('/jobs/:id/messages', getDriverJobMessagesHandler)

  /** POST /api/driver/jobs/:id/messages — send a message to shipper */
  fastify.post('/jobs/:id/messages', sendDriverMessageHandler)

  // ── Availability Status ───────────────────────────────────────────────────────

  /**
   * PATCH /api/driver/status
   * Body: { status: 'AVAILABLE' | 'OFFLINE' }
   * Driver changes own availability (blocked when active order in progress).
   */
  fastify.patch('/status', updateDriverStatusHandler)

  // ── Cross-Border Documents ────────────────────────────────────────────────────

  /**
   * POST /api/driver/jobs/:id/cross-border-doc
   * Body: { document_type, file_base64, notes? }
   * Upload a cross-border document (checkpoint photo, invoice scan, etc.) for admin review.
   */
  fastify.post('/jobs/:id/cross-border-doc', uploadCrossBorderDocHandler)
}
