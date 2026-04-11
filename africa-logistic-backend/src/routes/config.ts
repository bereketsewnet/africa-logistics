/**
 * Public Config Routes — no authentication required.
 * Consumed by every frontend client on load.
 */
import { FastifyInstance } from 'fastify'

export default async function configRoutes(fastify: FastifyInstance) {
  // ─── GET /api/config/vehicle-types ─────────────────────────────────────────
  // Returns all active vehicle types for dropdowns.
  fastify.get('/vehicle-types', async (_request, reply) => {
    const [rows] = await fastify.db.query<any[]>(
      'SELECT id, name, max_capacity_kg, icon, icon_url FROM vehicle_types WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
    )
    return reply.send({ success: true, vehicle_types: rows })
  })

  // ─── GET /api/config/countries ──────────────────────────────────────────────
  // Returns active countries for map filtering and order validation.
  fastify.get('/countries', async (_request, reply) => {
    const [rows] = await fastify.db.query<any[]>(
      'SELECT id, name, iso_code FROM countries WHERE is_active = 1 ORDER BY name ASC'
    )
    return reply.send({ success: true, countries: rows })
  })

  // ─── GET /api/config/maintenance ────────────────────────────────────────────
  // Returns maintenance mode status. Checked by all clients on startup.
  fastify.get('/maintenance', async (_request, reply) => {
    const [rows] = await fastify.db.query<any[]>(
      "SELECT config_key, config_value FROM system_config WHERE config_key IN ('maintenance_mode','maintenance_message','app_version')"
    )
    const map: Record<string, string> = {}
    for (const r of rows) map[r.config_key] = r.config_value ?? ''
    return reply.send({
      success: true,
      maintenance_mode: map['maintenance_mode'] === '1',
      maintenance_message: map['maintenance_message'] ?? 'System is under maintenance.',
      app_version: map['app_version'] ?? '1.0.0',
    })
  })
}
