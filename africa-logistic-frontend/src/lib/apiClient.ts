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
    // Redirect only when an existing authenticated session has expired. A
    // normal failed login also returns 401, but there is no stored session in
    // that case and the page must remain mounted so it can show the error.
    if (error.response?.status === 401 && localStorage.getItem('auth_token')) {
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
    is_cross_border?: boolean
  }) => apiClient.post('/orders/quote', data),

  placeOrder: (data: {
    cargo_type_id: number; vehicle_type: string; estimated_weight_kg?: number
    pickup_address: string; pickup_lat: number; pickup_lng: number
    delivery_address: string; delivery_lat: number; delivery_lng: number
    description?: string; estimated_value?: number
    order_image_1?: string; order_image_2?: string
    is_cross_border?: boolean
    pickup_country_id?: number
    delivery_country_id?: number
    hs_code?: string
    shipper_tin?: string
    // Sent after the shipper confirms the low-wallet-balance warning.
    acknowledge_insufficient_balance?: boolean
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

  /** Remove a cancelled order from the shipper's own list. */
  deleteOrder: (id: string) =>
    apiClient.delete(`/orders/${id}`),

  getInvoiceUrl: (id: string) =>
    `${BASE_URL}/orders/${id}/invoice`,

  getUnreadCounts: () =>
    apiClient.get('/orders/unread-counts'),

  getReport: (params?: { from?: string; to?: string }) =>
    apiClient.get('/orders/report', { params }),

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

  getCrossBorderDocs: (orderId: string) =>
    apiClient.get(`/orders/${orderId}/cross-border-docs`),

  uploadCrossBorderDoc: (orderId: string, data: { document_type: string; file_base64: string; notes?: string }) =>
    apiClient.post(`/orders/${orderId}/cross-border-doc`, data),
  // Allow shippers to review their own uploaded documents
  shipperReviewCrossBorderDoc: (orderId: string, docId: string | number, data: { action: string; review_notes?: string }) =>
    apiClient.put(`/orders/${orderId}/cross-border-docs/${docId}/review`, data),
}

// ─── Driver API ───────────────────────────────────────────────────────────────
export const driverApi = {
  pingLocation: (data: { lat: number; lng: number; order_id?: string; heading?: number; speed_kmh?: number }) =>
    apiClient.post('/driver/location', data),

  getReport: (params?: { from?: string; to?: string }) =>
    apiClient.get('/driver/report', { params }),

  listJobs: (params?: { status?: string }) =>
    apiClient.get('/driver/jobs', { params: { ...(params ?? {}), _ts: Date.now() } }),

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

  uploadCrossBorderDoc: (jobId: string, data: { document_type: string; file_base64: string; notes?: string }) =>
    apiClient.post(`/driver/jobs/${jobId}/cross-border-doc`, data),
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

  /**
   * Correct the distance and base fare on one order. Requires order
   * management permission; the price is recalculated server-side.
   */
  updateOrderPricing: (id: string, data: { distance_km?: number; base_fare?: number; notes?: string }) =>
    apiClient.patch(`/admin/orders/${id}/pricing`, data),

  /** Permanently delete a cancelled order for everyone. Super admin only. */
  deleteOrder: (id: string) =>
    apiClient.delete(`/admin/orders/${id}`),

  /** Register a Car Owner (role 6) on their behalf. Needs users.manage. */
  createCarOwner: (data: {
    first_name: string; last_name?: string
    phone_number: string; email?: string; password: string
  }) => apiClient.post('/admin/users/car-owner', data),

  /** What deleting this account would remove — shown before confirming. */
  getUserDeletionImpact: (id: string) =>
    apiClient.get(`/admin/users/${id}/deletion-impact`),

  /**
   * Permanently delete an account. Super admin only.
   * `deleteOrders` also erases the orders of a shipper/driver instead of
   * keeping them as records with no owner.
   */
  deleteUser: (id: string, deleteOrders = false) =>
    apiClient.delete(`/admin/users/${id}${deleteOrders ? '?delete_orders=1' : ''}`),

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
    is_cross_border?: boolean
    pickup_country_id?: number
    delivery_country_id?: number
    hs_code?: string
    shipper_tin?: string
  }) => apiClient.post('/admin/orders', data),

  getLiveDrivers: () =>
    apiClient.get('/admin/drivers/live'),

  getGuestOrders: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
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

  // ── Vehicle Types (8.4) ──────────────────────────────────────────────────
  listVehicleTypes: () =>
    apiClient.get('/admin/vehicle-types'),
  createVehicleType: (data: { name: string; max_capacity_kg?: number; icon?: string; icon_data?: string; is_active?: boolean; sort_order?: number }) =>
    apiClient.post('/admin/vehicle-types', data),
  updateVehicleType: (id: number, data: { name?: string; max_capacity_kg?: number; icon?: string | null; icon_data?: string; icon_url?: null; is_active?: boolean; sort_order?: number }) =>
    apiClient.put(`/admin/vehicle-types/${id}`, data),

  // ── Countries (8.1) ───────────────────────────────────────────────────────
  listCountries: () =>
    apiClient.get('/admin/countries'),
  createCountry: (data: { name: string; iso_code: string; is_active?: boolean }) =>
    apiClient.post('/admin/countries', data),
  updateCountry: (id: number, data: { name?: string; iso_code?: string; is_active?: boolean }) =>
    apiClient.put(`/admin/countries/${id}`, data),

  // ── System Config (8.3) ───────────────────────────────────────────────────
  getSystemConfig: () =>
    apiClient.get('/admin/system-config'),
  updateSystemConfig: (data: { maintenance_mode?: boolean; maintenance_message?: string; app_version?: string; phone_otp_enabled?: boolean }) =>
    apiClient.put('/admin/system-config', data),

  getSmsSettings: () =>
    apiClient.get('/admin/settings/sms'),

  updateSmsSettings: (data: { api_key?: string; sender_id?: string; base_url?: string; is_enabled?: boolean }) =>
    apiClient.put('/admin/settings/sms', data),

  /** Send one real SMS to prove the provider setup. Costs one credit. */
  testSms: (phone_number: string) =>
    apiClient.post('/admin/settings/sms/test', { phone_number }),

  /** Register a driver on their behalf. Documents optional; password is texted. */
  createDriver: (data: {
    first_name: string; last_name?: string; phone_number: string; email?: string
    national_id?: string; license?: string; libre?: string
  }) => apiClient.post('/admin/users/driver', data),

  /**
   * Assignable drivers, each carrying the truck they are currently on — resolved
   * across the platform fleet, car owners and companies. Vehicle auto-fill reads
   * this; the old platform-only list could never match a company truck.
   */
  driversForDispatch: (search?: string) =>
    apiClient.get('/admin/drivers-for-dispatch', { params: search ? { search } : undefined }),

  /** Every truck that may carry an order, all three fleets. Powers the override. */
  vehiclesForDispatch: () => apiClient.get('/admin/vehicles-for-dispatch'),

  /** Issue a fresh password and text it again. */
  resendDriverCredentials: (id: string) =>
    apiClient.post(`/admin/users/driver/${id}/resend-credentials`, {}),

  // ── RBAC Role Management (9.4) ───────────────────────────────────────────
  getMyPermissions: () =>
    apiClient.get('/admin/me/permissions'),
  getStaffRoles: () =>
    apiClient.get('/admin/staff-roles'),
  getRoleManagement: () =>
    apiClient.get('/admin/role-management'),
  updateRolePermissions: (roleId: number, permissions: string[]) =>
    apiClient.put(`/admin/roles/${roleId}/permissions`, { permissions }),
  createRole: (data: { role_name: string; description?: string }) =>
    apiClient.post('/admin/roles', data),
  deleteRole: (id: number) =>
    apiClient.delete(`/admin/roles/${id}`),

  // ── Security Events (Module 9) ───────────────────────────────────────────
  getSecurityEvents: (params?: { page?: number; limit?: number; event_type?: string; role_id?: number }) =>
    apiClient.get('/admin/security-events', { params }),

  // ── Cross-Border & Customs (Module 10) ──────────────────────────────────
  getCrossBorderOrders: (params?: { status?: string; page?: number; limit?: number }) =>
    apiClient.get('/admin/cross-border/orders', { params }),

  getOrderCrossBorderDocs: (orderId: string) =>
    apiClient.get(`/admin/orders/${orderId}/cross-border-docs`),

  reviewCrossBorderDoc: (orderId: string, docId: string | number, data: { action: string; review_notes?: string }) =>
    apiClient.put(`/admin/orders/${orderId}/cross-border-docs/${docId}`, data),

  updateOrderBorderInfo: (orderId: string, data: { border_crossing_ref?: string; customs_declaration_ref?: string; hs_code?: string; shipper_tin?: string }) =>
    apiClient.patch(`/admin/orders/${orderId}/border-info`, data),

  submitToEsw: (orderId: string) =>
    apiClient.post(`/admin/orders/${orderId}/esw/submit`, {}),

  /** Collect the shipper's payment for a delivered order and complete it. */
  collectOrderPayment: (orderId: string, data: {
    method: 'WALLET' | 'MANUAL'
    amount?: number
    payer_phone?: string
    receipt_base64?: string
    note?: string
  }) => apiClient.post(`/admin/orders/${orderId}/collect-payment`, data),

  payDriverWallet: (orderId: string, data: { gross_amount: number; commission_type: 'PERCENT' | 'FIXED' | 'NONE'; commission_value: number; note?: string }) =>
    apiClient.post(`/admin/orders/${orderId}/pay-driver`, data),

  bankTransferDriver: (orderId: string, data: { amount: number; receipt_base64?: string; note?: string }) =>
    apiClient.post(`/admin/orders/${orderId}/bank-transfer`, data),

  getOrderDriverPayments: (orderId: string) =>
    apiClient.get(`/admin/orders/${orderId}/driver-payments`),

  // ── Company Contact & AI Settings ────────────────────────────────────────
  getContactInfo: () =>
    apiClient.get('/admin/settings/contact'),

  updateContactInfo: (data: {
    phone1?: string; phone2?: string; email1?: string; email2?: string; po_box?: string
    youtube_url?: string; tiktok_url?: string; facebook_url?: string; instagram_url?: string; x_url?: string
    linkedin_url?: string; whatsapp_number?: string; whatsapp_url?: string; telegram_url?: string
  }) => apiClient.put('/admin/settings/contact', data),

  getAiSettings: () =>
    apiClient.get('/admin/settings/ai'),

  updateAiSettings: (data: { ai_enabled?: boolean; customer_id?: string; api_key?: string }) =>
    apiClient.put('/admin/settings/ai', data),

  // ── Company bank accounts shown in shipper/driver Add Funds ────────────
  listBankAccounts: () =>
    apiClient.get('/admin/bank-accounts'),

  createBankAccount: (data: {
    bank_name: string; account_number: string; account_holder_name: string
    description?: string; is_active?: boolean; logo_base64?: string
  }) => apiClient.post('/admin/bank-accounts', data),

  updateBankAccount: (id: number, data: {
    bank_name?: string; account_number?: string; account_holder_name?: string
    description?: string; is_active?: boolean; logo_base64?: string; remove_logo?: boolean
  }) => apiClient.put(`/admin/bank-accounts/${id}`, data),

  deleteBankAccount: (id: number) =>
    apiClient.delete(`/admin/bank-accounts/${id}`),

  // ── Public Documentation Library ────────────────────────────────────────
  listDocumentation: () =>
    apiClient.get('/admin/documentation'),

  createDocumentation: (data: {
    title: string; link_url: string; description?: string; is_active?: boolean; image_base64?: string
  }) => apiClient.post('/admin/documentation', data),

  updateDocumentation: (id: number, data: {
    title?: string; link_url?: string; description?: string; is_active?: boolean
    image_base64?: string; remove_image?: boolean
  }) => apiClient.put(`/admin/documentation/${id}`, data),

  deleteDocumentation: (id: number) =>
    apiClient.delete(`/admin/documentation/${id}`),

  // ── Withdrawal Requests ───────────────────────────────────────────────────
  listWithdrawalRequests: (params?: { status?: string; limit?: number; offset?: number }) =>
    apiClient.get('/admin/withdrawal-requests', { params }),

  approveWithdrawal: (requestId: string, data: { approved_amount: number; admin_note?: string; admin_image_base64?: string; commission_rate?: number }) =>
    apiClient.post(`/admin/withdrawal-requests/${requestId}/approve`, data),

  rejectWithdrawal: (requestId: string, data: { reason: string }) =>
    apiClient.post(`/admin/withdrawal-requests/${requestId}/reject`, data),
}

