/**
 * Company Portal Import (src/controllers/companyPortalImport.controller.ts)
 *
 * The company's own bulk import. Same spreadsheet, same parser and same commit
 * service the admin screens use — three differences, all deliberate:
 *
 *  1. **The company is taken from the session, never the request.** There is no
 *     `:id` in any of these paths. A company cannot name which company it is
 *     importing into, so there is nothing to tamper with.
 *
 *  2. **Nothing arrives approved.** Vehicles land PENDING and drivers unverified,
 *     flagged `created_by_company`, and an admin reviews them before they can
 *     carry cargo. That is the Phase 2 rule applied to bulk.
 *
 *  3. **No SMS.** Texting 400 drivers spends Afri Logistics' SMS credits, so that
 *     button stays on the admin side. The company gets the credentials
 *     spreadsheet and hands passwords to its own drivers.
 *
 * Rate limits matter more here than on the admin side. A commit chunk is about
 * seven seconds of password hashing, and this endpoint is reachable by an
 * external party on a two-core box shared with unrelated production services.
 * The limits below bound one honest 1,000-row import while refusing a loop.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { RowDataPacket } from 'mysql2'
import type { Pool } from 'mysql2/promise'
import { parseWorkbook, validateRows, type PreparedRow } from '../services/company-import.service.js'
import { commitImportRows } from '../services/company-import-commit.service.js'
import { buildImportTemplatePack, buildCredentialsWorkbook } from '../services/import-template.service.js'

/** A real 400-row sheet is ~40 KB; anything near this is not the intended file. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 1000
const MAX_CHUNK = 50

/** Ten uploads a minute is generous for a human choosing a file. */
const PREVIEW_LIMIT = { count: 10, windowMs: 60_000 }
/**
 * 50 chunks per ten minutes — one complete 1,000-row import at the 25-row chunk
 * size the frontend uses, and no more. Enough headroom to retry a failed chunk.
 */
const COMMIT_LIMIT = { count: 50, windowMs: 600_000 }

interface CompanyCtx { id: string; company_name: string; status: string }

/** Set by the `resolveCompanyContext` hook in routes/company.ts. */
function ctx(request: FastifyRequest): CompanyCtx {
  return (request as any).company as CompanyCtx
}

async function listVehicleTypes(db: Pool): Promise<string[]> {
  const [rows] = await db.query<RowDataPacket[]>('SELECT name FROM vehicle_types ORDER BY name')
  return rows.map((r: RowDataPacket) => String(r.name))
}

async function gate(
  request: FastifyRequest, reply: FastifyReply,
  key: string, limit: { count: number; windowMs: number }
): Promise<boolean> {
  const { consumeWindowLimit } = await import('../utils/securityRateLimit.js')
  const g = consumeWindowLimit(`${key}:${ctx(request).id}`, limit.count, limit.windowMs)
  if (!g.allowed) {
    reply.status(429).send({
      success: false,
      message: `Too many import requests. Try again in ${g.retryAfterSeconds}s.`,
    })
    return true
  }
  return false
}

// ─── Template pack ────────────────────────────────────────────────────────────

/**
 * GET /api/company/import/template
 * The same three sheets, with instructions written for a company: it submits for
 * review rather than entering approved data.
 */
export async function companyImportTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const types = await listVehicleTypes(request.server.db)
  const zip = await buildImportTemplatePack(types, true)

  return reply
    .header('Content-Type', 'application/zip')
    .header('Content-Disposition', 'attachment; filename="afri-logistics-import-templates.zip"')
    .send(zip)
}

// ─── Preview ──────────────────────────────────────────────────────────────────

/**
 * POST /api/company/import/preview
 * Parses and judges the workbook. Writes nothing.
 */
