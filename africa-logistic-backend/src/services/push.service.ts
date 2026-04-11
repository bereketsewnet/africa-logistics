import { Pool, RowDataPacket } from 'mysql2/promise'
import webpush from 'web-push'
import { sendEmail } from './email.service.js'

interface PushSubscriptionRow extends RowDataPacket {
  endpoint: string
  p256dh: string
  auth: string
}

interface PushPayload {
  title: string
  body: string
  url?: string
  data?: Record<string, unknown>
}

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@africa-logistics.lula.com.et'

  if (!publicKey || !privateKey) {
    return null
  }
  return { publicKey, privateKey, subject }
}

function ensureWebPushConfigured(): boolean {
  const cfg = getVapidConfig()
  if (!cfg) return false
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey)
  return true
}

export function getPublicVapidKey(): string | null {
  return getVapidConfig()?.publicKey ?? null
}

export async function upsertPushSubscription(
  db: Pool,
  userId: string,
  input: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }
): Promise<void> {
  await db.query(
    `INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, is_active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       p256dh = VALUES(p256dh),
       auth = VALUES(auth),
       user_agent = VALUES(user_agent),
       is_active = 1,
       last_seen_at = CURRENT_TIMESTAMP`,
    [userId, input.endpoint, input.p256dh, input.auth, input.userAgent ?? null]
  )
}

export async function deactivatePushSubscription(db: Pool, userId: string, endpoint: string): Promise<void> {
  await db.query(
    `UPDATE web_push_subscriptions
     SET is_active = 0, last_seen_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND endpoint = ?`,
    [userId, endpoint]
  )
}

async function getActiveUserSubscriptions(db: Pool, userId: string): Promise<PushSubscriptionRow[]> {
  const [rows] = await db.query<PushSubscriptionRow[]>(
    `SELECT endpoint, p256dh, auth
     FROM web_push_subscriptions
     WHERE user_id = ? AND is_active = 1`,
    [userId]
  )
  return rows
}

export async function sendPushToUser(db: Pool, userId: string, payload: PushPayload): Promise<void> {
  if (!ensureWebPushConfigured()) return

  const subscriptions = await getActiveUserSubscriptions(db, userId)
  if (!subscriptions.length) return

  const serialized = JSON.stringify(payload)

  for (const s of subscriptions) {
    const sub = {
      endpoint: s.endpoint,
      keys: {
        p256dh: s.p256dh,
        auth: s.auth,
      },
    }

    try {
      await webpush.sendNotification(sub as any, serialized)
    } catch (err: any) {
      const statusCode = Number(err?.statusCode ?? 0)
      if (statusCode === 404 || statusCode === 410) {
        await db.query(
          `UPDATE web_push_subscriptions SET is_active = 0, last_seen_at = CURRENT_TIMESTAMP WHERE endpoint = ?`,
          [s.endpoint]
        )
      }
    }
  }
}

export async function sendPushToRole(
  db: Pool,
  roleId: number,
  payload: PushPayload,
  onlyBrowserEnabled = true
): Promise<void> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id
     FROM users u
     LEFT JOIN notification_preferences np ON np.user_id = u.id
     WHERE u.role_id = ?
       AND u.is_active = 1
       AND (? = 0 OR COALESCE(np.browser_enabled, 1) = 1)`,
    [roleId, onlyBrowserEnabled ? 1 : 0]
  )

  for (const row of rows) {
    await sendPushToUser(db, String(row.id), payload)
  }
}

export async function notifyAdminsOfEvent(
  db: Pool,
  title: string,
  body: string,
  url: string
): Promise<void> {
  await sendPushToRole(db, 1, { title, body, url })

  const [admins] = await db.query<RowDataPacket[]>(
    `SELECT u.email
     FROM users u
     LEFT JOIN notification_preferences np ON np.user_id = u.id
     WHERE u.role_id = 1
       AND u.is_active = 1
       AND u.is_email_verified = 1
       AND u.email IS NOT NULL
       AND COALESCE(np.email_enabled, 1) = 1`
  )

  for (const a of admins) {
    const to = String(a.email || '').trim()
    if (!to) continue
    await sendEmail({ to, subject: title, text: `${body}\n\nOpen: ${url}` }).catch(() => {})
  }
}
