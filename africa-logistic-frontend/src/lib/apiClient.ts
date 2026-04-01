/**
 * API Client (src/lib/apiClient.ts)
 *
 * A configured axios instance that:
 *  1. Points to our Fastify backend at http://localhost:3000/api
 *  2. Automatically reads the JWT from localStorage and attaches it
 *     to every request as:  Authorization: Bearer <token>
 *
 * Usage anywhere in the app:
 *   import apiClient from '../lib/apiClient'
 *   const { data } = await apiClient.post('/auth/login', { phone_number, password })
 */

import axios from 'axios'

// Read the backend URL from the .env file (VITE_ prefix is required by Vite).
// In development: http://187.124.46.190:3000/api
// Change VITE_API_BASE_URL in .env to update for any environment.
const BASE_URL = import.meta.env.VITE_API_BASE_URL as string

if (!BASE_URL) {
  console.error('⚠️  VITE_API_BASE_URL is not set in your .env file!')
}

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Request Interceptor ──────────────────────────────────────────────────────
// Runs before every API call.
// If a JWT exists in localStorage, it attaches it to the Authorization header.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Response Interceptor ─────────────────────────────────────────────────────
// Runs after every API response.
// If the server returns 401 (Unauthorized), clear the stale token and redirect
// to the login page so the user isn't stuck in a broken state.
apiClient.interceptors.response.use(
  (response) => response, // Pass successful responses through
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient

// ─── Typed API helpers ────────────────────────────────────────────────────────

export const authApi = {
  changePassword: (current_password: string, new_password: string) =>
    apiClient.post('/auth/change-password', { current_password, new_password }),

  requestEmailLink: (email: string) =>
    apiClient.post('/auth/request-email-link', { email }),

  verifyEmail: (token: string) =>
    apiClient.get(`/auth/verify-email?token=${encodeURIComponent(token)}`),

  requestPhoneChange: (new_phone: string) =>
    apiClient.post('/auth/request-phone-change', { new_phone }),

  verifyPhoneChange: (new_phone: string, otp: string) =>
    apiClient.post('/auth/verify-phone-change', { new_phone, otp }),

  updateProfile: (data: { first_name?: string; last_name?: string; profile_photo_base64?: string; profile_photo_filename?: string }) =>
    apiClient.put('/auth/profile', data),

  deleteProfilePhoto: () =>
    apiClient.delete('/auth/profile/photo'),

  me: () => apiClient.get('/auth/me'),
}