// ─── Wallet / Withdrawal API (authenticated user) ─────────────────────────────
export const walletApi = {
  getWallet: () =>
    apiClient.get('/profile/wallet'),

  getTransactions: (params?: { limit?: number; offset?: number }) =>
    apiClient.get('/profile/wallet/transactions', { params }),

  getBankAccounts: () =>
    apiClient.get('/profile/wallet/bank-accounts'),

  submitWithdrawal: (data: {
    amount: number
    bank_details: { bank_name: string; account_number: string; account_name: string; method?: string }
    notes?: string
    proof_image_base64?: string
  }) => apiClient.post('/profile/wallet/withdrawal', data),

  getMyWithdrawals: (params?: { limit?: number; offset?: number }) =>
    apiClient.get('/profile/wallet/withdrawals', { params }),

  getDriverOrderPayments: () =>
    apiClient.get('/profile/driver/order-payments'),
}

// ─── AI Assistant API (authenticated shipper/driver) ───────────────────────
export const assistantApi = {
  ask: (data: { question: string; session_id?: number; user_name?: string; user_role?: string }) =>
    apiClient.post('/profile/assistant/ask', data),
}

// ─── Public Config API (no auth required) ────────────────────────────────────
export const configApi = {
  getVehicleTypes: () =>
    apiClient.get('/config/vehicle-types'),
  getCountries: () =>
    apiClient.get('/config/countries'),
  getMaintenance: () =>
    apiClient.get('/config/maintenance'),
  getAuthOptions: () =>
    apiClient.get('/config/auth-options'),
  getContactInfo: () =>
    apiClient.get('/config/contact-info'),
  getDocumentation: () =>
    apiClient.get('/config/documentation'),
  getAiStatus: () =>
    apiClient.get('/config/ai-status'),
  // Public marketing contact form → stores a submission and notifies admins.
  submitContact: (data: { name: string; request: string; email: string; phone: string }) =>
    apiClient.post('/config/contact-message', data),
}

