import { create } from 'zustand'
import { apiClient } from './apiClient'

interface UserInfo {
  id: number
  customer_id: string
  name: string
  email: string
  role: string
  status: string
}

interface AuthState {
  token: string | null
  user: UserInfo | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('bemnet_token'),
  user: (() => {
    try {
      const raw = localStorage.getItem('bemnet_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })(),
  isAuthenticated: !!localStorage.getItem('bemnet_token'),

  login: async (email, password) => {
    const res = await apiClient.post('/auth/login', { email, password })
    const { access_token, user } = res.data
    localStorage.setItem('bemnet_token', access_token)
    localStorage.setItem('bemnet_user', JSON.stringify(user))
    set({ token: access_token, user, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('bemnet_token')
    localStorage.removeItem('bemnet_user')
    localStorage.removeItem('bemnet_api_key')
    set({ token: null, user: null, isAuthenticated: false })
  },

  fetchMe: async () => {
    const res = await apiClient.get('/auth/me')
    const user = res.data
    localStorage.setItem('bemnet_user', JSON.stringify(user))
    set({ user })
  },
}))
