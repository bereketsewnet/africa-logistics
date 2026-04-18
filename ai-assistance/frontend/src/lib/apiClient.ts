import axios from 'axios'

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const apiUrl = (path: string) => `${BASE_URL}${path}`

export const apiClient = axios.create({
  baseURL: BASE_URL || undefined,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request from localStorage
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('bemnet_token')
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// API-key-authenticated client (used for /api/ask, /api/sessions)
export const apiKeyClient = axios.create({
  baseURL: BASE_URL || undefined,
  headers: { 'Content-Type': 'application/json' },
})

apiKeyClient.interceptors.request.use((config) => {
  const key = localStorage.getItem('bemnet_api_key')
  if (key) {
    config.headers['Authorization'] = `Bearer ${key}`
  }
  return config
})
