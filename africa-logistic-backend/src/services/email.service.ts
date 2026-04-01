import nodemailer from 'nodemailer'

interface EmailOptions {
  to: string
  subject: string
  html?: string
  text?: string
}

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
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@afri-logistics.lula.com.et'

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
              <p style="margin:0;font-size:22px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;letter-spacing:-0.3px;">
                &#x1F69A; Africa Logistics
              </p>
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
                ${footerNote || 'You received this because your email is linked to an Africa Logistics account.'}
              </p>
              <p style="margin:0;font-size:11px;color:#bbbbbb;font-family:Arial,sans-serif;">
                &copy; ${new Date().getFullYear()} Africa Logistics &bull; afri-logistics.lula.com.et
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
    title: 'Reset your password — Africa Logistics',
    preheader: 'You requested a password reset for your Africa Logistics account.',
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;">Reset your password</h1>
      <p style="margin:0 0 16px;color:#444444;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
        We received a request to reset the password for your <strong style="color:#1a1a2e;">Africa Logistics</strong> account.
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
    footerNote: 'This password reset was requested for your Africa Logistics account.',
  })

  return sendEmail({
    to,
    subject: '🔑 Reset your password — Africa Logistics',
    html,
    text: `Reset your Africa Logistics password:\n${resetUrl}\n\nLink expires in 1 hour. If you did not request this, ignore this email.`,
  })
}

export async function sendVerificationEmail(to: string, token: string) {
  const frontendBase = process.env.FRONTEND_BASE_URL || process.env.FRONTEND_URL?.split(',')[0] || 'https://afri-logistics.lula.com.et'
  const verifyUrl = `${frontendBase.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`

  const html = buildStyledEmail({
    title: 'Verify your email — Africa Logistics',
    preheader: 'Confirm your email address to activate your Africa Logistics account.',
    bodyHtml: `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;">Confirm your email address</h1>
      <p style="margin:0 0 16px;color:#444444;font-size:15px;line-height:1.6;font-family:Arial,sans-serif;">
        Welcome to <strong style="color:#1a1a2e;">Africa Logistics</strong>. Click the button below to verify your email address and activate your account.
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
    footerNote: 'This verification was requested for your Africa Logistics account.',
  })

  return sendEmail({
    to,
    subject: '✉ Verify your email — Africa Logistics',
    html,
    text: `Verify your Africa Logistics email:\n${verifyUrl}\n\nLink expires in 24 hours.`,
  })
}
