import { FastifyInstance } from 'fastify'
import {
  adminGetUsersHandler,
  adminToggleActiveHandler,
  adminCreateStaffHandler,
  adminUpdateUserHandler,
  adminListDriversHandler,
  adminGetDriverHandler,
  adminReviewDocumentHandler,
  adminVerifyDriverHandler,
  adminRejectDriverHandler,
  adminListVehiclesHandler,
  adminGetVehicleHandler,
  adminCreateVehicleHandler,
  adminUpdateVehicleHandler,
  adminDeleteVehicleHandler,
  adminAssignDriverToVehicleHandler,
  adminListVehicleSubmissionsHandler,
  adminReviewVehicleSubmissionHandler,
} from '../controllers/admin.controller.js'

export default async function adminRoutes(fastify: FastifyInstance) {
  // All admin routes require a valid JWT
  fastify.addHook('onRequest', fastify.authenticate)

  // ─── User Management ────────────────────────────────────────────────────────

  /** GET /api/admin/users — list all users + stats */
  fastify.get('/users', adminGetUsersHandler)

  /** POST /api/admin/staff — create a new staff user (Admin/Cashier/Dispatcher) */
  fastify.post('/staff', adminCreateStaffHandler)

  /** PUT /api/admin/users/:id — update user details */
  fastify.put('/users/:id', adminUpdateUserHandler)

  /** PATCH /api/admin/users/:id/toggle-active — suspend / activate a user */
  fastify.patch('/users/:id/toggle-active', adminToggleActiveHandler)

  // ─── Driver Verification ────────────────────────────────────────────────────

  /**
   * GET /api/admin/drivers
   * Query: ?filter=all|pending|verified|rejected  (default: all)
   */
  fastify.get('/drivers', adminListDriversHandler)

  /** GET /api/admin/drivers/:id — full driver profile + document review history */
  fastify.get('/drivers/:id', adminGetDriverHandler)

  /**
   * POST /api/admin/drivers/:id/review-document
   * Body: { document_type, action: 'APPROVED'|'REJECTED', reason? }
   */
  fastify.post('/drivers/:id/review-document', adminReviewDocumentHandler)

  /**
   * POST /api/admin/drivers/:id/verify
   * Fully verify driver (all docs approved, badge granted, status=AVAILABLE).
   */
  fastify.post('/drivers/:id/verify', adminVerifyDriverHandler)

  /**
   * POST /api/admin/drivers/:id/reject
   * Body: { reason: string }
   */
  fastify.post('/drivers/:id/reject', adminRejectDriverHandler)

  // ─── Vehicle Management ─────────────────────────────────────────────────────

  /**
   * GET /api/admin/vehicles
   * Query: ?all=1  to include inactive (default: active only)
   */
  fastify.get('/vehicles', adminListVehiclesHandler)

  /**
   * GET /api/admin/vehicles/submissions
   * List all driver-submitted vehicles.
   * MUST be registered BEFORE /vehicles/:id to avoid route conflict.
   */
  fastify.get('/vehicles/submissions', adminListVehicleSubmissionsHandler)

  /** GET /api/admin/vehicles/:id */
  fastify.get('/vehicles/:id', adminGetVehicleHandler)

  /**
   * POST /api/admin/vehicles
   * Body: { plate_number, vehicle_type, max_capacity_kg, is_company_owned?, vehicle_photo?(base64), description? }
   */
  fastify.post('/vehicles', adminCreateVehicleHandler)

  /**
   * PUT /api/admin/vehicles/:id
   * Body: any subset of CreateVehicleBody fields + is_active?
   */
  fastify.put('/vehicles/:id', adminUpdateVehicleHandler)

  /**
   * DELETE /api/admin/vehicles/:id
   * Soft delete — sets is_active = 0.
   */
  fastify.delete('/vehicles/:id', adminDeleteVehicleHandler)

  /**
   * POST /api/admin/vehicles/:id/assign-driver
   * Body: { driver_id: string }  or empty to unassign.
   */
  fastify.post('/vehicles/:id/assign-driver', adminAssignDriverToVehicleHandler)

  /**
   * POST /api/admin/vehicles/:id/review
   * Body: { action: 'APPROVED'|'REJECTED', reason? }
   */
  fastify.post('/vehicles/:id/review', adminReviewVehicleSubmissionHandler)
}
