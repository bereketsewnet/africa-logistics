/**
 * TypeScript Type Declarations (src/types/fastify.d.ts)
 *
 * This file extends Fastify's built-in TypeScript interfaces so that
 * TypeScript knows our custom properties exist on the fastify instance.
 *
 * Without this file, writing `fastify.db` or `fastify.authenticate`
 * would cause TypeScript compile errors.
 */

import { Pool } from 'mysql2/promise'

// Extend the FastifyInstance interface to include our custom decorations
declare module 'fastify' {
  interface FastifyInstance {
    /** The MySQL connection pool, attached by src/plugins/db.ts */
    db: Pool

    /**
     * JWT authentication hook, attached by @fastify/jwt.
     * Used as: { onRequest: [fastify.authenticate] } on protected routes.
     */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }

  /** Shape of the JWT payload decoded from the token */
  interface FastifyJWT {
    payload: {
      id: string
      phone_number: string
      role_id: number
    }
    user: {
      id: string
      phone_number: string
      role_id: number
    }
  }
}
