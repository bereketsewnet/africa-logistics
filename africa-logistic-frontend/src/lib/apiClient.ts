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

// ─── Order API (Shipper) ──────────────────────────────────────────────────────
export const orderApi = {
  getCargoTypes: () =>
    apiClient.get('/orders/cargo-types'),

  getQuote: (data: {
    cargo_type_id: number; vehicle_type: string; estimated_weight_kg?: number
    pickup_lat: number; pickup_lng: number; delivery_lat: number; delivery_lng: number
  }) => apiClient.post('/orders/quote', data),

  placeOrder: (data: {
    cargo_type_id: number; vehicle_type: string; estimated_weight_kg?: number
    pickup_address: string; pickup_lat: number; pickup_lng: number
    delivery_address: string; delivery_lat: number; delivery_lng: number
    description?: string; estimated_value?: number
    order_image_1?: string; order_image_2?: string
  }) => apiClient.post('/orders', data),

  listOrders: (params?: { status?: string; page?: number; limit?: number }) =>
    apiClient.get('/orders', { params }),

  getOrder: (id: string) =>
    apiClient.get(`/orders/${id}`),

  trackOrder: (id: string) =>
    apiClient.get(`/orders/${id}/track`),

  getHistory: (id: string) =>
    apiClient.get(`/orders/${id}/history`),

  getMessages: (id: string, channel?: string) =>
    apiClient.get(`/orders/${id}/messages`, channel ? { params: { channel } } : undefined),

  sendMessage: (id: string, message: string, channel = 'main') =>
    apiClient.post(`/orders/${id}/messages`, { message, channel }),

  cancelOrder: (id: string) =>
    apiClient.post(`/orders/${id}/cancel`),

  getInvoiceUrl: (id: string) =>
    `${BASE_URL}/orders/${id}/invoice`,

  getUnreadCounts: () =>
    apiClient.get('/orders/unread-counts'),

  rateDriver: (orderId: string, stars: number, comment?: string) =>
    apiClient.post(`/orders/${orderId}/rate-driver`, { stars, comment }),

  hasRated: (orderId: string) =>
    apiClient.get(`/orders/${orderId}/has-rated`),

  addTip: (orderId: string, tip_amount: number, rating_stars?: number) =>
    apiClient.post(`/orders/${orderId}/add-tip`, { tip_amount, rating_stars }),

  getCharges: (orderId: string) =>
    apiClient.get(`/orders/${orderId}/charges`),

  getDriverRatingSummary: (driverId: string) =>
    apiClient.get(`/orders/drivers/${driverId}/rating-summary`),
}

// ─── Driver API ───────────────────────────────────────────────────────────────
export const driverApi = {
  pingLocation: (data: { lat: number; lng: number; order_id?: string; heading?: number; speed_kmh?: number }) =>
    apiClient.post('/driver/location', data),

  listJobs: (params?: { status?: string }) =>
    apiClient.get('/driver/jobs', { params }),

  getJob: (id: string) =>
    apiClient.get(`/driver/jobs/${id}`),

  acceptJob: (id: string) =>
    apiClient.patch(`/driver/jobs/${id}/accept`, {}),

  declineJob: (id: string) =>
    apiClient.patch(`/driver/jobs/${id}/decline`, {}),

  updateStatus: (id: string, status: string) =>
    apiClient.patch(`/driver/jobs/${id}/status`, { status }),

  verifyPickup: (id: string, otp: string) =>
    apiClient.post(`/driver/jobs/${id}/verify-pickup`, { otp }),

  verifyDelivery: (id: string, otp: string) =>
    apiClient.post(`/driver/jobs/${id}/verify-delivery`, { otp }),

  getMessages: (id: string, channel?: string) =>
    apiClient.get(`/driver/jobs/${id}/messages`, channel ? { params: { channel } } : undefined),

  sendMessage: (id: string, message: string, channel = 'main') =>
    apiClient.post(`/driver/jobs/${id}/messages`, { message, channel }),

  getUnreadCounts: () =>
    apiClient.get('/driver/jobs/unread-counts'),

  bulkUpdateStatus: (ids: string[], status: string) =>
    Promise.allSettled(ids.map(id => apiClient.patch(`/driver/jobs/${id}/status`, { status }))),

  updateAvailabilityStatus: (status: 'AVAILABLE' | 'OFFLINE') =>
    apiClient.patch('/driver/status', { status }),
}

