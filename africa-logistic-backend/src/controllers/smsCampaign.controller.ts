/**
 * SMS Campaigns (src/controllers/smsCampaign.controller.ts)
 *
 * The admin SMS screen: compose a message and send it to anyone — pasted
 * numbers, registered users found by name, or a whole group such as every
 * driver on a company's roster.
 *
 * Three things shape this file, all of them about spending real money:
 *
 *  1. **Nothing is sent until the caller has seen the cost.** `prepare` resolves
 *     groups to numbers, removes duplicates, flags what cannot be delivered and
 *     returns the credit cost. `send` then takes the resolved list. A group that
 *     silently grew between composing and sending would be a surprise bill.
 *
 *  2. **Sending is chunked by the caller.** The provider has no bulk endpoint, so
 *     a campaign is a loop of single sends, each up to ~17s worst case. One
 *     request for 400 recipients would outlive any timeout, so the frontend
 *     posts small chunks and draws the progress itself.
 *
 *  3. **Amharic costs more than twice as much.** One Ethiopic character forces
 *     the whole message to Unicode, cutting a segment from 160 characters to 70.
 *     Every count here comes from `estimateSegments` so the screen can warn
 *     before the send rather than after the bill.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { RowDataPacket } from 'mysql2'
import type { Pool } from 'mysql2/promise'
import { v4 as uuidv4 } from 'uuid'
import { estimateSegments, normaliseMsisdn } from '../services/sms.service.js'

/** One request's worth of sending: ~20 × up to 17s stays inside any timeout. */
const MAX_CHUNK = 20
/** A campaign bigger than this is almost certainly a mistake, not a decision. */
const MAX_RECIPIENTS = 1000
/** Two full GSM pages. Longer messages are usually a pasted document. */
const MAX_BODY = 480

type Group =
  | 'ALL_DRIVERS' | 'ALL_SHIPPERS' | 'ALL_CAR_OWNERS' | 'ALL_COMPANIES'
  | 'COMPANY_DRIVERS'

interface Recipient {
  phone: string            // E.164 as stored, e.g. +251911234567
  name?: string | null
  /** Set when this number cannot be delivered to; it is excluded from sending. */
  problem?: string
}

/**
 * Safaricom numbers normalise correctly but the provider refuses them outright
 * (error 10000: "must start with 2519"). Catching them here turns a wasted API
 * call and a confusing failure into a clear note before anything is sent.
 */
function deliverability(phone: string): string | undefined {
  const msisdn = normaliseMsisdn(phone)
  if (!msisdn) return 'Not a usable phone number.'
  if (!/^251[79]\d{8}$/.test(msisdn)) return 'Not a valid Ethiopian mobile number.'
  if (msisdn.startsWith('2517')) return 'Safaricom — this provider cannot deliver to 07 numbers.'
  return undefined
}

function denyCustomers(request: FastifyRequest, reply: FastifyReply): boolean {
  const caller = request.user as { role_id: number }
  if ([2, 3].includes(caller.role_id)) {
    reply.status(403).send({ success: false, message: 'Admin access required.' })
    return true
  }
  return false
}

// ─── Who can be written to ────────────────────────────────────────────────────

/**
 * GET /api/admin/sms/groups
 * The audiences that can be picked in one click, each with its live size.
 */
