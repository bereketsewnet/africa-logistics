/**
 * Orders Routes (src/routes/orders.ts)
 *
 * Prefix: /api/orders  (registered in app.ts)
 * All routes require a valid JWT.
 */

import { FastifyInstance } from 'fastify'
import {
  listCargoTypesHandler,
  getQuoteHandler,
  placeOrderHandler,
  listMyOrdersHandler,
  getOrderHandler,
  trackOrderHandler,
  getOrderHistoryHandler,
  getMessagesHandler,
  sendMessageHandler,
  cancelOrderHandler,
  downloadInvoiceHandler,
  getUnreadCountsHandler,
} from '../controllers/order.controller.js'

export default async function orderRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate)

  // ── Reference / Lookup ───────────────────────────────────────────────────────

  /** GET /api/orders/cargo-types — active cargo type list for order form */
  fastify.get('/cargo-types', listCargoTypesHandler)

  /** GET /api/orders/unread-counts — unread message count per order for current user */
  fastify.get('/unread-counts', getUnreadCountsHandler)

  // ── Quote Engine ─────────────────────────────────────────────────────────────

  /**
   * POST /api/orders/quote
   * Body: { pickup_lat, pickup_lng, delivery_lat, delivery_lng, vehicle_type }
   * Returns: { quote: { distance_km, base_fare, city_surcharge, estimated_price, ... } }
   * MUST be registered before /:id routes to avoid route conflict.
   */
  fastify.post('/quote', getQuoteHandler)

  // ── Order CRUD ────────────────────────────────────────────────────────────────

  /**
   * POST /api/orders — Place a new order (shipper only)
   * Returns: { order, otps: { pickup_otp, delivery_otp } }
   */
  fastify.post('/', placeOrderHandler)

  /**
   * GET /api/orders — My order history (paginated)
   * Query: ?page=1&limit=20&status=PENDING
   */
  fastify.get('/', listMyOrdersHandler)

  /** GET /api/orders/:id — Single order details */
  fastify.get('/:id', getOrderHandler)

  // ── Order Sub-resources ───────────────────────────────────────────────────────

  /** GET /api/orders/:id/track — live driver GPS location */
  fastify.get('/:id/track', trackOrderHandler)

  /** GET /api/orders/:id/history — status change audit trail */
  fastify.get('/:id/history', getOrderHistoryHandler)

  /** GET /api/orders/:id/messages — in-app chat thread */
  fastify.get('/:id/messages', getMessagesHandler)

  /** POST /api/orders/:id/messages — send a message */
  fastify.post('/:id/messages', sendMessageHandler)

  /** POST /api/orders/:id/cancel — cancel a PENDING/ASSIGNED order */
  fastify.post('/:id/cancel', cancelOrderHandler)

  /**
   * GET /api/orders/:id/invoice — stream PDF invoice
   * Only available for DELIVERED / COMPLETED orders.
   */
  fastify.get('/:id/invoice', downloadInvoiceHandler)
}