// ─── Car Owner API ────────────────────────────────────────────────────────────
export const carOwnerApi = {
  listVehicles: () =>
    apiClient.get('/car-owner/vehicles'),
  getVehicle: (id: string) =>
    apiClient.get(`/car-owner/vehicles/${id}`),
  /** Owner sets their own availability: active / inactive / maintenance / retired. */
  setOperationalStatus: (
    vehicleId: string,
    operational_status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE',
    note?: string,
  ) => apiClient.patch(`/car-owner/vehicles/${vehicleId}/operational-status`, { operational_status, note }),

  registerVehicle: (data: {
    plate_number: string; vehicle_type: string; model?: string;
    color?: string; year?: number; max_capacity_kg?: number; description?: string
    vehicle_photo?: string; vehicle_images?: string[]; libre_file?: string
  }) => apiClient.post('/car-owner/vehicles', data),
  deleteVehicle: (id: string) =>
    apiClient.delete(`/car-owner/vehicles/${id}`),
  listEligibleDrivers: (vehicleId: string) =>
    apiClient.get(`/car-owner/vehicles/${vehicleId}/eligible-drivers`),
  assignDriver: (vehicleId: string, driverId: string | null) =>
    apiClient.patch(`/car-owner/vehicles/${vehicleId}/assign-driver`, { driver_id: driverId }),
}