export async function adminSmsGroupsHandler(request: FastifyRequest, reply: FastifyReply) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db

  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT 'ALL_DRIVERS'    AS id, 'All drivers'      AS label, COUNT(*) AS n FROM users WHERE role_id = 3 AND is_active = 1
    UNION ALL SELECT 'ALL_SHIPPERS',   'All shippers',    COUNT(*) FROM users WHERE role_id = 2 AND is_active = 1
    UNION ALL SELECT 'ALL_CAR_OWNERS', 'All car owners',  COUNT(*) FROM users WHERE role_id = 6 AND is_active = 1
  `)

  const [companies] = await db.query<RowDataPacket[]>(`
    SELECT c.id, c.company_name,
           (SELECT COUNT(*) FROM driver_profiles dp WHERE dp.company_id = c.id) AS driver_count
      FROM car_owner_companies c
     ORDER BY c.company_name
  `)

  return reply.send({
    success: true,
    groups: rows.map(r => ({ id: r.id, label: r.label, count: Number(r.n) })),
    companies: companies.map(c => ({
      id: String(c.id), name: String(c.company_name), driver_count: Number(c.driver_count),
    })),
  })
}

/**
 * GET /api/admin/sms/recipients?search=
 * Find a registered person by name or number, to add them individually.
 */
export async function adminSmsSearchRecipientsHandler(
  request: FastifyRequest<{ Querystring: { search?: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const term = (request.query.search ?? '').trim()
  if (term.length < 2) return reply.send({ success: true, recipients: [] })

  const like = `%${term}%`
  const [rows] = await request.server.db.query<RowDataPacket[]>(
    `SELECT u.id, u.first_name, u.last_name, u.phone_number, u.role_id
       FROM users u
      WHERE u.is_active = 1
        AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone_number LIKE ?)
      ORDER BY u.first_name
      LIMIT 25`,
    [like, like, like]
  )

  const ROLE: Record<number, string> = { 1: 'Admin', 2: 'Shipper', 3: 'Driver', 4: 'Cashier', 5: 'Dispatcher', 6: 'Car owner' }
  return reply.send({
    success: true,
    recipients: rows.map(r => ({
      phone: String(r.phone_number),
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      role: ROLE[Number(r.role_id)] ?? 'User',
    })),
  })
}

/**
 * GET /api/admin/sms/recent-numbers
 * Numbers written to recently, newest first — so following up takes one click.
 */
export async function adminSmsRecentNumbersHandler(request: FastifyRequest, reply: FastifyReply) {
  if (denyCustomers(request, reply)) return
  const [rows] = await request.server.db.query<RowDataPacket[]>(`
    SELECT m.recipient, MAX(m.created_at) AS last_sent, COUNT(*) AS times,
           (SELECT CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))
              FROM users u
             WHERE u.phone_number = CONCAT('+', m.recipient) LIMIT 1) AS name
      FROM sms_messages m
     GROUP BY m.recipient
     ORDER BY last_sent DESC
     LIMIT 40
  `)
  return reply.send({
    success: true,
    numbers: rows.map(r => ({
      // Stored without the +, shown the way the rest of the app writes numbers.
      phone: `+${r.recipient}`,
      name: (r.name as string | null)?.trim() || null,
      last_sent: r.last_sent,
      times: Number(r.times),
    })),
  })
}

/**
 * GET /api/admin/sms/recent-messages
 * Past campaigns, ready to be reused or edited into a new one.
 */
export async function adminSmsRecentMessagesHandler(request: FastifyRequest, reply: FastifyReply) {
  if (denyCustomers(request, reply)) return
  const [rows] = await request.server.db.query<RowDataPacket[]>(`
    SELECT c.id, c.body, c.segments, c.is_unicode, c.recipient_count, c.sent_count,
           c.failed_count, c.created_at,
           CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS sent_by
      FROM sms_campaigns c
      LEFT JOIN users u ON u.id = c.created_by
     ORDER BY c.created_at DESC
     LIMIT 25
  `)
  return reply.send({
    success: true,
    messages: rows.map(r => ({
      id: String(r.id),
      body: String(r.body),
      segments: Number(r.segments),
      is_unicode: Boolean(r.is_unicode),
      recipient_count: Number(r.recipient_count),
      sent_count: Number(r.sent_count),
      failed_count: Number(r.failed_count),
      sent_by: (r.sent_by as string | null)?.trim() || null,
      created_at: r.created_at,
    })),
  })
}

// ─── Prepare: resolve, judge and price, without sending ───────────────────────

async function resolveGroup(db: Pool, group: Group, companyId?: string): Promise<Recipient[]> {
  const sql: Record<Group, string> = {
    ALL_DRIVERS:     `SELECT phone_number, first_name, last_name FROM users WHERE role_id = 3 AND is_active = 1`,
    ALL_SHIPPERS:    `SELECT phone_number, first_name, last_name FROM users WHERE role_id = 2 AND is_active = 1`,
    ALL_CAR_OWNERS:  `SELECT phone_number, first_name, last_name FROM users WHERE role_id = 6 AND is_active = 1`,
    ALL_COMPANIES:   `SELECT u.phone_number, u.first_name, u.last_name
                        FROM car_owner_companies c JOIN users u ON u.id = c.user_id WHERE u.is_active = 1`,
    COMPANY_DRIVERS: `SELECT u.phone_number, u.first_name, u.last_name
                        FROM driver_profiles dp JOIN users u ON u.id = dp.user_id
                       WHERE dp.company_id = ? AND u.is_active = 1`,
  }
  const [rows] = await db.query<RowDataPacket[]>(
    sql[group], group === 'COMPANY_DRIVERS' ? [companyId] : []
  )
  return rows.map(r => ({
    phone: String(r.phone_number),
    name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || null,
  }))
}

/**
 * POST /api/admin/sms/prepare
 *
 * Turns whatever the admin picked into a final, de-duplicated recipient list
 * with the exact credit cost. Writes nothing and sends nothing.
 */
export async function adminSmsPrepareHandler(
  request: FastifyRequest<{
    Body: { message?: string; numbers?: string[]; groups?: Array<{ group: Group; company_id?: string }> }
  }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db
  const body = request.body ?? {}
  const message = (body.message ?? '').trim()

  if (!message) return reply.status(400).send({ success: false, message: 'Write a message first.' })
  if (message.length > MAX_BODY) {
    return reply.status(400).send({
      success: false,
      message: `That message is ${message.length} characters. Keep it under ${MAX_BODY}.`,
    })
  }

  const collected: Recipient[] = []
  for (const raw of body.numbers ?? []) {
    const trimmed = String(raw).trim()
    if (trimmed) collected.push({ phone: trimmed })
  }
  for (const g of body.groups ?? []) {
    if (!g?.group) continue
    collected.push(...await resolveGroup(db, g.group, g.company_id))
  }

  // De-duplicate on the canonical form, so "0911…", "+251911…" and the same
  // person arriving from two groups are charged for once.
  const seen = new Map<string, Recipient>()
  for (const r of collected) {
    const key = normaliseMsisdn(r.phone) ?? r.phone
    const problem = deliverability(r.phone)
    const existing = seen.get(key)
    if (existing) {
      // Keep whichever copy carries a name.
      if (!existing.name && r.name) existing.name = r.name
      continue
    }
    seen.set(key, { phone: r.phone, name: r.name ?? null, problem })
  }

  const all = [...seen.values()]
  const sendable = all.filter(r => !r.problem)
  const blocked = all.filter(r => r.problem)

  if (all.length > MAX_RECIPIENTS) {
    return reply.status(400).send({
      success: false,
      message: `That is ${all.length} recipients. Send to at most ${MAX_RECIPIENTS} at a time.`,
    })
  }

  const { segments, unicode } = estimateSegments(message)
  return reply.send({
    success: true,
    message_preview: message,
    segments,
    is_unicode: unicode,
    total: all.length,
    sendable: sendable.length,
    blocked: blocked.length,
    credits: segments * sendable.length,
    recipients: sendable,
    problems: blocked,
    // Said plainly because it is the single most expensive thing to get wrong.
    unicode_note: unicode
      ? 'This message contains Amharic or a symbol outside the GSM set, so each segment holds 70 characters instead of 160. It costs more than double a plain English message.'
      : null,
  })
}

// ─── Send ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/sms/send
 *
 * Sends one chunk. The first call omits `campaign_id` and gets one back; every
 * later chunk passes it so the whole run is recorded as a single campaign.
 */
export async function adminSmsSendHandler(
  request: FastifyRequest<{
    Body: { message?: string; recipients?: Array<{ phone: string; name?: string | null }>; campaign_id?: string }
  }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const caller = request.user as { id: string }
  const db = request.server.db
  const body = request.body ?? {}
  const message = (body.message ?? '').trim()
  const recipients = Array.isArray(body.recipients) ? body.recipients : []

  if (!message) return reply.status(400).send({ success: false, message: 'Write a message first.' })
  if (recipients.length === 0) return reply.status(400).send({ success: false, message: 'No recipients in this batch.' })
  if (recipients.length > MAX_CHUNK) {
    return reply.status(400).send({ success: false, message: `Send at most ${MAX_CHUNK} recipients per request.` })
  }

  const { consumeWindowLimit } = await import('../utils/securityRateLimit.js')
  // 60 chunks in 10 minutes covers one full 1,000-recipient campaign and no more.
  const gate = consumeWindowLimit(`sms:send:${caller.id}`, 60, 600_000)
  if (!gate.allowed) {
    return reply.status(429).send({ success: false, message: `Too many sends. Try again in ${gate.retryAfterSeconds}s.` })
  }

  const { segments, unicode } = estimateSegments(message)

  // One campaign row per run, created with the first chunk.
  let campaignId = body.campaign_id
  if (!campaignId) {
    campaignId = uuidv4()
    await db.query(
      `INSERT INTO sms_campaigns (id, body, segments, is_unicode, created_by) VALUES (?, ?, ?, ?, ?)`,
      [campaignId, message, segments, unicode ? 1 : 0, caller.id]
    )
  }

  const { sendSms } = await import('../services/sms.service.js')
  const results: Array<{ phone: string; name?: string | null; sent: boolean; error?: string }> = []

  for (const r of recipients) {
    const problem = deliverability(r.phone)
    if (problem) {
      results.push({ phone: r.phone, name: r.name ?? null, sent: false, error: problem })
      continue
    }
    // Never throws, so one bad recipient cannot abandon the rest of the chunk.
    const sms = await sendSms(db, r.phone, message, 'CAMPAIGN', campaignId)
    results.push({ phone: r.phone, name: r.name ?? null, sent: sms.ok, error: sms.ok ? undefined : sms.error })
  }

  const sent = results.filter(r => r.sent).length
  const failed = results.length - sent
  await db.query(
    `UPDATE sms_campaigns
        SET recipient_count = recipient_count + ?, sent_count = sent_count + ?, failed_count = failed_count + ?
      WHERE id = ?`,
    [results.length, sent, failed, campaignId]
  )

  return reply.send({ success: true, campaign_id: campaignId, sent, failed, results })
}

/**
 * GET /api/admin/sms/history
 * Every message the platform has sent, newest first — campaigns and automatic
 * messages alike. Bodies are shown only for campaigns; the rest never stored one.
 */
export async function adminSmsHistoryHandler(
  request: FastifyRequest<{ Querystring: { page?: string; limit?: string; purpose?: string } }>,
  reply: FastifyReply
) {
  if (denyCustomers(request, reply)) return
  const db = request.server.db
  const { parsePagination, buildPaginationMeta } = await import('../utils/pagination.js')
  const { page, limit, offset } = parsePagination(request.query)

  const where: string[] = []
  const params: unknown[] = []
  if (request.query.purpose?.trim()) { where.push('m.purpose = ?'); params.push(request.query.purpose.trim()) }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const [[countRow]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM sms_messages m ${clause}`, params
  )
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT m.id, m.recipient, m.purpose, m.segments, m.status, m.error_message,
            m.created_at, c.body
       FROM sms_messages m
       LEFT JOIN sms_campaigns c ON c.id = m.campaign_id
       ${clause}
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )

  return reply.send({
    success: true,
    messages: rows.map(r => ({
      id: String(r.id),
      phone: `+${r.recipient}`,
      purpose: String(r.purpose),
      segments: Number(r.segments),
      status: String(r.status),
      error: r.error_message ?? null,
      body: (r.body as string | null) ?? null,
      created_at: r.created_at,
    })),
    pagination: buildPaginationMeta(Number(countRow?.total ?? 0), page, limit),
  })
}