export async function companyImportPreviewHandler(
  request: FastifyRequest<{ Body: { file: string } }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)

  if (await gate(request, reply, 'cimport:preview', PREVIEW_LIMIT)) return

  const raw = request.body?.file
  if (!raw) return reply.status(400).send({ success: false, message: 'No file was uploaded.' })

  const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw
  let buffer: Buffer
  try {
    buffer = Buffer.from(base64, 'base64')
  } catch {
    return reply.status(400).send({ success: false, message: 'That file could not be read.' })
  }
  if (buffer.length === 0) {
    return reply.status(400).send({ success: false, message: 'That file is empty.' })
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return reply.status(400).send({
      success: false,
      message: `That file is ${(buffer.length / 1024 / 1024).toFixed(1)} MB. A spreadsheet of a few hundred rows should be well under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB — this looks like the wrong file.`,
    })
  }

  try {
    const { rows } = await parseWorkbook(buffer)
    if (rows.length > MAX_ROWS) {
      return reply.status(400).send({
        success: false,
        message: `That sheet has ${rows.length} rows. Import at most ${MAX_ROWS} at a time — split the file.`,
      })
    }
    if (rows.length === 0) {
      return reply.status(400).send({ success: false, message: 'No data rows found. Did you delete the example rows and leave the sheet empty?' })
    }

    const preview = await validateRows(db, rows, await listVehicleTypes(db))
    return reply.send({ success: true, company_name: company.company_name, ...preview })
  } catch (err: any) {
    request.server.log.error({ err }, 'Company import preview failed')
    return reply.status(400).send({
      success: false,
      message: err?.message ?? 'That file could not be read as a spreadsheet. Use the template pack.',
    })
  }
}

// ─── Commit ───────────────────────────────────────────────────────────────────

/**
 * POST /api/company/import/commit
 *
 * Writes one chunk, PENDING and unverified. The rows come back from the
 * company's own browser, so the commit service re-validates every one against
 * the database before writing — plate and phone uniqueness can never rest on
 * what a client sent back.
 */
export async function companyImportCommitHandler(
  request: FastifyRequest<{ Body: { rows: PreparedRow[] } }>,
  reply: FastifyReply
) {
  const db = request.server.db
  const company = ctx(request)

  const rows = Array.isArray(request.body?.rows) ? request.body.rows : []
  if (rows.length === 0) return reply.status(400).send({ success: false, message: 'No rows to import.' })
  if (rows.length > MAX_CHUNK) {
    return reply.status(400).send({ success: false, message: `Send at most ${MAX_CHUNK} rows per request.` })
  }

  if (await gate(request, reply, 'cimport:commit', COMMIT_LIMIT)) return

  try {
    const result = await commitImportRows(db, {
      companyId: company.id,
      // No admin acted here, so no reviewer is recorded. Writing the company's
      // own user id into reviewed_by would be a false audit trail.
      actorId: null,
      rows,
      validVehicleTypes: await listVehicleTypes(db),
      autoApprove: false,
    })

    return reply.send({
      success: true,
      ...result,
      needs_approval: true,
      message: 'Saved. Afri Logistics will review these before they can carry cargo.',
    })
  } catch (err) {
    request.server.log.error({ err }, 'Company import commit chunk failed')
    return reply.status(500).send({
      success: false,
      message: 'This batch could not be saved and was rolled back. Nothing in it was written — you can retry it.',
    })
  }
}

// ─── Credentials workbook ─────────────────────────────────────────────────────

/**
 * POST /api/company/import/credentials
 *
 * The passwords come from the caller because the server has no readable copy —
 * it never stores one. With no SMS on this side, this file is the only way the
 * company's drivers ever learn their password.
 */
export async function companyImportCredentialsHandler(
  request: FastifyRequest<{
    Body: { rows: Array<{ name: string; phone_number: string; password: string; plate_number?: string | null; sms_sent?: boolean }> }
  }>,
  reply: FastifyReply
) {
  const company = ctx(request)
  const rows = Array.isArray(request.body?.rows) ? request.body.rows : []
  if (rows.length === 0) return reply.status(400).send({ success: false, message: 'No credentials to export.' })

  const xlsx = await buildCredentialsWorkbook(company.company_name, rows)
  const safeName = company.company_name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()

  return reply
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename="${safeName}-driver-logins.xlsx"`)
    .send(xlsx)
}
