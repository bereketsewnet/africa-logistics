import nodemailer from 'nodemailer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

interface EmailOptions {
  to: string
  subject: string
  html?: string
  text?: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const EMAIL_LOGO_CID = 'africa-logistics-logo'
const EMAIL_LOGO_PATH = path.resolve(__dirname, '../assets/logo.webp')
const EMAIL_LOGO_AVAILABLE = fs.existsSync(EMAIL_LOGO_PATH)

function getTransporter() {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  const isPlaceholder = !host || !user || !pass ||
    user.includes('your-email') || pass.includes('your-') || pass.length < 8

  if (isPlaceholder) {
    return null as unknown as ReturnType<typeof nodemailer.createTransport>
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
}

export async function sendEmail(opts: EmailOptions) {
  const transporter = getTransporter()
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@africa-logistics.lula.com.et'

  if (!transporter) {
    console.log('─────────────────────────────────────────')
    console.log(`📧 Dev email to: ${opts.to}`)
    console.log(`Subject: ${opts.subject}`)
    if (opts.text) console.log(opts.text)
    console.log('─────────────────────────────────────────')
    return { accepted: [opts.to] }
  }

  return transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: EMAIL_LOGO_AVAILABLE && opts.html
      ? [{ filename: 'logo.webp', path: EMAIL_LOGO_PATH, cid: EMAIL_LOGO_CID }]
      : undefined,
  })
}

// ─── Gmail-safe email builder ─────────────────────────────────────────────────
// Rules: no rgba(), no CSS gradients, no shorthand properties, solid hex only.
// Gmail strips gradients and rgba → cards look black with invisible dark text.

