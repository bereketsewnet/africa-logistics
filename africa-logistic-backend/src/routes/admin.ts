import { FastifyInstance } from 'fastify'
import {
  adminGetUsersHandler,
  adminToggleActiveHandler,
  adminDeleteUserHandler,
  adminUserDeletionImpactHandler,
  adminCreateStaffHandler,
  adminCreateCarOwnerHandler,
  adminCreateDriverHandler,
  adminResendDriverCredentialsHandler,
  adminDriversForDispatchHandler,
  adminVehiclesForDispatchHandler,
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
  adminDeleteOrderHandler,
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
  adminUpdateOrderPricingHandler,
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
  adminGetContactInfoHandler,
  adminUpdateContactInfoHandler,
  adminGetAiSettingsHandler,
  adminUpdateAiSettingsHandler,
  adminListBankAccountsHandler,
  adminCreateBankAccountHandler,
  adminUpdateBankAccountHandler,
  adminDeleteBankAccountHandler,
  adminGetSmsSettingsHandler,
  adminUpdateSmsSettingsHandler,
  adminTestSmsHandler,
  adminListDocumentationHandler,
  adminCreateDocumentationHandler,
  adminUpdateDocumentationHandler,
  adminDeleteDocumentationHandler,
  adminOrderReportHandler,
  adminFinanceReportHandler,
  adminDriverReportHandler,
  adminLogisticsReportHandler,
  adminPayDriverWalletHandler,
  adminBankTransferDriverHandler,
  adminCollectOrderPaymentHandler,
  adminGetOrderDriverPaymentsHandler,
} from '../controllers/admin.controller.js'
import {
  adminCreateCompanyHandler,
  adminListCompaniesHandler,
  adminGetCompanyHandler,
  adminUpdateCompanyHandler,
  adminReviewCompanyHandler,
  adminResendCompanyCredentialsHandler,
  adminCompanyDeletionImpactHandler,
  adminDeleteCompanyHandler,
  adminListCompanyVehiclesHandler,
  adminCreateCompanyVehicleHandler,
  adminReviewCompanyVehicleHandler,
  adminCompanyVehicleOperationalStatusHandler,
  adminAssignCompanyVehicleDriverHandler,
  adminDeleteCompanyVehicleHandler,
  adminCompanyOverviewHandler,
  adminListCompanyDriversHandler,
  adminCreateCompanyDriverHandler,
  adminUpdateCompanyDriverHandler,
  adminResendCompanyDriverCredentialsHandler,
  adminRemoveCompanyDriverHandler,
} from '../controllers/companyAdmin.controller.js'
import {
  adminListCarOwnerVehiclesHandler,
  adminReviewCarOwnerVehicleHandler,
  adminAssignDriverToCarOwnerVehicleHandler,
  adminListDriversForCarAssignHandler,
} from '../controllers/carowner.controller.js'
import {
  adminListWithdrawalsHandler,
  adminApproveWithdrawalHandler,
  adminRejectWithdrawalHandler,
} from '../controllers/withdrawal.controller.js'

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

  const resolvePermissionKey = (rawUrl: string, method: string): string | null => {
    // Match on the path only. Every rule below is a substring test, so a query
    // value such as '?search=/companies' would otherwise decide the permission
    // for a completely unrelated endpoint — letting a role that holds the
    // matched permission reach one it does not.
    const url = rawUrl.split('?')[0]

    // Always allow this lightweight endpoint to build UI permissions.
    if (url.includes('/me/permissions')) return null
  // Security events is super-admin only — handler enforces it; no staff permission needed.
  if (url.includes('/security-events')) return null
  // Staff roles list is a helper for populating forms; any staff can call it.
  if (url.includes('/staff-roles')) return null

    // Companies first, above every generic matcher. Two traps this avoids:
    // '/companies/:id/vehicles' would be caught by the '/vehicles' rule below,
    // and '/company-vehicles' matches NO rule at all (it is '-vehicles', not
    // '/vehicles') so it would silently fall through to 'overview.view' and be
    // readable by any staff role. The same holds for '/company-drivers', which
    // likewise contains neither '/drivers' nor '/users'.
    //
    // Matching the '/company' prefix rather than listing each sibling is
    // deliberate: a future '/company-anything' route is then protected the day
    // it is added, instead of silently defaulting open until someone notices.
    if (url.includes('/companies') || url.includes('/company-')) return 'companies.manage'
    // Car-owner vehicle administration. Explicit, for the same reason as above:
    // '/car-owner-vehicles' contains neither '/vehicles' nor '/users', so without a
    // rule it falls through to the default 'overview.view' — which every staff role
    // holds. That silent under-protection is the hazard, not a wrong label.
    if (url.includes('/car-owner-vehicles') || url.includes('/drivers-for-car-assign')) return 'vehicles.manage'
    if (url.includes('/role-management') || url.includes('/roles')) return 'roles.manage'
    if (url.includes('/system-config') || url.includes('/countries') || url.includes('/vehicle-types') || url.includes('/bank-accounts') || url.includes('/documentation')) return 'settings.manage'
    if (url.includes('/notification-settings')) return 'notifications.manage'
    if (url.includes('/pricing-rules')) return 'pricing.manage'
    if (url.includes('/cargo-types')) return 'cargo.manage'
    if (url.includes('/payments/')) return 'payments.approve'
    if (url.includes('/withdrawal-requests')) return 'payments.approve'
    if (url.includes('/wallet-stats')) return 'wallet.manage'
    if (url.includes('/wallet') || url.includes('/wallets')) return 'wallet.manage'
    if (url.includes('/drivers/performance-metrics') || url.includes('/bonuses/')) return 'bonuses.manage'
    if (url.includes('/drivers/live') || url.includes('/suggest-drivers') || (url.includes('/orders/') && url.includes('/assign'))) return 'dispatch.manage'
    if (url.includes('/vehicles')) return 'vehicles.manage'
    // Covers GET /drivers, GET /drivers/:id, /drivers/:id/review-document, /drivers/:id/verify, etc. and DELETE /ratings/:id
    if (url.includes('/drivers') || url.includes('/ratings')) return 'drivers.verify'
    if (url.includes('/users') || url.includes('/staff')) return 'users.manage'
    // Collecting an order payment moves money, so it is gated on the finance
    // permission rather than the broader order-management one.
    if (url.includes('/collect-payment')) return 'payments.approve'
    if (url.includes('/reports/finance')) return 'payments.approve'
    if (url.includes('/reports/orders')) return 'orders.manage'
    if (url.includes('/reports/drivers') || url.includes('/reports/logistics')) return 'dispatch.manage'
    if (url.includes('/orders')) return 'orders.manage'
    return 'overview.view'
  }

  // Map of permission keys that should also be allowed if the user
  // has one of the listed "dependent" permissions (read-only access).
  // e.g. anyone who can manage orders also needs to read cargo types & driver lists.
  const PERMISSION_ALIASES: Record<string, string[]> = {
    'cargo.manage':   ['orders.manage', 'dispatch.manage'],
    'drivers.verify': ['orders.manage', 'dispatch.manage'],
    'wallet.manage':  ['payments.approve'],
    'companies.manage': ['vehicles.manage'],
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

    const permissionKey = resolvePermissionKey(request.url, request.method)
    if (!permissionKey) return

    // Build the list of permission keys to check: the primary key + any aliases
    const keysToCheck = [permissionKey, ...(PERMISSION_ALIASES[permissionKey] ?? [])]
    const placeholders = keysToCheck.map(() => '?').join(',')
    const [rows] = await fastify.db.query<any[]>(
      `SELECT is_allowed FROM role_permissions WHERE role_id = ? AND permission_key IN (${placeholders}) AND is_allowed = 1 LIMIT 1`,
      [user.role_id, ...keysToCheck]
    )
    const allowed = rows.length > 0

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

  // Staff see contact details in full, by the owner's decision.
  //
  // A preSerialization hook used to null every *phone* / *email* field for anyone
  // who was not super-admin. It was removed deliberately: dispatchers and cashiers
  // have to telephone shippers, owners and drivers to do the job, and a masked
  // number makes that impossible. Permissions — not redaction — are now the only
  // control over who can reach this data, which is why the route-level permission
  // rules above matter more than they did before.
  //
  // This is NOT the chat sanitiser. `sanitizeChatContent` still strips numbers from
  // in-app messages so shippers and drivers cannot swap contacts and take the job
  // off-platform; that protects the business, not staff privacy, and is untouched.

  // ─── User Management ────────────────────────────────────────────────────────

  /** GET /api/admin/users — list all users + stats */
  fastify.get('/users', adminGetUsersHandler)

  /** POST /api/admin/staff — create a new staff user (Admin/Cashier/Dispatcher) */
  fastify.post('/staff', adminCreateStaffHandler)

  // ─── Car Owner Vehicles (admin side) ───────────────────────────────────────
  // Moved here from routes/carowner.ts so they finally inherit the RBAC hook and
  // the security-event logging. Gated on 'vehicles.manage'.

  /** GET /api/admin/car-owner-vehicles */
  fastify.get('/car-owner-vehicles', adminListCarOwnerVehiclesHandler)

  /** PATCH /api/admin/car-owner-vehicles/:id/review */
  fastify.patch('/car-owner-vehicles/:id/review', {
    schema: {
      body: {
        type: 'object',
        required: ['action'],
        properties: {
          action:     { type: 'string', enum: ['APPROVED', 'REJECTED'] },
          admin_note: { type: 'string', maxLength: 500 },
        },
      },
    },
  }, adminReviewCarOwnerVehicleHandler)

  /** PATCH /api/admin/car-owner-vehicles/:id/assign-driver */
  fastify.patch('/car-owner-vehicles/:id/assign-driver', {
    schema: {
      body: {
        type: 'object',
        properties: { driver_id: { type: ['string', 'null'] } },
      },
    },
  }, adminAssignDriverToCarOwnerVehicleHandler)

  /** GET /api/admin/drivers-for-car-assign */
  fastify.get('/drivers-for-car-assign', adminListDriversForCarAssignHandler)

  // ─── Transport Companies ───────────────────────────────────────────────────
  // Declared here, NOT in routes/carowner.ts: only routes inside this plugin
  // get the RBAC permission check and the PII-redaction hook.

  /** POST /api/admin/companies — create a company and its login */
  fastify.post('/companies', adminCreateCompanyHandler)

  /** GET /api/admin/companies — paginated, searchable */
  fastify.get('/companies', adminListCompaniesHandler)

  /** GET /api/admin/companies/:id/deletion-impact — what a delete would destroy */
  fastify.get('/companies/:id/deletion-impact', adminCompanyDeletionImpactHandler)

  /** GET /api/admin/companies/:id/overview — profile + fleet and roster counts */
  fastify.get('/companies/:id/overview', adminCompanyOverviewHandler)

  /** POST /api/admin/companies/:id/resend-credentials */
  fastify.post('/companies/:id/resend-credentials', adminResendCompanyCredentialsHandler)

  /** PATCH /api/admin/companies/:id/review — approve / reject / suspend */
  fastify.patch('/companies/:id/review', adminReviewCompanyHandler)

  /** GET /api/admin/companies/:id */
  fastify.get('/companies/:id', adminGetCompanyHandler)

  /** PATCH /api/admin/companies/:id */
  fastify.patch('/companies/:id', adminUpdateCompanyHandler)

  /** DELETE /api/admin/companies/:id — company + all its vehicles + its login */
  fastify.delete('/companies/:id', adminDeleteCompanyHandler)

  // ─── Company Vehicles ──────────────────────────────────────────────────────

  /** GET /api/admin/company-vehicles — paginated, filter by company/status */
  fastify.get('/company-vehicles', adminListCompanyVehiclesHandler)

  /** POST /api/admin/company-vehicles — register a truck for a company */
  fastify.post('/company-vehicles', adminCreateCompanyVehicleHandler)

  /** PATCH /api/admin/company-vehicles/:id/review */
  fastify.patch('/company-vehicles/:id/review', adminReviewCompanyVehicleHandler)

  /** PATCH /api/admin/company-vehicles/:id/operational-status */
  fastify.patch('/company-vehicles/:id/operational-status', adminCompanyVehicleOperationalStatusHandler)

  /** PATCH /api/admin/company-vehicles/:id/assign-driver */
  fastify.patch('/company-vehicles/:id/assign-driver', adminAssignCompanyVehicleDriverHandler)

  /** DELETE /api/admin/company-vehicles/:id */
  fastify.delete('/company-vehicles/:id', adminDeleteCompanyVehicleHandler)

  // ─── Company Drivers ───────────────────────────────────────────────────────
  // Company drivers are ordinary role-3 drivers carrying a company_id, so they
  // stay dispatchable by every existing code path.

  /**
   * GET /api/admin/drivers-for-dispatch — assignable drivers + their current truck.
   * Contains '/drivers', so resolvePermissionKey maps it to 'drivers.verify', which
   * dispatchers and admins hold. Correct for a dispatch-side list.
   */
  fastify.get('/drivers-for-dispatch', adminDriversForDispatchHandler)

  /**
   * GET /api/admin/vehicles-for-dispatch — every dispatchable truck, all three fleets.
   * Contains '/vehicles', so it resolves to 'vehicles.manage'.
   */
  fastify.get('/vehicles-for-dispatch', adminVehiclesForDispatchHandler)

  /** GET /api/admin/company-drivers — the roster, filter by company */
  fastify.get('/company-drivers', adminListCompanyDriversHandler)

  /** POST /api/admin/company-drivers — register a driver onto a company roster */
  fastify.post('/company-drivers', adminCreateCompanyDriverHandler)

  /** POST /api/admin/company-drivers/:id/resend-credentials */
  fastify.post('/company-drivers/:id/resend-credentials', adminResendCompanyDriverCredentialsHandler)

  /** PATCH /api/admin/company-drivers/:id */
  fastify.patch('/company-drivers/:id', adminUpdateCompanyDriverHandler)

  /** DELETE /api/admin/company-drivers/:id — detach by default, ?mode=purge deletes */
  fastify.delete('/company-drivers/:id', adminRemoveCompanyDriverHandler)

  /** POST /api/admin/users/car-owner — register a Car Owner on their behalf */
  fastify.post('/users/car-owner', adminCreateCarOwnerHandler)

  /**
   * POST /api/admin/users/driver — register a Driver on their behalf.
   * Singular "driver" is deliberate: resolvePermissionKey matches '/drivers'
   * (→ drivers.verify) before '/users' (→ users.manage), so a plural path would
   * silently resolve to the wrong permission.
   */
  fastify.post('/users/driver', adminCreateDriverHandler)

  /** POST /api/admin/users/driver/:id/resend-credentials — new password by SMS */
  fastify.post('/users/driver/:id/resend-credentials', adminResendDriverCredentialsHandler)

  /** PUT /api/admin/users/:id — update user details */
  fastify.put('/users/:id', adminUpdateUserHandler)

  /** PATCH /api/admin/users/:id/toggle-active — suspend / activate a user */
  fastify.patch('/users/:id/toggle-active', adminToggleActiveHandler)

  /** GET /api/admin/users/:id/deletion-impact — what a delete would remove */
  fastify.get('/users/:id/deletion-impact', adminUserDeletionImpactHandler)

  /** DELETE /api/admin/users/:id — permanently delete an account */
  fastify.delete('/users/:id', adminDeleteUserHandler)

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

  /** GET /api/admin/reports/orders?from=YYYY-MM-DD&to=YYYY-MM-DD — full order report */
  fastify.get('/reports/orders', adminOrderReportHandler)

  /** GET /api/admin/reports/finance?from=YYYY-MM-DD&to=YYYY-MM-DD — full finance report */
  fastify.get('/reports/finance', adminFinanceReportHandler)

  /** GET /api/admin/reports/drivers?from=YYYY-MM-DD&to=YYYY-MM-DD — full driver report */
  fastify.get('/reports/drivers', adminDriverReportHandler)

  /** GET /api/admin/reports/logistics?from=YYYY-MM-DD&to=YYYY-MM-DD — full logistics report */
  fastify.get('/reports/logistics', adminLogisticsReportHandler)

  /**
   * GET /api/admin/orders/guest — list guest-only orders
   * MUST be registered BEFORE /orders/:id to avoid route conflict.
   */
  fastify.get('/orders/guest', adminListGuestOrdersHandler)

  /** GET /api/admin/orders/:id/suggest-drivers — nearest available drivers, sorted by distance */
  fastify.get('/orders/:id/suggest-drivers', adminSuggestDriversHandler)

  /** PATCH /api/admin/orders/:id/price — override final price */
  fastify.patch('/orders/:id/price', adminUpdateOrderPriceHandler)

  /** PATCH /api/admin/orders/:id/pricing — correct distance and base fare */
  fastify.patch('/orders/:id/pricing', adminUpdateOrderPricingHandler)

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

  /** DELETE /api/admin/orders/:id — permanently delete a cancelled order */
  fastify.delete('/orders/:id', adminDeleteOrderHandler)

  /** POST /api/admin/orders/:id/collect-payment — collect shipper payment and complete */
  fastify.post('/orders/:id/collect-payment', adminCollectOrderPaymentHandler)

  /** POST /api/admin/orders/:id/pay-driver — credit driver wallet with commission */
  fastify.post('/orders/:id/pay-driver', adminPayDriverWalletHandler)

  /** POST /api/admin/orders/:id/bank-transfer — record bank transfer to driver */
  fastify.post('/orders/:id/bank-transfer', adminBankTransferDriverHandler)

  /** GET /api/admin/orders/:id/driver-payments — get payment records for order */
  fastify.get('/orders/:id/driver-payments', adminGetOrderDriverPaymentsHandler)

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

  // ── Withdrawal Requests ────────────────────────────────────────────────────

  /** GET /api/admin/withdrawal-requests — list withdrawal requests */
  fastify.get('/withdrawal-requests', adminListWithdrawalsHandler)

  /** POST /api/admin/withdrawal-requests/:requestId/approve */
  fastify.post('/withdrawal-requests/:requestId/approve', adminApproveWithdrawalHandler)

  /** POST /api/admin/withdrawal-requests/:requestId/reject */
  fastify.post('/withdrawal-requests/:requestId/reject', adminRejectWithdrawalHandler)

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

  // ─── Company Contact & AI Settings ────────────────────────────────────────
  fastify.get('/settings/contact',    adminGetContactInfoHandler)
  fastify.put('/settings/contact',    adminUpdateContactInfoHandler)
  fastify.get('/settings/ai',         adminGetAiSettingsHandler)
  fastify.put('/settings/ai',         adminUpdateAiSettingsHandler)
  fastify.get('/settings/sms',        adminGetSmsSettingsHandler)
  fastify.put('/settings/sms',        adminUpdateSmsSettingsHandler)
  fastify.post('/settings/sms/test',  adminTestSmsHandler)
  fastify.get('/bank-accounts',       adminListBankAccountsHandler)
  fastify.post('/bank-accounts',      adminCreateBankAccountHandler)
  fastify.put('/bank-accounts/:id',   adminUpdateBankAccountHandler)
  fastify.delete('/bank-accounts/:id', adminDeleteBankAccountHandler)

  // ── Public Documentation Library ──────────────────────────────────────────
  fastify.get('/documentation',       adminListDocumentationHandler)
  fastify.post('/documentation',      adminCreateDocumentationHandler)
  fastify.put('/documentation/:id',   adminUpdateDocumentationHandler)
  fastify.delete('/documentation/:id', adminDeleteDocumentationHandler)
}
