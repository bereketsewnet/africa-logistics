/**
 * Profile Routes (src/routes/profile.ts)
 *
 * All routes are protected by fastify.authenticate (JWT required).
 * Prefix: /api/profile  (registered in app.ts)
 */

import { FastifyInstance } from 'fastify'
import {
  getProfileHandler,
  updateThemeHandler,
  getNotificationPrefsHandler,
  updateNotificationPrefsHandler,
  getDriverProfileHandler,
  uploadDriverDocumentsHandler,
  getDriverDocReviewsHandler,
  getDriverVehiclesHandler,
  submitDriverVehicleHandler,
} from '../controllers/profile.controller.js'

export default async function profileRoutes(fastify: FastifyInstance) {
  // Apply JWT authentication to every route in this plugin
  fastify.addHook('onRequest', fastify.authenticate)

  // ─── General Profile ────────────────────────────────────────────────────────

  /**
   * GET /api/profile
   * Returns the full profile of the authenticated user.
   * Includes driver_profile row if role is DRIVER.
   */
  fastify.get('/', getProfileHandler)

  // ─── Theme Preference ───────────────────────────────────────────────────────

  /**
   * PUT /api/profile/theme
   * Body: { theme: "LIGHT" | "DARK" | "SYSTEM" }
   */
  fastify.put('/theme', updateThemeHandler)

  // ─── Notification Preferences ───────────────────────────────────────────────

  /**
   * GET /api/profile/notifications
   * Returns current notification preferences (or defaults).
   */
  fastify.get('/notifications', getNotificationPrefsHandler)

  /**
   * PUT /api/profile/notifications
   * Body: { sms_enabled?, email_enabled?, browser_enabled?, order_updates?, promotions? }
   */
  fastify.put('/notifications', updateNotificationPrefsHandler)

  // ─── Driver Profile & Documents ─────────────────────────────────────────────

  /**
   * GET /api/profile/driver
   * Returns the authenticated driver's profile + document statuses.
   * Requires role_id = 3 (DRIVER).
   */
  fastify.get('/driver', getDriverProfileHandler)

  /**
   * POST /api/profile/driver/documents
   * Upload one or more driver documents as base64 strings.
   * Body: { national_id?: string (base64), license?: string (base64), libre?: string (base64) }
   * Requires role_id = 3 (DRIVER).
   */
  fastify.post('/driver/documents', uploadDriverDocumentsHandler)

  /**
   * GET /api/profile/driver/reviews
   * Returns the document review history (rejection reasons, dates) for this driver.
   */
  fastify.get('/driver/reviews', getDriverDocReviewsHandler)

  /**
   * GET /api/profile/driver/vehicles
   * Returns all vehicles submitted by or assigned to this driver.
   */
  fastify.get('/driver/vehicles', getDriverVehiclesHandler)

  /**
   * POST /api/profile/driver/vehicles
   * Driver submits their own vehicle for admin approval.
   */
  fastify.post('/driver/vehicles', submitDriverVehicleHandler)
}
