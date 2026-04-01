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
    // Development fallback: do not throw, higher-level code will console.log
    return null as unknown as ReturnType<typeof nodemailer.createTransport>
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: { user, pass },
  })
}

export async function sendEmail(opts: EmailOptions) {
  const transporter = getTransporter()
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@afri-logistics.lula.com.et'

  if (!transporter) {
    // Dev mode: print to console and return a fake result
    console.log('─────────────────────────────────────────')
    console.log(`📧 Dev email to: ${opts.to}`)
    console.log(`Subject: ${opts.subject}`)
    if (opts.text) console.log(opts.text)
    if (opts.html) console.log(opts.html)
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

export async function sendVerificationEmail(to: string, token: string) {
  const frontendBase = process.env.FRONTEND_BASE_URL || process.env.FRONTEND_URL?.split(',')[0] || 'https://afri-logistics.lula.com.et'
  const verifyUrl = `${frontendBase.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`
  const html = `
    <p>Hello,</p>
    <p>Click the link below to confirm your email address for Africa Logistics:</p>
    <p><a href="${verifyUrl}">Verify my email</a></p>
    <p>If you didn't request this, ignore this message.</p>
  `
  return sendEmail({ to, subject: 'Verify your Africa Logistics email', html })
}
