/**
 * Company Portal Routes (src/routes/company.ts)
 *
 * Registered on the root app as `/api/company`, which makes it a SIBLING of the
 * `/api/admin` plugin, not a descendant. Fastify hooks are encapsulated, so the
 * admin RBAC hook and the admin PII-redaction hook never run here — the
 * `companies.manage` permission is irrelevant to this prefix.
 *
 * That cuts both ways and is worth stating plainly: there is no RBAC net and no
 * redaction net under this prefix. ALL authorization is the `resolveCompanyContext`
 * hook below plus per-query `company_id` scoping in every handler. The data a
 * company sees is its own by construction, not by filtering after the fact.
 */

import type { FastifyInstance } from 'fastify'
import {
  companyProfileHandler,
  companyDashboardHandler,
  companyListVehiclesHandler,
  companyCreateVehicleHandler,
  companyUpdateVehicleHandler,
  companyVehicleOperationalStatusHandler,
  companyDeleteVehicleHandler,
  companyEligibleDriversHandler,
  companyAssignDriverHandler,
  companyListDriversHandler,
  companyCreateDriverHandler,
  companyUpdateDriverHandler,
  companyRemoveDriverHandler,
} from '../controllers/company.controller.js'
import { getCompanyForUser } from '../services/company-portal.service.js'

export default async function companyRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', (fastify as any).authenticate)

  /**
   * Resolve which company is calling, from the session and nothing else.
   *
   * On `onRequest` rather than `preHandler` deliberately: body parsing happens
   * after onRequest, and these endpoints accept base64 image uploads. Rejecting
   * here means an individual car owner is turned away before the server reads a
   * multi-megabyte payload it was never going to use.
   *
   * Each refusal carries a machine-readable `code` so the frontend can route on
   * it instead of matching on prose.
   */
  fastify.addHook('onRequest', async (request, reply) => {
    const user = request.user as { id: string; role_id: number } | undefined
    if (!user) return

    if (user.role_id !== 6) {
      return reply.status(403).send({
        success: false,
        code: 'NOT_CAR_OWNER',
        message: 'This area is for transport companies.',
      })
    }

    const company = await getCompanyForUser(fastify.db, user.id)
    if (!company) {
      // Not an error state — this is an individual car owner, and the frontend
      // uses this exact code to send them to their own dashboard.
      return reply.status(403).send({
        success: false,
        code: 'INDIVIDUAL_CAR_OWNER',
        message: 'This account is an individual car owner, not a transport company.',
      })
    }

    // A suspended or rejected company keeps read access so it can see why, but
    // may not add or change anything.
    if (['SUSPENDED', 'REJECTED'].includes(company.status) && request.method !== 'GET') {
      return reply.status(403).send({
        success: false,
        code: 'COMPANY_SUSPENDED',
        message: `Your company account is ${company.status.toLowerCase()}. Contact Afri Logistics to restore it.`,
      })
    }

    ;(request as any).company = company
  })

  // ─── Profile ───────────────────────────────────────────────────────────────

  /** GET /api/company/profile — the company's own record plus fleet/roster counts */
  fastify.get('/profile', companyProfileHandler)

  /** GET /api/company/dashboard — overview counts plus what needs attention */
  fastify.get('/dashboard', companyDashboardHandler)

  // ─── Vehicles ──────────────────────────────────────────────────────────────

  /** GET /api/company/vehicles — paginated, searchable, filterable */
  fastify.get('/vehicles', companyListVehiclesHandler)

  /** POST /api/company/vehicles — created PENDING, awaiting admin approval */
  fastify.post('/vehicles', companyCreateVehicleHandler)

  /** GET /api/company/vehicles/:id/eligible-drivers — declared before /:id so
   *  the literal segment is not shadowed by the parametric route. */
  fastify.get('/vehicles/:id/eligible-drivers', companyEligibleDriversHandler)

  /** PATCH /api/company/vehicles/:id/operational-status — no approval needed */
  fastify.patch('/vehicles/:id/operational-status', companyVehicleOperationalStatusHandler)

  /** PATCH /api/company/vehicles/:id/assign-driver — own roster only */
  fastify.patch('/vehicles/:id/assign-driver', companyAssignDriverHandler)

  /** PATCH /api/company/vehicles/:id — identity edits fall back to PENDING */
  fastify.patch('/vehicles/:id', companyUpdateVehicleHandler)

  /** DELETE /api/company/vehicles/:id — only while still awaiting approval */
  fastify.delete('/vehicles/:id', companyDeleteVehicleHandler)

  // ─── Drivers ───────────────────────────────────────────────────────────────

  /** GET /api/company/drivers — the company's own roster */
  fastify.get('/drivers', companyListDriversHandler)

  /** POST /api/company/drivers — created unverified, login texted */
  fastify.post('/drivers', companyCreateDriverHandler)

  /** PATCH /api/company/drivers/:id — name and email only */
  fastify.patch('/drivers/:id', companyUpdateDriverHandler)

  /** DELETE /api/company/drivers/:id — detach from the roster, never delete */
  fastify.delete('/drivers/:id', companyRemoveDriverHandler)
}
