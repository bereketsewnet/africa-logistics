/**
 * Public download routes.
 *
 * This template contains examples and public vehicle-type names only. It is
 * deliberately not protected by a JWT: a native WebView cannot attach the app's
 * Authorization header when it delegates a download to Android's download
 * manager. A normal HTTPS attachment is therefore both safer and more reliable
 * than exposing a session token in a download URL.
 */

import type { FastifyInstance } from 'fastify'
import type { RowDataPacket } from 'mysql2'
import { buildImportTemplatePack } from '../services/import-template.service.js'

const TEMPLATE_CACHE_MS = 5 * 60 * 1000
let cachedPack: { vehicleTypesKey: string; createdAt: number; zip: Buffer } | null = null

async function getTemplatePack(fastify: FastifyInstance): Promise<Buffer> {
  const [rows] = await fastify.db.query<RowDataPacket[]>(
    'SELECT name FROM vehicle_types ORDER BY name'
  )
  const vehicleTypes = rows.map(row => String(row.name))
  const vehicleTypesKey = JSON.stringify(vehicleTypes)
  const now = Date.now()

  if (
    cachedPack
    && cachedPack.vehicleTypesKey === vehicleTypesKey
    && now - cachedPack.createdAt < TEMPLATE_CACHE_MS
  ) {
    return cachedPack.zip
  }

  const zip = await buildImportTemplatePack(vehicleTypes)
  cachedPack = { vehicleTypesKey, createdAt: now, zip }
  return zip
}

export default async function publicDownloadRoutes(fastify: FastifyInstance) {
  /**
   * A real attachment URL instead of a JavaScript `blob:` URL. Android WebView
   * and in-app browsers can give this URL to their native download manager.
   */
  fastify.get('/api/downloads/company-import-templates.zip', async (_request, reply) => {
    try {
      const zip = await getTemplatePack(fastify)
      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', 'attachment; filename="afri-logistics-import-templates.zip"')
        .header('Content-Length', String(zip.length))
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'public, max-age=300')
        .send(zip)
    } catch (err) {
      fastify.log.error({ err }, 'Could not build public company-import template pack')
      return reply.status(500).send({ success: false, message: 'Could not prepare the template pack. Please try again.' })
    }
  })
}