function buildStyledEmail({
  title,
  preheader,
  bodyHtml,
  ctaUrl,
  ctaLabel,
  footerNote,
}: {
  title: string
  preheader: string
  bodyHtml: string
  ctaUrl?: string
  ctaLabel?: string
  footerNote?: string
}): string {

  const ctaBlock = ctaUrl && ctaLabel ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 20px;">
      <tr>
        <td align="center">
          <a href="${ctaUrl}"
             style="display:inline-block;padding:14px 36px;background-color:#7c3aed;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;font-family:Arial,sans-serif;letter-spacing:0.3px;">
            ${ctaLabel}
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:14px;">
          <p style="margin:0;font-size:12px;color:#888888;font-family:Arial,sans-serif;">
            Button not working? Copy and paste this link into your browser:
          </p>
          <p style="margin:6px 0 0;font-size:12px;font-family:Arial,sans-serif;">
            <a href="${ctaUrl}" style="color:#7c3aed;word-break:break-all;">${ctaUrl}</a>
          </p>
        </td>
      </tr>
    </table>` : ''

  const headerLogoHtml = EMAIL_LOGO_AVAILABLE
    ? `<img src="cid:${EMAIL_LOGO_CID}" alt="Afri Logistics" style="height:54px;width:auto;object-fit:contain;display:block;margin:0 auto 8px;" />`
    : `<p style="margin:0;font-size:22px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;letter-spacing:-0.3px;">Afri Logistics</p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">

  <!-- Hidden preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader} &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f7">
    <tr>
      <td align="center" style="padding:32px 16px 48px;">

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:520px;background-color:#ffffff;border-radius:12px;border:1px solid #e2e2e2;">

          <!-- Accent top bar -->
          <tr>
            <td bgcolor="#7c3aed" style="height:5px;border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header / Logo area -->
          <tr>
            <td align="center" style="padding:32px 40px 20px;background-color:#ffffff;">
              ${headerLogoHtml}
              <p style="margin:6px 0 0;font-size:12px;color:#888888;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;">
                Logistics Platform
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="#e8e8e8" style="height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 40px 8px;color:#333333;font-size:15px;line-height:1.7;font-family:Arial,sans-serif;">
              ${bodyHtml}
              ${ctaBlock}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="#e8e8e8" style="height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:20px 40px 28px;background-color:#fafafa;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 4px;font-size:12px;color:#999999;font-family:Arial,sans-serif;">
                ${footerNote || 'You received this because your email is linked to an Afri Logistics account.'}
              </p>
              <p style="margin:0;font-size:11px;color:#bbbbbb;font-family:Arial,sans-serif;">
                &copy; ${new Date().getFullYear()} Afri Logistics &bull; africa-logistics.lula.com.et
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Verification email ───────────────────────────────────────────────────────

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const html = buildStyledEmail({
    title: 'Reset your password — Afri Logistics',
    preheader: 'You requested a password reset for your Afri Logistics account.',
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;">Reset your password</h1>
      <p style="margin:0 0 16px;color:#444444;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
        We received a request to reset the password for your <strong style="color:#1a1a2e;">Afri Logistics</strong> account.
        Click the button below to choose a new password.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
        <tr>
          <td bgcolor="#fff3f3" style="border:1px solid #fca5a5;border-radius:8px;padding:14px 18px;">
            <p style="margin:0;font-size:12px;color:#666666;font-family:Arial,sans-serif;">Resetting password for</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#7c3aed;font-family:Arial,sans-serif;">${to}</p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;color:#666666;font-family:Arial,sans-serif;">This link expires in <strong style="color:#333333;">1 hour</strong>. If you did not request a password reset, you can safely ignore this email.</p>
    `,
    ctaUrl: resetUrl,
    ctaLabel: 'Reset My Password',
    footerNote: 'This password reset was requested for your Afri Logistics account.',
  })

  return sendEmail({
    to,
    subject: '🔑 Reset your password — Afri Logistics',
    html,
    text: `Reset your Afri Logistics password:\n${resetUrl}\n\nLink expires in 1 hour. If you did not request this, ignore this email.`,
  })
}

export async function sendVerificationEmail(to: string, token: string) {
  const frontendBase = process.env.FRONTEND_BASE_URL || process.env.FRONTEND_URL?.split(',')[0] || 'https://africa-logistics.lula.com.et'
  const verifyUrl = `${frontendBase.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`

  const html = buildStyledEmail({
    title: 'Verify your email — Afri Logistics',
    preheader: 'Confirm your email address to activate your Afri Logistics account.',
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;">Confirm your email address</h1>
      <p style="margin:0 0 16px;color:#444444;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
        Welcome to <strong style="color:#1a1a2e;">Afri Logistics</strong>. Click the button below to verify your email address and activate your account.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
        <tr>
          <td bgcolor="#f0f9ff" style="border:1px solid #bae6fd;border-radius:8px;padding:14px 18px;">
            <p style="margin:0;font-size:12px;color:#666666;font-family:Arial,sans-serif;">Verifying for</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#7c3aed;font-family:Arial,sans-serif;">${to}</p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;color:#666666;font-family:Arial,sans-serif;">This link expires in <strong style="color:#333333;">24 hours</strong>. If you did not request this, you can safely ignore this email.</p>
    `,
    ctaUrl: verifyUrl,
    ctaLabel: 'Verify My Email',
    footerNote: 'This verification was requested for your Afri Logistics account.',
  })

  return sendEmail({
    to,
    subject: '✉ Verify your email — Afri Logistics',
    html,
    text: `Verify your Afri Logistics email:\n${verifyUrl}\n\nLink expires in 24 hours.`,
  })
}

// ─── Order Status Notification ────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  ASSIGNED: 'Driver Assigned',
  EN_ROUTE: 'Driver En Route',
  AT_PICKUP: 'Driver At Pickup',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#fbbf24',
  ASSIGNED: '#60a5fa',
  EN_ROUTE: '#a78bfa',
  AT_PICKUP: '#fb923c',
  IN_TRANSIT: '#34d399',
  DELIVERED: '#4ade80',
  CANCELLED: '#f87171',
}

export interface OrderStatusEmailData {
  referenceCode: string
  status: string
  pickupAddress: string
  deliveryAddress: string
  recipientName: string
  recipientRole: 'shipper' | 'driver'
  driverName?: string
}

