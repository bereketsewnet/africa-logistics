/**
 * Auth Context (src/context/AuthContext.tsx)
 *
 * Global authentication state management using React Context.
 *
 * Provides the entire app with:
 *  - `user`      — the logged-in user's profile (or null)
 *  - `token`     — the JWT string (or null)
 *  - `isLoading` — true while checking if a stored token is still valid
 *  - `login(token)` — saves token, fetches user profile, updates state
 *  - `logout()`     — clears token and user state, redirects to /login
 *
 * How it works:
 *  1. On app mount, it checks localStorage for a saved token
 *  2. If found, it calls GET /api/auth/me to verify the token is still valid
 *  3. If valid, user is auto-logged-in without needing to re-enter credentials
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import apiClient from '../lib/apiClient'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id:                string
  phone_number:      string
  role_id:           number
  role_name?:        string
  first_name:        string
  last_name:         string
  email?:            string | null
  profile_photo_url?: string | null
  is_active:         number
  is_email_verified?: number
  is_phone_verified?: number
  theme_preference?: 'LIGHT' | 'DARK' | 'SYSTEM'
}

interface AuthContextType {
  user:        AuthUser | null
  token:       string | null
  isLoading:   boolean
  login:       (token: string) => Promise<void>
  logout:      () => void
  refreshUser: () => Promise<void>
  updateUser:  (partial: Partial<AuthUser>) => void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null)
  const [token,     setToken]     = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true) // Start true — checking stored token

  /**
   * Fetch the user's profile from /api/auth/me using the current token.
   * The apiClient interceptor automatically attaches the token from localStorage.
   */
  const fetchMe = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/auth/me')
      setUser(data.user)
    } catch {
      localStorage.removeItem('auth_token')
      setToken(null)
      setUser(null)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    await fetchMe()
  }, [fetchMe])

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    setUser(prev => prev ? { ...prev, ...partial } : prev)
  }, [])

  // On mount: check if a valid token is stored and rehydrate user state
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token')
    if (storedToken) {
      setToken(storedToken)
      fetchMe().finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [fetchMe])

  /**
   * Call this after a successful login or registration.
   * Saves the token and fetches the user profile.
   */
  const login = useCallback(async (newToken: string) => {
    localStorage.setItem('auth_token', newToken)
    setToken(newToken)
    await fetchMe()
  }, [fetchMe])

  /**
   * Clears all auth state and token from storage.
   */
  const logout = useCallback(() => {
    localStorage.removeItem('auth_token')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useAuth — the hook to access auth state in any component.
 *
 * Usage:
 *   const { user, login, logout, isLoading } = useAuth()
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>. Check your main.tsx.')
  }
  return context
}
