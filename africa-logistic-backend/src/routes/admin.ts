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
  adminUpdateOrderDetailsHandler,
  adminUpdateOrderNotesHandler,
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
  // ── Live Drivers ───────────────────────────────────────────────────────────
  adminLiveDriversHandler,
  // ── Guest Orders ───────────────────────────────────────────────────────────
  adminListGuestOrdersHandler,
  // ── Order Chat ─────────────────────────────────────────────────────────────
  adminGetOrderMessagesHandler,
  adminSendOrderMessageHandler,
  // ── Dispatch & Pricing ──────────────────────────────────────────────────────
  adminSuggestDriversHandler,
  adminUpdateOrderPriceHandler,
  // ── Driver Ratings ─────────────────────────────────────────────────────────
  adminGetDriverRatingsHandler,
  adminDeleteRatingHandler,
  adminUpdateDriverStatusHandler,
  // ── Financial/Payment Management ───────────────────────────────────────────
  getPendingPaymentsHandler,
  approveManualPaymentHandler,
  rejectManualPaymentHandler,
  adminAdjustWalletHandler,
  getWalletStatsHandler,
  getAdminWalletHandler,
  refillAdminWalletHandler,
  getAdminWalletTransactionsHandler,
  // ── Performance Bonuses ────────────────────────────────────────────────────
  getPerformanceMetricsHandler,
  processPerfBonusesHandler,  // ── System Notification Settings ──────────────────────────────────────
  getNotifSettingsHandler,
  updateNotifSettingsHandler,
  // ── Vehicle Types (8.4) ──────────────────────────────────────────────────────
  adminListVehicleTypesHandler,
  adminCreateVehicleTypeHandler,
  adminUpdateVehicleTypeHandler,
  // ── Countries (8.1) ──────────────────────────────────────────────────────────
  adminListCountriesHandler,
  adminCreateCountryHandler,
  adminUpdateCountryHandler,
  // ── System Config (8.3) ───────────────────────────────────────────────────────
  adminGetSystemConfigHandler,
  adminUpdateSystemConfigHandler,
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

  // ─── Driver Live Tracking ─────────────────────────────────────────────────────

  /** GET /api/admin/drivers/live — all drivers with latest GPS + active order */
  fastify.get('/drivers/live', adminLiveDriversHandler)

  // ─── Order Management ────────────────────────────────────────────────────────

  /** POST /api/admin/orders — admin creates order on behalf of shipper or guest */
  fastify.post('/orders', adminCreateOrderOnBehalfHandler)

  /** GET /api/admin/orders — all orders with filters */
  fastify.get('/orders', adminListOrdersHandler)

  /** GET /api/admin/orders/stats — order counts + revenue summary */
  fastify.get('/orders/stats', adminOrderStatsHandler)

  /**
   * GET /api/admin/orders/guest — list guest-only orders
   * MUST be registered BEFORE /orders/:id to avoid route conflict.
   */
  fastify.get('/orders/guest', adminListGuestOrdersHandler)

  /** GET /api/admin/orders/:id/suggest-drivers — nearest available drivers, sorted by distance */
  fastify.get('/orders/:id/suggest-drivers', adminSuggestDriversHandler)

  /** PATCH /api/admin/orders/:id/price — override final price */
  fastify.patch('/orders/:id/price', adminUpdateOrderPriceHandler)

  /** GET /api/admin/orders/:id — single order details */
  fastify.get('/orders/:id', adminGetOrderHandler)

  /** GET /api/admin/orders/:id/messages — chat messages for an order */
  fastify.get('/orders/:id/messages', adminGetOrderMessagesHandler)

  /** POST /api/admin/orders/:id/messages — send a message to driver */
  fastify.post('/orders/:id/messages', adminSendOrderMessageHandler)

  /** PATCH /api/admin/orders/:id/assign — assign driver to order */
  fastify.patch('/orders/:id/assign', adminAssignOrderHandler)

  /** PATCH /api/admin/orders/:id/status — override order status */
  fastify.patch('/orders/:id/status', adminUpdateOrderStatusHandler)

  /** PATCH /api/admin/orders/:id/details — override core order details */
  fastify.patch('/orders/:id/details', adminUpdateOrderDetailsHandler)

  /** PATCH /api/admin/orders/:id/notes — internal admin notes */
  fastify.patch('/orders/:id/notes', adminUpdateOrderNotesHandler)

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

  // ─── Driver Ratings ────────────────────────────────────────────────────────────

  /** GET /api/admin/drivers/:id/ratings — list ratings for a driver */
  fastify.get('/drivers/:id/ratings', adminGetDriverRatingsHandler)

  /** DELETE /api/admin/ratings/:id — soft-delete a rating */
  fastify.delete('/ratings/:id', adminDeleteRatingHandler)

  /** PATCH /api/admin/drivers/:id/status — admin override driver status */
  fastify.patch('/drivers/:id/status', adminUpdateDriverStatusHandler)

  // ── Financial/Payment Management ─────────────────────────────────────────

  /** GET /api/admin/payments/pending — list pending manual payment submissions */
  fastify.get('/payments/pending', getPendingPaymentsHandler)

  /** POST /api/admin/payments/:recordId/approve — approve a manual payment */
  fastify.post('/payments/:recordId/approve', approveManualPaymentHandler)

  /** POST /api/admin/payments/:recordId/reject — reject a manual payment */
  fastify.post('/payments/:recordId/reject', rejectManualPaymentHandler)

  /** POST /api/admin/wallets/:userId/adjust — manually adjust user wallet (emergency correction) */
  fastify.post('/wallets/:userId/adjust', adminAdjustWalletHandler)

  /** GET /api/admin/wallet — current admin wallet summary */
  fastify.get('/wallet', getAdminWalletHandler)

  /** POST /api/admin/wallet/refill — refill admin wallet and record history */
  fastify.post('/wallet/refill', refillAdminWalletHandler)

  /** GET /api/admin/wallet/transactions — admin wallet transaction history */
  fastify.get('/wallet/transactions', getAdminWalletTransactionsHandler)

  /** GET /api/admin/wallet-stats — overall wallet and financial statistics */
  fastify.get('/wallet-stats', getWalletStatsHandler)

  // ── Performance Bonuses ────────────────────────────────────────────────────

  /** GET /api/admin/drivers/performance-metrics — get all drivers' performance metrics */
  fastify.get('/drivers/performance-metrics', getPerformanceMetricsHandler)

  /** POST /api/admin/bonuses/process — manually trigger batch bonus processing */
  fastify.post('/bonuses/process', processPerfBonusesHandler)
  // ── System Notification Settings ──────────────────────────────────────

  /** GET /api/admin/notification-settings — read global notification on/off switches */
  fastify.get('/notification-settings', getNotifSettingsHandler)
  fastify.put('/notification-settings', updateNotifSettingsHandler)

  // ─── Vehicle Types (8.4) ──────────────────────────────────────────────────
  fastify.get('/vehicle-types',     adminListVehicleTypesHandler)
  fastify.post('/vehicle-types',    adminCreateVehicleTypeHandler)
  fastify.put('/vehicle-types/:id', adminUpdateVehicleTypeHandler)

  // ─── Countries (8.1) ──────────────────────────────────────────────────────
  fastify.get('/countries',         adminListCountriesHandler)
  fastify.post('/countries',        adminCreateCountryHandler)
  fastify.put('/countries/:id',     adminUpdateCountryHandler)

  // ─── System Config (8.3) ──────────────────────────────────────────────────
  fastify.get('/system-config',     adminGetSystemConfigHandler)
  fastify.put('/system-config',     adminUpdateSystemConfigHandler)
}
