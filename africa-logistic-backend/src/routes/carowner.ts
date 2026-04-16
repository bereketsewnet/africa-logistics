import { FastifyInstance } from 'fastify'
import {
  coListVehiclesHandler,
  coRegisterVehicleHandler,
  coDeleteVehicleHandler,
  coGetVehicleHandler,
  adminListCarOwnerVehiclesHandler,
  adminReviewCarOwnerVehicleHandler,
  adminAssignDriverToCarOwnerVehicleHandler,
  adminListDriversForCarAssignHandler,
} from '../controllers/carowner.controller.js'

export default async function carOwnerRoutes(fastify: FastifyInstance) {

  // ── Car Owner routes (role 6) ───────────────────────────────────────────────
  fastify.register(async (co) => {
    co.addHook('onRequest', fastify.authenticate)
    co.addHook('onRequest', async (req, reply) => {
      const user = (req as any).user
      if (user.role_id !== 6) return reply.status(403).send({ success: false, message: 'Car owners only.' })
    })

    // GET  /api/car-owner/vehicles
    co.get('/api/car-owner/vehicles', coListVehiclesHandler)
    // GET  /api/car-owner/vehicles/:id
    co.get('/api/car-owner/vehicles/:id', coGetVehicleHandler)
    // POST /api/car-owner/vehicles
    co.post('/api/car-owner/vehicles', {
      schema: {
        body: {
          type: 'object',
          required: ['plate_number', 'vehicle_type'],
          properties: {
            plate_number:    { type: 'string', minLength: 2, maxLength: 30 },
            vehicle_type:    { type: 'string', minLength: 2, maxLength: 60 },
            model:           { type: 'string', maxLength: 100 },
            color:           { type: 'string', maxLength: 60 },
            year:            { type: 'number' },
            max_capacity_kg: { type: 'number' },
            description:     { type: 'string', maxLength: 500 },
          },
        },
      },
    }, coRegisterVehicleHandler)
    // DELETE /api/car-owner/vehicles/:id
    co.delete('/api/car-owner/vehicles/:id', coDeleteVehicleHandler)
  })

  // ── Admin car-owner management routes ──────────────────────────────────────
  fastify.register(async (adm) => {
    adm.addHook('onRequest', fastify.authenticate)
    adm.addHook('onRequest', async (req, reply) => {
      const user = (req as any).user
      if (![1, 4, 5].includes(user.role_id)) return reply.status(403).send({ success: false, message: 'Admin only.' })
    })

    // GET  /api/admin/car-owner-vehicles
    adm.get('/api/admin/car-owner-vehicles', adminListCarOwnerVehiclesHandler)
    // PATCH /api/admin/car-owner-vehicles/:id/review
    adm.patch('/api/admin/car-owner-vehicles/:id/review', {
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
    // PATCH /api/admin/car-owner-vehicles/:id/assign-driver
    adm.patch('/api/admin/car-owner-vehicles/:id/assign-driver', {
      schema: {
        body: {
          type: 'object',
          properties: {
            driver_id: { type: ['string', 'null'] },
          },
        },
      },
    }, adminAssignDriverToCarOwnerVehicleHandler)
    // GET  /api/admin/drivers-for-car-assign
    adm.get('/api/admin/drivers-for-car-assign', adminListDriversForCarAssignHandler)
  })
}
