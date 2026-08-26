/**
 * Public Config Routes — no authentication required.
 * Consumed by every frontend client on load.
 */
import { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'
import { consumeWindowLimit } from '../utils/securityRateLimit'
import { notifyAdminsOfEvent } from '../services/push.service'
import { sendEmail } from '../services/email.service'

// Public contact defaults supplied by the company. Database values take
// precedence whenever they are configured by a super-admin.
const COMPANY_CONTACT_DEFAULTS = {
  email1: 'info@afri-logistics.com',
  tiktok_url: 'https://tiktok.com/@afrilogistics2',
  facebook_url: 'https://www.facebook.com/share/18uywoV22c/',
  whatsapp_url: 'https://wa.me/message/A7WFYICJ2T5KH1',
  telegram_url: 'https://t.me/AfriLogisticsOfficial',
}

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

  // ─── GET /api/config/contact-info ────────────────────────────────────────────
  // Returns company contact info for the Help & Support page.
  fastify.get('/contact-info', async (_request, reply) => {
    const [rows] = await fastify.db.query<any[]>(
      'SELECT phone1, phone2, email1, email2, po_box, youtube_url, tiktok_url, facebook_url, instagram_url, x_url, linkedin_url, whatsapp_number, whatsapp_url, telegram_url FROM company_contact WHERE id = 1 LIMIT 1'
    )
    const contact: Record<string, unknown> = { ...COMPANY_CONTACT_DEFAULTS, ...(rows[0] ?? {}) }
    const defaults: Record<string, string> = COMPANY_CONTACT_DEFAULTS
    for (const key of Object.keys(contact)) {
      if (contact[key] == null || contact[key] === '') contact[key] = defaults[key] ?? contact[key]
    }
    return reply.send({ success: true, contact })
  })

  // ─── POST /api/config/contact-message ───────────────────────────────────────
  // Public marketing contact form. Stores the submission and alerts admins.
  fastify.post('/contact-message', async (request, reply) => {
    const body = (request.body ?? {}) as {
      name?: string; email?: string; phone?: string; request?: string
    }

    // Throttle: max 5 submissions per IP per 10 minutes.
    const limit = consumeWindowLimit(`contact:ip:${request.ip}`, 5, 10 * 60 * 1000)
    if (!limit.allowed) {
      return reply
        .status(429)
        .header('Retry-After', String(limit.retryAfterSeconds))
        .send({ success: false, message: 'Too many requests. Please try again later.' })
    }

    const name = (body.name ?? '').trim()
    const email = (body.email ?? '').trim()
    const phone = (body.phone ?? '').trim()
    const message = (body.request ?? '').trim()

    if (!name || !email || !phone) {
      return reply.status(400).send({ success: false, message: 'Name, email and phone are required.' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send({ success: false, message: 'Please provide a valid email address.' })
    }
    if (name.length > 120 || email.length > 160 || phone.length > 40 || message.length > 4000) {
      return reply.status(400).send({ success: false, message: 'One or more fields are too long.' })
    }

    const id = randomUUID()
    await fastify.db.query(
      'INSERT INTO contact_submissions (id, name, email, phone, message, ip) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, email, phone, message || null, request.ip ?? null]
    )

    // Notify admins (push + email, gated by their notification settings). Best-effort.
    try {
      await notifyAdminsOfEvent(
        fastify.db,
        'New contact enquiry',
        `${name} (${email}, ${phone})${message ? ` — ${message.slice(0, 120)}` : ''}`,
        '/admin'
      )
    } catch (err) {
      fastify.log.error({ err }, 'contact-message: admin notify failed')
    }

    // Also forward to the company inbox if one is configured. Best-effort.
    try {
      const [rows] = await fastify.db.query<any[]>(
        'SELECT email1 FROM company_contact WHERE id = 1 LIMIT 1'
      )
      const to = rows?.[0]?.email1 || COMPANY_CONTACT_DEFAULTS.email1
      if (to) {
        await sendEmail({
          to,
          subject: `New contact enquiry from ${name}`,
          text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nRequest:\n${message || '(none)'}`,
          html: `<h2>New contact enquiry</h2>
                 <p><strong>Name:</strong> ${name}</p>
                 <p><strong>Email:</strong> ${email}</p>
                 <p><strong>Phone:</strong> ${phone}</p>
                 <p><strong>Request:</strong><br/>${(message || '(none)').replace(/\n/g, '<br/>')}</p>`,
        })
      }
    } catch (err) {
      fastify.log.error({ err }, 'contact-message: email forward failed')
    }

    return reply.send({ success: true, message: 'Your message has been received.' })
  })

  // ─── GET /api/config/ai-status ────────────────────────────────────────────
  // Returns only whether AI assistance is enabled (no credentials exposed).
  fastify.get('/ai-status', async (_request, reply) => {
    const [rows] = await fastify.db.query<any[]>(
      'SELECT ai_enabled FROM ai_assistance_settings WHERE id = 1 LIMIT 1'
    )
    return reply.send({ success: true, ai_enabled: Boolean(rows[0]?.ai_enabled) })
  })
}
