import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import dotenv from 'dotenv'

// Load .env variables FIRST — before anything else reads process.env
dotenv.config()

const app = Fastify({ logger: true, bodyLimit: 52428800, pluginTimeout: 60000 }) // 50 MB – needed for multi-image base64 uploads; 60s plugin timeout for DB init+seeding

// ─── 1. CORS ──────────────────────────────────────────────────────────────────
// Build a list of allowed origins from FRONTEND_URL (comma-separated) plus
// localhost variants so the browser is never blocked in any access scenario.
const buildAllowedOrigins = (): string[] => {
  const base = process.env.FRONTEND_URL || ''
  // Split comma-separated values, trim whitespace, filter empty
  const fromEnv = base.split(',').map(o => o.trim()).filter(Boolean)
  // Always include localhost on the same port so local browser access works
  const port = process.env.VITE_PORT || '5174'
  const localhostOrigin = `http://localhost:${port}`
  const allOrigins = Array.from(new Set([...fromEnv, localhostOrigin]))
  return allOrigins
}

const allowedOrigins = buildAllowedOrigins()
app.log.info({ allowedOrigins }, 'CORS allowed origins')

app.register(cors, {
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, server-to-server, Postman)
    if (!origin) return cb(null, true)
    if (allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS blocked: ${origin}`), false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

// ─── 2. JWT ───────────────────────────────────────────────────────────────────
// Register @fastify/jwt with our secret key from .env.
// This adds:  fastify.jwt.sign(payload)  and  request.jwtVerify()
app.register(jwt, {
  secret: process.env.JWT_SECRET || 'fallback-secret-change-me',
})

// Add fastify.authenticate — a reusable hook to protect routes.
// Usage: { onRequest: [fastify.authenticate] } on any route definition.
app.decorate('authenticate', async function (request: any, reply: any) {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.status(401).send({ success: false, message: 'Unauthorized. Please log in.' })
  }
})

// Prevent stale API payloads in browsers/proxies (critical for live driver job lists).
app.addHook('onSend', async (request, reply) => {
  const url = request.url || ''
  if (url.startsWith('/api/')) {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0')
    reply.header('Pragma', 'no-cache')
    reply.header('Expires', '0')
    reply.header('Surrogate-Control', 'no-store')
  }
})

// ─── 3. DATABASE ─────────────────────────────────────────────────────────────
// Register the MySQL pool plugin. After this, fastify.db is available everywhere.
import dbPlugin from './plugins/db.js'
app.register(dbPlugin)

// Global maintenance write guard (8.3): block non-admin writes when enabled.
app.addHook('onRequest', async (request, reply) => {
  const method = request.method.toUpperCase()
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return

  const url = request.url || ''
  // Admin/config/health routes remain available so operations team can recover.
  if (url.startsWith('/api/admin') || url.startsWith('/api/config') || url.startsWith('/health')) return

  try {
    const [rows] = await app.db.query<any[]>(
      "SELECT config_value FROM system_config WHERE config_key = 'maintenance_mode' LIMIT 1"
    )
    const enabled = rows?.[0]?.config_value === '1' || rows?.[0]?.config_value === 'true'
    if (!enabled) return

    const [msgRows] = await app.db.query<any[]>(
      "SELECT config_value FROM system_config WHERE config_key = 'maintenance_message' LIMIT 1"
    )
    const message = msgRows?.[0]?.config_value || 'System is under maintenance. Please try again shortly.'
    return reply.status(503).send({ success: false, maintenance_mode: true, message })
  } catch {
    // Fail open to avoid accidental full outage if DB read fails.
  }
})

// Serve uploaded profile photos and other static assets from /uploads
import path from 'path'
import fs from 'fs'

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

// We accept base64 uploads from the client to avoid multipart plugin compatibility issues.

// ─── 4. ROUTES ───────────────────────────────────────────────────────────────
import healthRoutes from './routes/health.js'
import authRoutes from './routes/auth.js'
import adminRoutes from './routes/admin.js'
import profileRoutes from './routes/profile.js'
import orderRoutes from './routes/orders.js'
import driverRoutes from './routes/driver.js'
import wsRoutes from './routes/ws.js'
import configRoutes from './routes/config.js'
import carOwnerRoutes from './routes/carowner.js'
import { eswWebhookHandler } from './controllers/admin.controller.js'

app.register(healthRoutes)
app.register(authRoutes)
app.register(adminRoutes,   { prefix: '/api/admin' })
app.register(profileRoutes, { prefix: '/api/profile' })
app.register(orderRoutes,   { prefix: '/api/orders' })
app.register(driverRoutes,  { prefix: '/api/driver' })
app.register(wsRoutes,      { prefix: '/api' })
app.register(configRoutes,  { prefix: '/api/config' })
app.register(carOwnerRoutes)

// eSW webhook — public (secured by shared secret header)
app.post('/api/esw/webhook', eswWebhookHandler)

export default app