// ─── Company Portal API ───────────────────────────────────────────────────────
// What a transport company does for itself. Everything is scoped server-side to
// the company behind the session — no company id is ever sent from here, because
// one that could be sent could be changed.
export const companyApi = {
  /** 403 with code INDIVIDUAL_CAR_OWNER means this login is not a company. */
  profile: () => apiClient.get('/company/profile'),

  /** Overview counts plus the specific rows needing attention, in one call. */
  dashboard: () => apiClient.get('/company/dashboard'),

  listVehicles: (params?: {
    page?: number; limit?: number; search?: string
    status?: string; operational_status?: string; assigned?: 'yes' | 'no'
    sort?: string; direction?: 'ASC' | 'DESC'
  }) => apiClient.get('/company/vehicles', { params }),

  /** Created PENDING — usable for dispatch only once an admin approves it. */
  createVehicle: (data: {
    plate_number: string; vehicle_type: string; model?: string
    color?: string; year?: number; max_capacity_kg?: number; description?: string
    vehicle_photo?: string; vehicle_images?: string[]; libre_file?: string
  }) => apiClient.post('/company/vehicles', data),

  updateVehicle: (id: string, data: Record<string, any>) =>
    apiClient.patch(`/company/vehicles/${id}`, data),

  /** No approval step — the company knows when its own truck is off the road. */
  setOperationalStatus: (
    id: string,
    operational_status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE',
    note?: string,
  ) => apiClient.patch(`/company/vehicles/${id}/operational-status`, { operational_status, note }),

  deleteVehicle: (id: string) => apiClient.delete(`/company/vehicles/${id}`),

  listEligibleDrivers: (vehicleId: string) =>
    apiClient.get(`/company/vehicles/${vehicleId}/eligible-drivers`),

  assignDriver: (vehicleId: string, driverId: string | null) =>
    apiClient.patch(`/company/vehicles/${vehicleId}/assign-driver`, { driver_id: driverId }),

  listDrivers: (params?: { page?: number; limit?: number; search?: string; verified?: 'yes' | 'no' }) =>
    apiClient.get('/company/drivers', { params }),

  /** They can sign in at once, but cannot drive until an admin verifies them. */
  createDriver: (data: {
    first_name: string; last_name?: string; phone_number: string; email?: string
    national_id?: string; license?: string; libre?: string
  }) => apiClient.post('/company/drivers', data),

  updateDriver: (id: string, data: { first_name?: string; last_name?: string; email?: string }) =>
    apiClient.patch(`/company/drivers/${id}`, data),

  /** Takes them off the roster; the person's account is kept. */
  removeDriver: (id: string) => apiClient.delete(`/company/drivers/${id}`),
}

