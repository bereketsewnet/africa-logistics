/**
 * WebSocket Manager (src/utils/wsManager.ts)
 *
 * Simple in-memory pub/sub for real-time order updates.
 * Each order has a set of WebSocket connections subscribed to it.
 * When driver pings location or order status changes, all subscribers
 * of that order receive the update instantly.
 */

import type { WebSocket } from '@fastify/websocket'

type OrderId = string

interface RoomEntry {
  socket: WebSocket
  userId: string
  roleId: number
}

const rooms = new Map<OrderId, Set<RoomEntry>>()

export const wsManager = {
  /** Subscribe a WebSocket connection to order updates */
  subscribe(orderId: OrderId, socket: WebSocket, userId: string, roleId: number): void {
    if (!rooms.has(orderId)) rooms.set(orderId, new Set())
    const entry: RoomEntry = { socket, userId, roleId }
    rooms.get(orderId)!.add(entry)

    // Auto-cleanup when connection closes
    socket.on('close', () => wsManager.unsubscribe(orderId, socket))
    socket.on('error', () => wsManager.unsubscribe(orderId, socket))
  },

  /** Remove a socket from an order's subscriber set */
  unsubscribe(orderId: OrderId, socket: WebSocket): void {
    const room = rooms.get(orderId)
    if (!room) return
    room.forEach(entry => { if (entry.socket === socket) room.delete(entry) })
    if (room.size === 0) rooms.delete(orderId)
  },

  /** Broadcast a typed event to all subscribers of an order */
  broadcast(orderId: OrderId, type: string, payload: object): void {
    const room = rooms.get(orderId)
    if (!room) return
    const msg = JSON.stringify({ type, orderId, ...payload })
    room.forEach(entry => {
      try {
        if (entry.socket.readyState === 1 /* OPEN */) entry.socket.send(msg)
      } catch { /* ignore closed socket */ }
    })
  },

  /** Count active connections for an order */
  countSubscribers(orderId: OrderId): number {
    return rooms.get(orderId)?.size ?? 0
  },
}
