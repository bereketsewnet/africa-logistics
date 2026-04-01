/**
 * Protected Route (src/components/ProtectedRoute.tsx)
 *
 * A wrapper component that guards routes from unauthenticated users.
 *
 * Behavior:
 *  - While auth is loading (checking stored token): shows a spinner
 *  - If user is NOT logged in: redirects to /login
 *  - If user IS logged in: renders the child component normally
 *
 * Usage in App.tsx:
 *   <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
 */

import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth()

  // Show a full-screen spinner while we're verifying the stored JWT
  if (isLoading) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // Not authenticated — redirect to login
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Authenticated — render the protected page
  return <>{children}</>
}