// ─── Admin Car Owner API ──────────────────────────────────────────────────────
export const adminCarOwnerApi = {
  listVehicles: () =>
    apiClient.get('/admin/car-owner-vehicles'),
  reviewVehicle: (id: string, data: { action: 'APPROVED' | 'REJECTED'; admin_note?: string }) =>
    apiClient.patch(`/admin/car-owner-vehicles/${id}/review`, data),
  assignDriver: (id: string, driver_id: string | null) =>
    apiClient.patch(`/admin/car-owner-vehicles/${id}/assign-driver`, { driver_id }),
  listDriversForAssign: () =>
    apiClient.get('/admin/drivers-for-car-assign'),
}

// ─── Admin: Transport Companies ───────────────────────────────────────────────
export const adminCompanyApi = {
  list: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
    apiClient.get('/admin/companies', { params }),

  get: (id: string) => apiClient.get(`/admin/companies/${id}`),

  /** Creates the company and its login together; the password is texted. */
  create: (data: {
    company_name: string; legal_name?: string; tin_number?: string
    license_number?: string; city?: string; address_line?: string
    first_name: string; last_name?: string; phone_number: string; email?: string
  }) => apiClient.post('/admin/companies', data),

  update: (id: string, data: Record<string, string>) =>
    apiClient.patch(`/admin/companies/${id}`, data),

  review: (id: string, data: { action: 'APPROVED' | 'REJECTED' | 'SUSPENDED'; admin_note?: string }) =>
    apiClient.patch(`/admin/companies/${id}/review`, data),

  resendCredentials: (id: string) =>
    apiClient.post(`/admin/companies/${id}/resend-credentials`, {}),

  /** What deleting this company would destroy — shown before confirming. */
  deletionImpact: (id: string) =>
    apiClient.get(`/admin/companies/${id}/deletion-impact`),

  /** Deletes the company, every vehicle it owns, and its login. Irreversible. */
  remove: (id: string) => apiClient.delete(`/admin/companies/${id}`),

  /** Profile plus fleet and roster counts, for the company detail screen. */
  overview: (id: string) => apiClient.get(`/admin/companies/${id}/overview`),
}

