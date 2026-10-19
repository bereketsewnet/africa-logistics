/**
 * Company Import Controller (src/controllers/companyImport.controller.ts)
 *
 * Bulk registration of a company's fleet and crews from a spreadsheet.
 *
 * The flow is deliberately four requests, not one:
 *
 *   template  -> download a branded pack to fill in
 *   preview   -> parse and judge the file, write nothing, report every problem
 *   commit    -> write ONE CHUNK of already-validated rows
 *   send-sms  -> text ONE CHUNK of drivers their login
 *
 * Chunking is not over-engineering, it is arithmetic. bcrypt at cost 12 measures
 * 296 ms on this server, so 400 drivers is ~2 minutes of CPU; and a single SMS
 * can take 17 seconds worst case, so 400 of them could run for an hour. Both
 * would be a single request that the browser, Caddy or the admin's patience
 * kills halfway, with no way to tell what was already done. Chunks give a real
 * progress bar, and let a failure be retried on its own.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { RowDataPacket } from 'mysql2'
import type { Pool } from 'mysql2/promise'
import { parseWorkbook, validateRows, type PreparedRow } from '../services/company-import.service.js'
import { commitImportRows, type ImportedDriver } from '../services/company-import-commit.service.js'
import { buildImportTemplatePack, buildCredentialsWorkbook } from '../services/import-template.service.js'

/** A real 400-row sheet is ~40 KB; anything near this is not the intended file. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 1000

/** Staff roles 2 and 3 are customers and never belong in the admin portal. */
function denyCustomers(request: FastifyRequest, reply: FastifyReply): boolean {
  const caller = request.user as { role_id: number }
  if ([2, 3].includes(caller.role_id)) {
    reply.status(403).send({ success: false, message: 'Admin access required.' })
    return true
  }
  return false
}

async function listVehicleTypes(db: Pool): Promise<string[]> {
  const [rows] = await db.query<RowDataPacket[]>('SELECT name FROM vehicle_types ORDER BY name')
  return rows.map((r: RowDataPacket) => String(r.name))
}

async function findCompany(db: Pool, id: string) {
  const [[row]] = await db.query<RowDataPacket[]>(
    'SELECT id, company_name FROM car_owner_companies WHERE id = ? LIMIT 1', [id]
  )
  return row ?? null
}

// ─── Template pack ────────────────────────────────────────────────────────────

/**
 * GET /api/admin/companies/import/template
 * The ZIP of instructions and three sample sheets.
 */
export async function adminImportTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  if (denyCustomers(request, reply)) return
  const types = await listVehicleTypes(request.server.db)
  const zip = await buildImportTemplatePack(types)

  return reply
    .header('Content-Type', 'application/zip')
    .header('Content-Disposition', 'attachment; filename="afri-logistics-import-templates.zip"')
    .send(zip)
}

// ─── Preview ──────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/companies/:id/import/preview
 * Parses and judges the workbook. Writes nothing.
 */
export async function adminImportPreviewHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { file: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db

  const company = await findCompany(db, request.params.id)
  if (!company) return reply.status(404).send({ success: false, message: 'Company not found.' })

  // Parsing an uploaded file is the attack surface here, and an .xlsx IS a zip,
  // so cap it well below the 50 MB body limit. A real 400-row sheet is ~40 KB.
  const { consumeWindowLimit } = await import('../utils/securityRateLimit.js')
  const gate = consumeWindowLimit(`import:preview:${(request.user as { id: string }).id}`, 10, 60_000)
  if (!gate.allowed) {
    return reply.status(429).send({ success: false, message: `Too many uploads. Try again in ${gate.retryAfterSeconds}s.` })
  }

  const raw = request.body?.file
  if (!raw) return reply.status(400).send({ success: false, message: 'No file was uploaded.' })

  // The upload arrives as a data URI, matching how every other file reaches this
  // API. Only the base64 payload is wanted.
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

    const types = await listVehicleTypes(db)
    const preview = await validateRows(db, rows, types)

    return reply.send({ success: true, company_name: company.company_name, ...preview })
  } catch (err: any) {
    request.server.log.error({ err }, 'Import preview failed')
    return reply.status(400).send({
      success: false,
      message: err?.message ?? 'That file could not be read as a spreadsheet. Use the template pack.',
    })
  }
}

// ─── Commit ───────────────────────────────────────────────────────────────────

const MAX_CHUNK = 50

export type { ImportedDriver }

/**
 * POST /api/admin/companies/:id/import/commit
 *
 * Writes one chunk of rows that the preview already normalised. Every chunk is
 * re-validated here before anything is written — the rows come back from the
 * admin's browser, and uniqueness must never depend on the client. Another admin
 * may also have taken a plate since the preview ran.
 */
