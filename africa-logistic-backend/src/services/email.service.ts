import nodemailer from 'nodemailer'
import path from 'path'
import fs from 'fs'

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

// ─── Styled email builder ─────────────────────────────────────────────────────

function getLogoBase64(): string {
  try {
    const logoPath = path.join(process.cwd(), 'src', 'assets', 'logo-with-name.jpeg')
    if (fs.existsSync(logoPath)) {
      const data = fs.readFileSync(logoPath)
      return `data:image/jpeg;base64,${data.toString('base64')}`
    }
  } catch { /* ignore */ }
  return ''
}

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
  const logoBase64 = getLogoBase64()
  const logoTag = logoBase64
    ? `<img src="${logoBase64}" alt="Africa Logistics" style="height:52px;width:auto;object-fit:contain;border-radius:8px;" />`
    : `<span style="font-size:1.3rem;font-weight:900;color:#00e5ff;letter-spacing:-0.02em;">Africa Logistics</span>`

  const ctaBlock = ctaUrl && ctaLabel ? `
    <div style="text-align:center;margin:2rem 0 1.5rem;">
      <a href="${ctaUrl}"
         style="display:inline-block;padding:0.85rem 2.2rem;background:linear-gradient(135deg,#7c3aed,#0ea5e9);color:#ffffff;font-size:0.95rem;font-weight:700;text-decoration:none;border-radius:12px;letter-spacing:0.02em;box-shadow:0 4px 20px rgba(0,229,255,0.25);">
        ${ctaLabel}
      </a>
      <p style="margin-top:0.9rem;font-size:0.75rem;color:#64748b;">
        Button not working? Copy and paste this link:<br/>
        <a href="${ctaUrl}" style="color:#0ea5e9;word-break:break-all;">${ctaUrl}</a>
      </p>
    </div>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>${title}</title>
  <!--[if mso]><style>table{border-collapse:collapse!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d1117;min-height:100vh;">
    <tr><td align="center" style="padding:32px 16px 48px;">

      <!-- Card -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:linear-gradient(145deg,rgba(22,28,45,0.98),rgba(13,17,23,0.98));border-radius:20px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 24px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(0,229,255,0.04);">

        <!-- Accent top bar -->
        <tr><td style="height:4px;background:linear-gradient(90deg,#7c3aed,#00e5ff,#0ea5e9);border-radius:20px 20px 0 0;"></td></tr>

        <!-- Header -->
        <tr><td align="center" style="padding:36px 40px 28px;">
          <div style="margin-bottom:6px;">${logoTag}</div>
          <p style="margin:12px 0 0;font-size:0.75rem;color:#475569;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">Logistics Platform</p>
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent);"></div></td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 40px 8px;color:#cbd5e1;font-size:0.9375rem;line-height:1.7;">
          ${bodyHtml}
          ${ctaBlock}
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:8px 40px 0;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent);"></div></td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:24px 40px 32px;">
          <p style="margin:0 0 6px;font-size:0.75rem;color:#334155;">${footerNote || 'You received this because your email is linked to an Africa Logistics account.'}</p>
          <p style="margin:0;font-size:0.7rem;color:#1e293b;">© ${new Date().getFullYear()} Africa Logistics &bull; afri-logistics.lula.com.et</p>
        </td></tr>

        <!-- Bottom accent bar -->
        <tr><td style="height:3px;background:linear-gradient(90deg,#0ea5e9,#7c3aed);border-radius:0 0 20px 20px;opacity:0.5;"></td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── Verification email ───────────────────────────────────────────────────────

export async function sendVerificationEmail(to: string, token: string) {
  const frontendBase = process.env.FRONTEND_BASE_URL || process.env.FRONTEND_URL?.split(',')[0] || 'https://afri-logistics.lula.com.et'
  const verifyUrl = `${frontendBase.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`

  const html = buildStyledEmail({
    title: 'Verify your email — Africa Logistics',
    preheader: 'Confirm your email address to activate your Africa Logistics account.',
    bodyHtml: `
      <h1 style="margin:0 0 0.75rem;font-size:1.4rem;font-weight:800;color:#f1f5f9;letter-spacing:-0.02em;">Confirm your email address</h1>
      <p style="margin:0 0 1rem;color:#94a3b8;">
        Welcome to <strong style="color:#e2e8f0;">Africa Logistics</strong>. Click the button below to verify your email address and activate your account.
      </p>
      <div style="background:rgba(0,229,255,0.05);border:1px solid rgba(0,229,255,0.12);border-radius:12px;padding:1rem 1.25rem;margin:1.25rem 0;">
        <p style="margin:0;font-size:0.8rem;color:#64748b;">Verifying for</p>
        <p style="margin:4px 0 0;font-size:0.9rem;font-weight:600;color:#0ea5e9;">${to}</p>
      </div>
      <p style="margin:0 0 0.5rem;font-size:0.85rem;color:#64748b;">This link expires in <strong style="color:#cbd5e1;">24 hours</strong>. If you did not request this, you can safely ignore this email.</p>
    `,
    ctaUrl: verifyUrl,
    ctaLabel: '✓ Verify My Email',
    footerNote: 'This verification was requested for your Africa Logistics account.',
  })

  return sendEmail({
    to,
    subject: '✉ Verify your email — Africa Logistics',
    html,
    text: `Verify your Africa Logistics email:\n${verifyUrl}\n\nLink expires in 24 hours.`,
  })
}