// ─── Admin: Company Drivers ───────────────────────────────────────────────────
// A company driver is an ordinary role-3 driver carrying a company_id, which is
// why they stay dispatchable everywhere else in the system.
export const adminCompanyDriverApi = {
  list: (params?: { page?: number; limit?: number; search?: string; company_id?: string; status?: string }) =>
    apiClient.get('/admin/company-drivers', { params }),

  /** Registered active and verified on the spot; the password is texted. */
  create: (data: {
    company_id: string
    first_name: string; last_name?: string; phone_number: string; email?: string
    national_id?: string; license?: string; libre?: string
  }) => apiClient.post('/admin/company-drivers', data),

  update: (id: string, data: { first_name?: string; last_name?: string; email?: string; company_id?: string }) =>
    apiClient.patch(`/admin/company-drivers/${id}`, data),

  resendCredentials: (id: string) =>
    apiClient.post(`/admin/company-drivers/${id}/resend-credentials`, {}),

  /** Takes them off the roster but keeps the account and its history. */
  detach: (id: string) => apiClient.delete(`/admin/company-drivers/${id}`),

  /** Deletes the person entirely. Super admin only. */
  purge: (id: string) => apiClient.delete(`/admin/company-drivers/${id}`, { params: { mode: 'purge' } }),
}

// ─── Admin: Company Vehicles ──────────────────────────────────────────────────
export const adminCompanyVehicleApi = {
  list: (params?: {
    page?: number; limit?: number; search?: string
    company_id?: string; status?: string; operational_status?: string
  }) => apiClient.get('/admin/company-vehicles', { params }),

  create: (data: {
    company_id: string; plate_number: string; vehicle_type: string
    model?: string; color?: string; year?: number; max_capacity_kg?: number; description?: string
    vehicle_photo?: string; vehicle_images?: string[]; libre_file?: string
  }) => apiClient.post('/admin/company-vehicles', data),

  review: (id: string, data: { action: 'APPROVED' | 'REJECTED'; admin_note?: string }) =>
    apiClient.patch(`/admin/company-vehicles/${id}/review`, data),

  setOperationalStatus: (id: string, operational_status: string, note?: string) =>
    apiClient.patch(`/admin/company-vehicles/${id}/operational-status`, { operational_status, note }),

  assignDriver: (id: string, driver_id: string | null) =>
    apiClient.patch(`/admin/company-vehicles/${id}/assign-driver`, { driver_id }),

  remove: (id: string) => apiClient.delete(`/admin/company-vehicles/${id}`),
}
