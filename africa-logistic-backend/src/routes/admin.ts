import { FastifyInstance } from 'fastify'
import {
  adminGetUsersHandler,
  adminToggleActiveHandler,
} from '../controllers/admin.controller.js'

export default async function adminRoutes(fastify: FastifyInstance) {
  // All admin routes require a valid JWT
  fastify.addHook('onRequest', fastify.authenticate)

  // GET /api/admin/users — list all users + stats
  fastify.get('/users', adminGetUsersHandler)

  // PATCH /api/admin/users/:id/toggle-active — suspend / activate
  fastify.patch('/users/:id/toggle-active', adminToggleActiveHandler)
}
