import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../lib/authStore'

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const fetchMe = useAuthStore(s => s.fetchMe)
  const [loading, setLoading] = useState(!user && isAuthenticated)

  useEffect(() => {
    // On refresh: token exists but user object may not be in store yet — fetch it
    if (isAuthenticated && !user) {
      fetchMe().finally(() => setLoading(false))
    }
  }, [isAuthenticated, user, fetchMe])

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className="text-gray-400 text-sm animate-pulse">Loading…</div>
    </div>
  )
  // After loading is done, now check role
  if (user && user.role !== 'admin') return <Navigate to="/dashboard" replace />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
