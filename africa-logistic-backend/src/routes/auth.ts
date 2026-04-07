/**
 * Auth Routes (src/routes/auth.ts)
 *
 * Registers all 5 authentication endpoints following the exact same
 * async plugin pattern used in src/routes/health.ts.
 *
 * Each route includes:
 *  - A JSON Schema for request validation (Fastify validates automatically)
 *  - The corresponding controller handler
 *  - For /me: the JWT authenticate hook to protect the route
 */

import { FastifyInstance } from 'fastify'
import {
  requestOtpHandler,
  verifyOtpHandler,
  loginHandler,
  loginEmailHandler,
  telegramAuthHandler,
  meHandler,
  changePasswordHandler,
  requestEmailLinkHandler,
  verifyEmailHandler,
  requestPhoneChangeHandler,
  verifyPhoneChangeHandler,
  updateProfileHandler,
  deleteProfilePhotoHandler,
  forgotPasswordEmailHandler,
  resetPasswordEmailHandler,
  forgotPasswordRequestOtpHandler,
  forgotPasswordResetHandler,
} from '../controllers/auth.controller.js'

export default async function authRoutes(fastify: FastifyInstance) {

  // ── POST /api/auth/register/request-otp ────────────────────────────────────
  // Step 1: User submits their phone number → OTP sent via Twilio
  fastify.post('/api/auth/register/request-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['phone_number'],
        properties: {
          phone_number: {
            type: 'string',
            description: 'Phone in E.164 format, e.g. +251911234567',
            minLength: 7,
            maxLength: 20,
          },
        },
      },
    },
  }, requestOtpHandler)

  // ── POST /api/auth/register/verify ─────────────────────────────────────────
  // Step 2: User submits OTP + password → account created, JWT returned
  fastify.post('/api/auth/register/verify', {
    schema: {
      body: {
        type: 'object',
        required: ['phone_number', 'otp', 'new_password'],
        properties: {
          phone_number:  { type: 'string', minLength: 7, maxLength: 20 },
          otp:           { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' },
          new_password:  { type: 'string', minLength: 6 },
          role_id:       { type: 'number', enum: [2, 3] },     // 2=Shipper, 3=Driver
          first_name:    { type: 'string', minLength: 1, maxLength: 100 },
          last_name:     { type: 'string', maxLength: 100 },
        },
      },
    },
  }, verifyOtpHandler)

  // ── POST /api/auth/login ────────────────────────────────────────────────────
  // Phone + password login → JWT returned
  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['phone_number', 'password'],
        properties: {
          phone_number: { type: 'string', minLength: 7, maxLength: 20 },
          password:     { type: 'string', minLength: 1 },
        },
      },
    },
  }, loginHandler)

  // ── POST /api/auth/telegram ─────────────────────────────────────────────────
  // Telegram Mini App login via initData HMAC validation
  fastify.post('/api/auth/telegram', {
    schema: {
      body: {
        type: 'object',
        required: ['initData'],
        properties: {
          initData: { type: 'string', minLength: 1 },
        },
      },
    },
  }, telegramAuthHandler)

  // ── GET /api/auth/me ────────────────────────────────────────────────────────
  // Protected: requires a valid JWT in the Authorization header
  // The `onRequest` hook runs BEFORE the handler, verifying the token.
  fastify.get('/api/auth/me', {
    onRequest: [fastify.authenticate],
  }, meHandler)

  // POST /api/auth/change-password
  fastify.post('/api/auth/change-password', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['current_password','new_password'],
        properties: {
          current_password: { type: 'string', minLength: 1 },
          new_password: { type: 'string', minLength: 6 }
        }
      }
    }
  }, changePasswordHandler)

  // POST /api/auth/request-email-link
  fastify.post('/api/auth/request-email-link', {
    onRequest: [fastify.authenticate],
    schema: {
      body: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } }
    }
  }, requestEmailLinkHandler)

  // GET /api/auth/verify-email
  fastify.get('/api/auth/verify-email', {
    schema: { querystring: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } }
  }, verifyEmailHandler)

  // POST /api/auth/request-phone-change
  fastify.post('/api/auth/request-phone-change', {
    onRequest: [fastify.authenticate],
    schema: { body: { type: 'object', required: ['new_phone'], properties: { new_phone: { type: 'string' } } } }
  }, requestPhoneChangeHandler)

  // POST /api/auth/verify-phone-change
  fastify.post('/api/auth/verify-phone-change', {
    onRequest: [fastify.authenticate],
    schema: { body: { type: 'object', required: ['new_phone','otp'], properties: { new_phone: { type: 'string' }, otp: { type: 'string' } } } }
  }, verifyPhoneChangeHandler)

  // PUT /api/auth/profile
  fastify.put('/api/auth/profile', {
    onRequest: [fastify.authenticate],
  }, updateProfileHandler)

  // DELETE /api/auth/profile/photo
  fastify.delete('/api/auth/profile/photo', {
    onRequest: [fastify.authenticate],
  }, deleteProfilePhotoHandler)

  // POST /api/auth/login-email — email + password login (email must be verified)
  fastify.post('/api/auth/login-email', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, loginEmailHandler)

  // POST /api/auth/forgot-password/request-otp — send OTP to registered phone for password reset
  fastify.post('/api/auth/forgot-password/request-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['phone_number'],
        properties: {
          phone_number: { type: 'string', minLength: 7, maxLength: 20 },
        },
      },
    },
  }, forgotPasswordRequestOtpHandler)

  // POST /api/auth/forgot-password/reset — verify OTP and set new password
  fastify.post('/api/auth/forgot-password/reset', {
    schema: {
      body: {
        type: 'object',
        required: ['phone_number', 'otp', 'new_password'],
        properties: {
          phone_number: { type: 'string', minLength: 7, maxLength: 20 },
          otp:          { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' },
          new_password: { type: 'string', minLength: 6 },
        },
      },
    },
  }, forgotPasswordResetHandler)

  // POST /api/auth/forgot-password-email — send reset link to verified email
  fastify.post('/api/auth/forgot-password-email', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
    },
  }, forgotPasswordEmailHandler)

  // POST /api/auth/reset-password-email — verify JWT reset token and update password
  fastify.post('/api/auth/reset-password-email', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'new_password'],
        properties: {
          token:        { type: 'string', minLength: 1 },
          new_password: { type: 'string', minLength: 6 },
        },
      },
    },
  }, resetPasswordEmailHandler)
}
