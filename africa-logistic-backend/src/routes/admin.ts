import { FastifyInstance } from 'fastify'
import { redactContactFields } from '../utils/privacy.js'
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
  // ── Role Management (9.4) ─────────────────────────────────────────────────────
  adminGetMyPermissionsHandler,
  adminGetRoleManagementHandler,
  adminUpdateRolePermissionsHandler,
  adminListStaffRolesHandler,
  adminCreateRoleHandler,
  adminDeleteRoleHandler,
  // ── Security Events (Module 9) ────────────────────────────────────────────────
  adminGetSecurityEventsHandler,
  // ── Cross-Border & Customs (Module 10) ───────────────────────────────────────
  adminListCrossBorderOrdersHandler,
  adminGetCrossBorderDocsHandler,
  adminReviewCrossBorderDocHandler,
  adminUpdateBorderInfoHandler,
  adminSubmitToEswHandler,
} from '../controllers/admin.controller.js'

export default async function adminRoutes(fastify: FastifyInstance) {
  // All admin routes require a valid JWT
  fastify.addHook('onRequest', fastify.authenticate)

  const logSecurityEvent = async (payload: {
    eventType: string
    userId?: string | null
    roleId?: number | null
    ipAddress?: string | null
    method?: string | null
    endpoint?: string | null
    reason?: string | null
    metadata?: unknown
  }) => {
    try {
      await fastify.db.query(
        `INSERT INTO security_events (event_type, user_id, role_id, ip_address, method, endpoint, reason, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.eventType,
          payload.userId ?? null,
          payload.roleId ?? null,
          payload.ipAddress ?? null,
          payload.method ?? null,
          payload.endpoint ?? null,
          payload.reason ?? null,
          payload.metadata ? JSON.stringify(payload.metadata) : null,
        ]
      )
    } catch {
      // Security logging must not break request handling paths.
    }
  }

  const resolvePermissionKey = (url: string): string | null => {
    // Always allow this lightweight endpoint to build UI permissions.
    if (url.includes('/me/permissions')) return null
  // Security events is super-admin only — handler enforces it; no staff permission needed.
  if (url.includes('/security-events')) return null
  // Staff roles list is a helper for populating forms; any staff can call it.
  if (url.includes('/staff-roles')) return null

    if (url.includes('/role-management') || url.includes('/roles')) return 'roles.manage'
    if (url.includes('/system-config') || url.includes('/countries') || url.includes('/vehicle-types')) return 'settings.manage'
    if (url.includes('/notification-settings')) return 'notifications.manage'
    if (url.includes('/pricing-rules')) return 'pricing.manage'
    if (url.includes('/cargo-types')) return 'cargo.manage'
    if (url.includes('/payments/')) return 'payments.approve'
    if (url.includes('/wallet') || url.includes('/wallets') || url.includes('/wallet-stats')) return 'wallet.manage'
    if (url.includes('/drivers/performance-metrics') || url.includes('/bonuses/')) return 'bonuses.manage'
    if (url.includes('/drivers/live') || url.includes('/suggest-drivers') || url.includes('/orders/') && url.includes('/assign')) return 'dispatch.manage'
    if (url.includes('/vehicles')) return 'vehicles.manage'
    if (url.includes('/drivers/') && (url.includes('/review-document') || url.includes('/verify') || url.includes('/reject') || url.includes('/status'))) return 'drivers.verify'
    if (url.includes('/users') || url.includes('/staff')) return 'users.manage'
    if (url.includes('/orders')) return 'orders.manage'
    return 'overview.view'
  }

  // RBAC middleware for staff users (dispatcher/cashier). Super admin bypasses.
  fastify.addHook('onRequest', async (request, reply) => {
    const user = request.user as { id: string; role_id: number }
    if (user.role_id === 1) return

    // Only Shippers (2) and Drivers (3) are blocked from admin. Custom roles and staff roles are allowed.
    if ([2, 3].includes(user.role_id)) {
      await logSecurityEvent({
        eventType: 'ADMIN_ACCESS_DENIED_ROLE',
        userId: user.id,
        roleId: user.role_id,
        ipAddress: request.ip,
        method: request.method,
        endpoint: request.url,
        reason: 'Non-staff role attempted admin endpoint access',
      })
      return reply.status(403).send({ success: false, message: 'Admin access denied for your role.' })
    }

    const permissionKey = resolvePermissionKey(request.url)
    if (!permissionKey) return

    const [rows] = await fastify.db.query<any[]>(
      `SELECT is_allowed FROM role_permissions WHERE role_id = ? AND permission_key = ? LIMIT 1`,
      [user.role_id, permissionKey]
    )
    const allowed = rows[0] ? Number(rows[0].is_allowed) === 1 : false

    if (!allowed) {
      await logSecurityEvent({
        eventType: 'ADMIN_ACCESS_DENIED_PERMISSION',
        userId: user.id,
        roleId: user.role_id,
        ipAddress: request.ip,
        method: request.method,
        endpoint: request.url,
        reason: 'Missing required permission',
        metadata: { required_permission: permissionKey },
      })
      return reply.status(403).send({
        success: false,
        message: 'You do not have permission to access this admin function.',
        required_permission: permissionKey,
      })
    }
  })

  // PII masking: non-super-admin staff should not receive raw phone/email fields.
  fastify.addHook('preSerialization', async (request, _reply, payload) => {
    const user = request.user as { role_id: number }
    if (user?.role_id === 1) return payload
    if (!payload || typeof payload !== 'object') return payload
    return redactContactFields(payload)
  })

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

  // ─── Role Management (9.4) ────────────────────────────────────────────────
  fastify.get('/me/permissions',            adminGetMyPermissionsHandler)
  fastify.get('/staff-roles',               adminListStaffRolesHandler)
  fastify.get('/role-management',           adminGetRoleManagementHandler)
  fastify.post('/roles',                    adminCreateRoleHandler)
  fastify.put('/roles/:roleId/permissions', adminUpdateRolePermissionsHandler)
  fastify.delete('/roles/:id',              adminDeleteRoleHandler)

  // ─── Security Events (Module 9) ───────────────────────────────────────────
  /** GET /api/admin/security-events — audit log, super-admin only */
  fastify.get('/security-events', adminGetSecurityEventsHandler)

  // ─── Cross-Border & Customs (Module 10) ──────────────────────────────────
  /** GET /api/admin/cross-border/orders — list all cross-border orders */
  fastify.get('/cross-border/orders', adminListCrossBorderOrdersHandler)

  /** GET /api/admin/orders/:id/cross-border-docs — list docs for an order */
  fastify.get('/orders/:id/cross-border-docs', adminGetCrossBorderDocsHandler)

  /** PUT /api/admin/orders/:id/cross-border-docs/:docId — approve/reject a doc */
  fastify.put('/orders/:id/cross-border-docs/:docId', adminReviewCrossBorderDocHandler)

  /** PATCH /api/admin/orders/:id/border-info — update border reference fields */
  fastify.patch('/orders/:id/border-info', adminUpdateBorderInfoHandler)

  /** POST /api/admin/orders/:id/esw/submit — submit to eSW (mock) */
  fastify.post('/orders/:id/esw/submit', adminSubmitToEswHandler)
}
