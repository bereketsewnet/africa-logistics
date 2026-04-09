/**
 * WebSocket Routes (src/routes/ws.ts)
 *
 * Provides real-time order tracking via WebSocket.
 *
 * Endpoint: ws://server/api/ws/orders/:orderId?token=<jwt>
 *
 * Connection flow:
 *  1. Client opens WS connection to /api/ws/orders/:orderId?token=<jwt>
 *  2. Server verifies JWT; if invalid → closes with 4001
 *  3. Server verifies caller is shipper or assigned driver → closes with 4003
 *  4. Client subscribed to order's pub/sub room
 *  5. Server sends 'CONNECTED' event with current order status
 *  6. Client receives events: STATUS_CHANGED, LOCATION_UPDATE, NEW_MESSAGE, INVOICE_READY
 *  7. Client sends ping (any message) → server pongs to keep alive
 *
 * Event payload shape:
 *  { type: 'STATUS_CHANGED', orderId: '...', status: 'IN_TRANSIT' }
 *  { type: 'LOCATION_UPDATE', orderId: '...', lat, lng, heading, speed_kmh, recorded_at }
 *  { type: 'NEW_MESSAGE', orderId: '...', message: { ...MessageRow } }
 *  { type: 'INVOICE_READY', orderId: '...', invoice_url: '...' }
 */

import { FastifyInstance } from 'fastify'
import websocketPlugin from '@fastify/websocket'
import { wsManager } from '../utils/wsManager.js'
import { getOrderById } from '../services/order.service.js'

export default async function wsRoutes(fastify: FastifyInstance) {
  await fastify.register(websocketPlugin)

  fastify.get<{ Params: { orderId: string }; Querystring: { token?: string } }>(
    '/ws/orders/:orderId',
    { websocket: true },
    async (socket, request) => {
      const { orderId } = request.params
      const token = (request.query as any).token

      // ── Authenticate via query-string token ───────────────────────────────
      let payload: { id: string; role_id: number }
      try {
        if (!token) throw new Error('No token')
        payload = fastify.jwt.verify<{ id: string; role_id: number }>(token)
      } catch {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Unauthorized' }))
        socket.close(4001)
        return
      }

      // ── Verify access to this order ───────────────────────────────────────
      const order = await getOrderById(fastify.db, orderId)
      if (!order) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Order not found' }))
        socket.close(4004)
        return
      }

      const isAdmin    = payload.role_id === 1 || payload.role_id === 4
      const isShipper  = order.shipper_id === payload.id
      const isDriver   = order.driver_id  === payload.id

      if (!isAdmin && !isShipper && !isDriver) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Access denied' }))
        socket.close(4003)
        return
      }

      // ── Subscribe to order room ───────────────────────────────────────────
      wsManager.subscribe(orderId, socket, payload.id, payload.role_id)

      // Send current order state on connect
      socket.send(JSON.stringify({
        type:    'CONNECTED',
        orderId,
        status:  order.status,
        driver:  order.driver_id ? {
          id:   order.driver_id,
          name: `${order.driver_first_name ?? ''} ${order.driver_last_name ?? ''}`.trim(),
        } : null,
      }))

      // Keep-alive: respond to any message from client
      socket.on('message', (msg: Buffer) => {
        try {
          const text = msg.toString()
          if (text === 'ping') socket.send('pong')
        } catch { /* ignore malformed */ }
      })
    }
  )
}
