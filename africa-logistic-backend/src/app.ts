import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import dotenv from 'dotenv'

// Load .env variables FIRST — before anything else reads process.env
dotenv.config()

const app = Fastify({ logger: true })

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

// ─── 3. DATABASE ─────────────────────────────────────────────────────────────
// Register the MySQL pool plugin. After this, fastify.db is available everywhere.
import dbPlugin from './plugins/db.js'
app.register(dbPlugin)

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

app.register(healthRoutes)
app.register(authRoutes)
app.register(adminRoutes, { prefix: '/api/admin' })

export default app