export async function adminImportCommitHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { rows: PreparedRow[] } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const caller = request.user as { id: string }
  const db = request.server.db

  const company = await findCompany(db, request.params.id)
  if (!company) return reply.status(404).send({ success: false, message: 'Company not found.' })

  const rows = Array.isArray(request.body?.rows) ? request.body.rows : []
  if (rows.length === 0) return reply.status(400).send({ success: false, message: 'No rows to import.' })
  if (rows.length > MAX_CHUNK) {
    return reply.status(400).send({ success: false, message: `Send at most ${MAX_CHUNK} rows per request.` })
  }

  try {
    const result = await commitImportRows(db, {
      companyId: String(company.id),
      actorId: caller.id,
      rows,
      validVehicleTypes: await listVehicleTypes(db),
      // An admin entering the roster is the approval, exactly as the
      // single-vehicle admin form already treats it.
      autoApprove: true,
    })
    return reply.send({ success: true, ...result })
  } catch (err) {
    request.server.log.error({ err }, 'Import commit chunk failed')
    return reply.status(500).send({
      success: false,
      message: 'This batch could not be saved and was rolled back. Nothing in it was written — you can retry it.',
    })
  }
}

// ─── Welcome SMS ──────────────────────────────────────────────────────────────

const SMS_CHUNK = 10

/**
 * The bulk welcome text.
 *
 * Longer than the single-driver message on purpose — the owner asked for the
 * explicit security wording — which costs two GSM segments per driver rather
 * than one. The support number comes from the contact details already managed in
 * Settings rather than being hardcoded here.
 */
export function buildBulkWelcomeSms(password: string, supportPhone: string | null): string {
  const help = supportPhone ? ` Help: ${supportPhone}` : ''
  return `Welcome to Afri Logistics! Your one-time login password is ${password}. `
    + 'You must change this password immediately upon first login. '
    + `Afri Logistics will never ask you to share this code. Login: afri-logistics.com${help}`
}

/**
 * POST /api/admin/companies/:id/import/send-sms
 *
 * Texts one chunk of drivers their login.
 *
 * Each driver's password is ROTATED here rather than reused. The password from
 * the import is bcrypt-hashed and unreadable by the time this runs, so the only
 * honest options were to store plaintext (no) or issue a fresh one (this) — the
 * same mechanism "Resend login" already uses. The new password comes back so the
 * caller can keep its credentials file accurate.
 */
export async function adminImportSendSmsHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: { driver_ids: string[] } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db

  const company = await findCompany(db, request.params.id)
  if (!company) return reply.status(404).send({ success: false, message: 'Company not found.' })

  const ids = Array.isArray(request.body?.driver_ids) ? request.body.driver_ids : []
  if (ids.length === 0) return reply.status(400).send({ success: false, message: 'No drivers given.' })
  if (ids.length > SMS_CHUNK) {
    return reply.status(400).send({ success: false, message: `Send at most ${SMS_CHUNK} drivers per request.` })
  }

  const marks = ids.map(() => '?').join(',')
  const [drivers] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.first_name, u.last_name, u.phone_number
       FROM users u JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.id IN (${marks}) AND u.role_id = 3 AND dp.company_id = ?`,
    [...ids, company.id]
  )

  // The support number travels with whatever is configured in Settings.
  const [[contact]] = await db.query<RowDataPacket[]>('SELECT phone1 FROM company_contact LIMIT 1')
  const supportPhone = contact?.phone1 ? String(contact.phone1) : null

  const bcrypt = (await import('bcrypt')).default
  const { generateCredentialPassword } = await import('./admin.controller.js')
  const { sendSms } = await import('../services/sms.service.js')

  const results: Array<{
    id: string; name: string; phone_number: string
    password: string; sent: boolean; error?: string
  }> = []

  for (const d of drivers) {
    const password = generateCredentialPassword()
    const name = `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim()
    try {
      await db.query('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?',
        [await bcrypt.hash(password, 12), d.id])
    } catch (err) {
      request.server.log.error({ err, driver: d.id }, 'Could not rotate password during bulk send')
      results.push({ id: String(d.id), name, phone_number: String(d.phone_number), password: '', sent: false, error: 'Could not set a new password.' })
      continue
    }

    // sendSms never throws; a failed text must not undo the rotation.
    const sms = await sendSms(db, String(d.phone_number), buildBulkWelcomeSms(password, supportPhone), 'DRIVER_WELCOME')
    results.push({
      id: String(d.id), name, phone_number: String(d.phone_number),
      password, sent: sms.ok, error: sms.ok ? undefined : sms.error,
    })
  }

  return reply.send({
    success: true,
    sent: results.filter(r => r.sent).length,
    failed: results.filter(r => !r.sent).length,
    results,
  })
}

// ─── Credentials workbook ─────────────────────────────────────────────────────

/**
 * POST /api/admin/companies/:id/import/credentials
 *
 * Turns the caller's credential list into a spreadsheet. The passwords come from
 * the caller because the server has no readable copy — it never stores them.
 */
export async function adminImportCredentialsHandler(
  request: FastifyRequest<{
    Params: { id: string }
    Body: { rows: Array<{ name: string; phone_number: string; password: string; plate_number?: string | null; sms_sent?: boolean }> }
  }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return

  const company = await findCompany(request.server.db, request.params.id)
  if (!company) return reply.status(404).send({ success: false, message: 'Company not found.' })

  const rows = Array.isArray(request.body?.rows) ? request.body.rows : []
  if (rows.length === 0) return reply.status(400).send({ success: false, message: 'No credentials to export.' })

  const xlsx = await buildCredentialsWorkbook(String(company.company_name), rows)
  const safeName = String(company.company_name).replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()

  return reply
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename="${safeName}-driver-logins.xlsx"`)
    .send(xlsx)
}