export async function sendOrderStatusEmail(to: string, data: OrderStatusEmailData) {
  const label = STATUS_LABEL[data.status] ?? data.status
  const color = STATUS_COLOR[data.status] ?? '#94a3b8'
  const appUrl = `${process.env.FRONTEND_BASE_URL || 'https://africa-logistics.lula.com.et'}`

  const roleMsg = data.recipientRole === 'shipper'
    ? `Your shipment <strong style="color:#1a1a2e;">${data.referenceCode}</strong> has a new status update.`
    : `Job <strong style="color:#1a1a2e;">${data.referenceCode}</strong> has a status update.`

  const driverRow = data.driverName && data.recipientRole === 'shipper'
    ? `<tr>
        <td style="padding:6px 0;font-size:14px;color:#666666;font-family:Arial,sans-serif;width:120px;">Driver</td>
        <td style="padding:6px 0;font-size:14px;font-weight:600;color:#1a1a2e;font-family:Arial,sans-serif;">${data.driverName}</td>
       </tr>`
    : ''

  const html = buildStyledEmail({
    title: `Order ${label} — Afri Logistics`,
    preheader: `${data.referenceCode} is now ${label}.`,
    bodyHtml: `
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;">Order Update</h1>
      <p style="margin:0 0 20px;color:#555555;font-size:15px;font-family:Arial,sans-serif;">Hi ${data.recipientName}, ${roleMsg}</p>

      <!-- Status badge row -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
        <tr>
          <td align="center">
            <span style="display:inline-block;padding:7px 22px;background-color:${color}22;border:1px solid ${color}66;border-radius:99px;font-size:14px;font-weight:700;color:${color};font-family:Arial,sans-serif;letter-spacing:0.3px;">
              ${label}
            </span>
          </td>
        </tr>
      </table>

      <!-- Order detail table -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background-color:#f9f9f9;border:1px solid #e8e8e8;border-radius:8px;padding:4px 0;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#666666;font-family:Arial,sans-serif;width:120px;">Reference</td>
                <td style="padding:6px 0;font-size:14px;font-weight:700;color:#7c3aed;font-family:Arial,sans-serif;">${data.referenceCode}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding:0;border-top:1px solid #eeeeee;font-size:0;">&nbsp;</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#666666;font-family:Arial,sans-serif;">Pickup</td>
                <td style="padding:6px 0;font-size:14px;color:#333333;font-family:Arial,sans-serif;">${data.pickupAddress}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding:0;border-top:1px solid #eeeeee;font-size:0;">&nbsp;</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#666666;font-family:Arial,sans-serif;">Delivery</td>
                <td style="padding:6px 0;font-size:14px;color:#333333;font-family:Arial,sans-serif;">${data.deliveryAddress}</td>
              </tr>
              ${driverRow ? `<tr><td colspan="2" style="padding:0;border-top:1px solid #eeeeee;font-size:0;">&nbsp;</td></tr>${driverRow}` : ''}
            </table>
          </td>
        </tr>
      </table>
    `,
    ctaUrl: appUrl,
    ctaLabel: 'View Order',
    footerNote: 'You received this because email notifications are enabled for your Afri Logistics account.',
  })

  return sendEmail({
    to,
    subject: `🚛 [${data.referenceCode}] ${label} — Afri Logistics`,
    html,
    text: `Order ${data.referenceCode} is now ${label}.\nPickup: ${data.pickupAddress}\nDelivery: ${data.deliveryAddress}\nView at: ${appUrl}`,
  })
}

// ─── Order placement OTP email ────────────────────────────────────────────────

export interface OrderPlacedEmailData {
  referenceCode: string
  recipientName: string
  pickupAddress: string
  deliveryAddress: string
  pickupOtp: string
  deliveryOtp: string
  estimatedPrice: string   // e.g. "690.98 ETB"
}

