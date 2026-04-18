/**
 * Profile Routes (src/routes/profile.ts)
 *
 * All routes are protected by fastify.authenticate (JWT required).
 * Prefix: /api/profile  (registered in app.ts)
 */

import { FastifyInstance } from 'fastify'
import {
  getProfileHandler,
  askAssistantHandler,
  updateThemeHandler,
  getNotificationPrefsHandler,
  updateNotificationPrefsHandler,
  getPushPublicKeyHandler,
  subscribePushHandler,
  unsubscribePushHandler,
  getDriverProfileHandler,
  uploadDriverDocumentsHandler,
  getDriverDocReviewsHandler,
  getDriverVehiclesHandler,
  submitDriverVehicleHandler,
  getWalletHandler,
  getTransactionHistoryHandler,
  getInvoicesHandler,
  downloadInvoiceHandler,
  submitManualPaymentHandler,
} from '../controllers/profile.controller.js'
import {
  submitWithdrawalHandler,
  getMyWithdrawalsHandler,
} from '../controllers/withdrawal.controller.js'

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
   * POST /api/profile/assistant/ask
   * Authenticated AI assistant endpoint for shipper/driver floating chat.
   */
  fastify.post('/assistant/ask', {
    schema: {
      body: {
        type: 'object',
        required: ['question'],
        properties: {
          question: { type: 'string', minLength: 1, maxLength: 5000 },
          session_id: { type: 'number' },
          user_name: { type: 'string', minLength: 1, maxLength: 120 },
          user_role: { type: 'string', minLength: 1, maxLength: 80 },
        },
      },
    },
  }, askAssistantHandler)

  /**
   * PUT /api/profile/notifications
   * Body: { sms_enabled?, email_enabled?, browser_enabled?, order_updates?, promotions? }
   */
  fastify.put('/notifications', updateNotificationPrefsHandler)

  /** GET /api/profile/push/public-key — returns VAPID public key */
  fastify.get('/push/public-key', getPushPublicKeyHandler)

  /** POST /api/profile/push/subscribe — save browser push subscription */
  fastify.post('/push/subscribe', subscribePushHandler)

  /** POST /api/profile/push/unsubscribe — deactivate browser push subscription */
  fastify.post('/push/unsubscribe', unsubscribePushHandler)

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

  // ─── Financial / Wallet Endpoints ───────────────────────────────────────────

  /**
   * GET /api/profile/wallet
   * Get user's wallet balance, recent transactions, and summary
   */
  fastify.get('/wallet', getWalletHandler)

  /**
   * GET /api/profile/wallet/transactions
   * Get paginated transaction history
   * Query: limit=50, offset=0
   */
  fastify.get('/wallet/transactions', getTransactionHistoryHandler)

  /**
   * GET /api/profile/invoices
   * Get user's invoices (shipper or driver depending on role)
   * Query: limit=50, offset=0
   */
  fastify.get('/invoices', getInvoicesHandler)

  /**
   * POST /api/profile/invoices/:invoiceId/download
   * Mark invoice as downloaded (for tracking)
   * Params: invoiceId
   */
  fastify.post('/invoices/:invoiceId/download', downloadInvoiceHandler)

  /**
   * POST /api/profile/wallet/manual-payment
   * Submit manual payment proof for admin approval
   * Body: { amount, payment_method, proof_image? (base64) }
   */
  fastify.post('/wallet/manual-payment', submitManualPaymentHandler)

  // ─── Withdrawal Endpoints ────────────────────────────────────────────────────

  /**
   * POST /api/profile/wallet/withdrawal
   * Submit a withdrawal request (user-initiated)
   * Body: { amount, bank_details: { bank_name, account_number, account_name, method? }, notes?, proof_image_base64? }
   */
  fastify.post('/wallet/withdrawal', submitWithdrawalHandler)

  /**
   * GET /api/profile/wallet/withdrawals
   * Get the authenticated user's withdrawal request history
   * Query: limit=20, offset=0
   */
  fastify.get('/wallet/withdrawals', getMyWithdrawalsHandler)

  /**
   * GET /api/profile/driver/order-payments
   * Driver sees all admin payments made to them (wallet + bank transfer)
   */
  fastify.get('/driver/order-payments', async (request, reply) => {
    const user = (request as any).user
    if (user?.role_id !== 3) return reply.status(403).send({ success: false, message: 'Drivers only' })
    const [rowsRaw] = await (request as any).server.db.query(
      `SELECT odp.*,
              o.reference_code, o.pickup_address, o.delivery_address,
              CONCAT(a.first_name, ' ', IFNULL(a.last_name,'')) AS admin_name
       FROM order_driver_payments odp
       JOIN orders o ON o.id = odp.order_id
       LEFT JOIN users a ON a.id = odp.admin_id
       WHERE odp.driver_id = ?
       ORDER BY odp.created_at DESC
       LIMIT 100`,
      [user.id]
    )
    const rows = rowsRaw as any[]
    return reply.send({ success: true, payments: rows })
  })
}
