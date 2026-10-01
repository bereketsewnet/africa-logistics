import { FastifyInstance } from 'fastify'
import {
  coListVehiclesHandler,
  coRegisterVehicleHandler,
  coUpdateOperationalStatusHandler,
  coDeleteVehicleHandler,
  coGetVehicleHandler,
  coListEligibleDriversHandler,
  coAssignDriverHandler,
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
            // Optional base64 uploads. Size and mime are enforced in the
            // handler, which gives a readable message instead of a schema dump.
            vehicle_photo:   { type: 'string' },
            libre_file:      { type: 'string' },
            vehicle_images:  { type: 'array', items: { type: 'string' }, maxItems: 5 },
          },
        },
      },
    }, coRegisterVehicleHandler)

    // PATCH /api/car-owner/vehicles/:id/operational-status
    co.patch('/api/car-owner/vehicles/:id/operational-status', {
      schema: {
        body: {
          type: 'object',
          required: ['operational_status'],
          properties: {
            operational_status: {
              type: 'string',
              enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE'],
            },
            note: { type: 'string', maxLength: 500 },
          },
        },
      },
    }, coUpdateOperationalStatusHandler)
    // DELETE /api/car-owner/vehicles/:id
    co.delete('/api/car-owner/vehicles/:id', coDeleteVehicleHandler)
    // GET /api/car-owner/vehicles/:id/eligible-drivers — approved vehicle only
    co.get('/api/car-owner/vehicles/:id/eligible-drivers', coListEligibleDriversHandler)
    // PATCH /api/car-owner/vehicles/:id/assign-driver — owner assignment
    co.patch('/api/car-owner/vehicles/:id/assign-driver', {
      schema: {
        body: {
          type: 'object',
          required: ['driver_id'],
          properties: {
            driver_id: { type: ['string', 'null'] },
          },
        },
      },
    }, coAssignDriverHandler)
  })

  // The admin car-owner routes used to live here, in a sibling plugin to
  // /api/admin. That meant they inherited neither the RBAC permission hook nor the
  // PII hook, and were gated only by a hardcoded [1,4,5] role check — so any staff
  // account could approve a vehicle or assign a driver. They now live in
  // routes/admin.ts, which is what makes a permission mean anything.
}