export async function sendOrderPlacedEmail(to: string, data: OrderPlacedEmailData) {
  const appUrl = process.env.FRONTEND_BASE_URL || 'https://africa-logistics.lula.com.et'

  const html = buildStyledEmail({
    title: `Order Confirmed ${data.referenceCode} — Afri Logistics`,
    preheader: `Your order ${data.referenceCode} is confirmed. Keep your OTPs safe.`,
    bodyHtml: `
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;">Order Confirmed!</h1>
      <p style="margin:0 0 20px;color:#555555;font-size:15px;font-family:Arial,sans-serif;">
        Hi ${data.recipientName}, your shipment has been placed successfully. Here are your order details and OTPs.
      </p>

      <!-- Order details table -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background-color:#f9f9f9;border:1px solid #e8e8e8;border-radius:8px;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#666666;font-family:Arial,sans-serif;width:120px;">Reference</td>
                <td style="padding:6px 0;font-size:14px;font-weight:700;color:#7c3aed;font-family:Arial,sans-serif;">${data.referenceCode}</td>
              </tr>
              <tr><td colspan="2" style="padding:0;border-top:1px solid #eeeeee;font-size:0;">&nbsp;</td></tr>
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#666666;font-family:Arial,sans-serif;">Pickup</td>
                <td style="padding:6px 0;font-size:14px;color:#333333;font-family:Arial,sans-serif;">${data.pickupAddress}</td>
              </tr>
              <tr><td colspan="2" style="padding:0;border-top:1px solid #eeeeee;font-size:0;">&nbsp;</td></tr>
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#666666;font-family:Arial,sans-serif;">Delivery</td>
                <td style="padding:6px 0;font-size:14px;color:#333333;font-family:Arial,sans-serif;">${data.deliveryAddress}</td>
              </tr>
              <tr><td colspan="2" style="padding:0;border-top:1px solid #eeeeee;font-size:0;">&nbsp;</td></tr>
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#666666;font-family:Arial,sans-serif;">Price</td>
                <td style="padding:6px 0;font-size:14px;font-weight:600;color:#1a1a2e;font-family:Arial,sans-serif;">${data.estimatedPrice}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- OTP section -->
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;">Your Order OTPs</p>
      <p style="margin:0 0 14px;font-size:13px;color:#666666;font-family:Arial,sans-serif;">
        Share these codes with your driver at each stage — <strong style="color:#1a1a2e;">Pickup OTP</strong> when the driver arrives to collect your cargo, and <strong style="color:#1a1a2e;">Delivery OTP</strong> when they drop it off.
      </p>

      <!-- Pickup OTP box -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
        <tr>
          <td bgcolor="#f0fdf4" style="border:1px solid #86efac;border-radius:8px;padding:14px 20px;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#16a34a;letter-spacing:0.08em;text-transform:uppercase;font-family:Arial,sans-serif;">Pickup OTP</p>
            <p style="margin:0;font-size:32px;font-weight:900;letter-spacing:0.3em;color:#15803d;font-family:Arial,sans-serif;">${data.pickupOtp}</p>
          </td>
        </tr>
      </table>

      <!-- Delivery OTP box -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr>
          <td bgcolor="#eff6ff" style="border:1px solid #93c5fd;border-radius:8px;padding:14px 20px;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#2563eb;letter-spacing:0.08em;text-transform:uppercase;font-family:Arial,sans-serif;">Delivery OTP</p>
            <p style="margin:0;font-size:32px;font-weight:900;letter-spacing:0.3em;color:#1d4ed8;font-family:Arial,sans-serif;">${data.deliveryOtp}</p>
          </td>
        </tr>
      </table>

      <!-- Warning note -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
        <tr>
          <td bgcolor="#fffbeb" style="border:1px solid #fcd34d;border-radius:8px;padding:12px 18px;">
            <p style="margin:0;font-size:13px;color:#92400e;font-family:Arial,sans-serif;">
              &#9888;&#65039; Keep these OTPs private. Do not share them until the driver is physically at the pickup or delivery location.
            </p>
          </td>
        </tr>
      </table>
    `,
    ctaUrl: appUrl,
    ctaLabel: 'View My Orders',
    footerNote: 'You received this because you placed an order on Afri Logistics.',
  })

  return sendEmail({
    to,
    subject: `✅ Order Confirmed [${data.referenceCode}] — Your OTPs Inside`,
    html,
    text: [
      `Order ${data.referenceCode} confirmed!`,
      `Pickup:   ${data.pickupAddress}`,
      `Delivery: ${data.deliveryAddress}`,
      `Price:    ${data.estimatedPrice}`,
      ``,
      `PICKUP OTP:   ${data.pickupOtp}`,
      `DELIVERY OTP: ${data.deliveryOtp}`,
      ``,
      `Share these with your driver at each stage. Keep them private until the driver arrives.`,
      `View orders: ${appUrl}`,
    ].join('\n'),
  })
}