// ─── Admin Order API ──────────────────────────────────────────────────────────
export const adminOrderApi = {
  listOrders: (params?: { status?: string; search?: string; page?: number; limit?: number; driver_id?: string }) =>
    apiClient.get('/admin/orders', { params }),

  getStats: () =>
    apiClient.get('/admin/orders/stats'),

  getOrder: (id: string) =>
    apiClient.get(`/admin/orders/${id}`),

  assignOrder: (id: string, driver_id: string, vehicle_id?: string) =>
    apiClient.patch(`/admin/orders/${id}/assign`, { driver_id, vehicle_id }),

  updateStatus: (id: string, status: string, notes?: string) =>
    apiClient.patch(`/admin/orders/${id}/status`, { status, notes }),

  updateDetails: (
    id: string,
    data: {
      cargo_type_id?: number
      vehicle_type_required?: string
      estimated_weight_kg?: number | null
      pickup_address?: string | null
      pickup_lat?: number
      pickup_lng?: number
      delivery_address?: string | null
      delivery_lat?: number
      delivery_lng?: number
      special_instructions?: string | null
      notes?: string
    }
  ) => apiClient.patch(`/admin/orders/${id}/details`, data),

  updateInternalNotes: (id: string, internal_notes: string) =>
    apiClient.patch(`/admin/orders/${id}/notes`, { internal_notes }),

  cancelOrder: (id: string, notes?: string) =>
    apiClient.post(`/admin/orders/${id}/cancel`, { notes }),

  listCargoTypes: () =>
    apiClient.get('/admin/cargo-types'),

  createCargoType: (data: { name: string; description?: string; requires_special_handling?: boolean; icon?: string; icon_url?: string }) =>
    apiClient.post('/admin/cargo-types', data),

  updateCargoType: (id: number, data: { name?: string; description?: string; requires_special_handling?: boolean; icon?: string; icon_url?: string; is_active?: boolean }) =>
    apiClient.put(`/admin/cargo-types/${id}`, data),

  listPricingRules: () =>
    apiClient.get('/admin/pricing-rules'),

  createPricingRule: (data: { vehicle_type: string; base_fare: number; per_km_rate: number; per_kg_rate?: number; city_surcharge?: number; min_distance_km?: number; additional_fees?: Array<{name: string; value: number; type: 'fixed'|'percent'}> }) =>
    apiClient.post('/admin/pricing-rules', data),

  updatePricingRule: (id: number, data: { vehicle_type?: string; base_fare?: number; per_km_rate?: number; per_kg_rate?: number; city_surcharge?: number; min_distance_km?: number; is_active?: boolean; additional_fees?: Array<{name: string; value: number; type: 'fixed'|'percent'}> }) =>
    apiClient.put(`/admin/pricing-rules/${id}`, data),

  createOrderOnBehalf: (data: {
    shipper_id?: string
    is_guest?: boolean
    guest_name?: string
    guest_phone?: string
    guest_email?: string
    cargo_type_id: number; vehicle_type: string
    estimated_weight_kg?: number
    pickup_address: string; pickup_lat: number; pickup_lng: number
    delivery_address: string; delivery_lat: number; delivery_lng: number
    special_instructions?: string; estimated_value?: number
    driver_id?: string; vehicle_id?: string
    cargo_image?: string
    payment_receipt?: string
  }) => apiClient.post('/admin/orders', data),

  getLiveDrivers: () =>
    apiClient.get('/admin/drivers/live'),

  getGuestOrders: (params?: { page?: number; limit?: number; search?: string }) =>
    apiClient.get('/admin/orders/guest', { params }),

  getOrderMessages: (id: string, channel?: string) =>
    apiClient.get(`/admin/orders/${id}/messages`, channel ? { params: { channel } } : undefined),

  sendOrderMessage: (id: string, message: string, channel?: string) =>
    apiClient.post(`/admin/orders/${id}/messages`, { message, ...(channel ? { channel } : {}) }),

  getShippers: () => apiClient.get('/admin/users'),

  getDriverRatings: (driverId: string) =>
    apiClient.get(`/admin/drivers/${driverId}/ratings`),

  deleteRating: (ratingId: string) =>
    apiClient.delete(`/admin/ratings/${ratingId}`),

  setDriverStatus: (driverId: string, status: string) =>
    apiClient.patch(`/admin/drivers/${driverId}/status`, { status }),
}
