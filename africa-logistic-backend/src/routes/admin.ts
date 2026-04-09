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
  // ── Order Management ──────────────────────────────────────────────────────
  adminListOrdersHandler,
  adminGetOrderHandler,
  adminAssignOrderHandler,
  adminUpdateOrderStatusHandler,
  adminCancelOrderHandler,
  adminOrderStatsHandler,
  adminCreateOrderOnBehalfHandler,
  // ── Cargo Types ────────────────────────────────────────────────────────────
  adminListCargoTypesHandler,
  adminCreateCargoTypeHandler,
  adminUpdateCargoTypeHandler,
  // ── Pricing Rules ──────────────────────────────────────────────────────────
  adminListPricingRulesHandler,
  adminCreatePricingRuleHandler,
  adminUpdatePricingRuleHandler,
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

  // ─── Order Management ────────────────────────────────────────────────────────

  /** POST /api/admin/orders — admin creates order on behalf of shipper */
  fastify.post('/orders', adminCreateOrderOnBehalfHandler)

  /** GET /api/admin/orders — all orders with filters */
  fastify.get('/orders', adminListOrdersHandler)

  /** GET /api/admin/orders/stats — order counts + revenue summary */
  fastify.get('/orders/stats', adminOrderStatsHandler)

  /** GET /api/admin/orders/:id — single order details */
  fastify.get('/orders/:id', adminGetOrderHandler)

  /** PATCH /api/admin/orders/:id/assign — assign driver to order */
  fastify.patch('/orders/:id/assign', adminAssignOrderHandler)

  /** PATCH /api/admin/orders/:id/status — override order status */
  fastify.patch('/orders/:id/status', adminUpdateOrderStatusHandler)

  /** POST /api/admin/orders/:id/cancel — cancel an order */
  fastify.post('/orders/:id/cancel', adminCancelOrderHandler)

  // ─── Cargo Types ─────────────────────────────────────────────────────────────

  /** GET /api/admin/cargo-types — all cargo types (active + inactive) */
  fastify.get('/cargo-types', adminListCargoTypesHandler)

  /** POST /api/admin/cargo-types — create a new cargo type */
  fastify.post('/cargo-types', adminCreateCargoTypeHandler)

  /** PUT /api/admin/cargo-types/:id — update a cargo type */
  fastify.put('/cargo-types/:id', adminUpdateCargoTypeHandler)

  // ─── Pricing Rules ────────────────────────────────────────────────────────────

  /** GET /api/admin/pricing-rules — list all pricing rules */
  fastify.get('/pricing-rules', adminListPricingRulesHandler)

  /** POST /api/admin/pricing-rules — create a pricing rule */
  fastify.post('/pricing-rules', adminCreatePricingRuleHandler)

  /** PUT /api/admin/pricing-rules/:id — update a pricing rule */
  fastify.put('/pricing-rules/:id', adminUpdatePricingRuleHandler)
}
