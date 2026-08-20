import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ProtectedRoute       from './components/ProtectedRoute'
import { configApi } from './lib/apiClient'

// Keep the first download small: users only fetch the page they visit. Heavy
// dashboard dependencies (maps, charts and PDF generation) are no longer part
// of the public homepage/login startup bundle.
const HomePage = lazy(() => import('./pages/HomePage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'))
const CarOwnerDashboard = lazy(() => import('./pages/CarOwnerDashboard'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'))

function RouteLoader() {
  return (
    <main className="startup-loader" role="status" aria-live="polite">
      <span className="startup-loader__mark" aria-hidden="true">AL</span>
      <span className="startup-loader__spinner" aria-hidden="true" />
      <span className="startup-loader__label">Loading Afri Logistics…</span>
    </main>
  )
}

/**
 * Belt-and-suspenders SEO guard. robots.txt already disallows crawling of
 * every system/auth route, but since this is a single-page app serving one
 * index.html (statically marked "index, follow" for the public homepage),
 * this keeps a <meta name="robots"> in sync with the current route so a
 * crawler that somehow renders a disallowed route still sees "noindex".
 * Purely a meta tag — never touches visible page content.
 */
function RouteSeoGuard() {
  const { pathname } = useLocation()
  useEffect(() => {
    let tag = document.querySelector('meta[name="robots"]')
    if (!tag) {
      tag = document.createElement('meta')
      tag.setAttribute('name', 'robots')
      document.head.appendChild(tag)
    }
    tag.setAttribute('content', pathname === '/' ? 'index, follow, max-image-preview:large' : 'noindex, nofollow')
  }, [pathname])
  return null
}

export default function App() {
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string }>({ enabled: false, message: '' })

  useEffect(() => {
    let alive = true
    const load = () => {
      configApi.getMaintenance()
        .then(r => {
          if (!alive) return
          setMaintenance({
            enabled: !!r.data.maintenance_mode,
            message: r.data.maintenance_message || 'System is under maintenance. Please try again shortly.',
          })
        })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
  if (maintenance.enabled && !isAdminRoute) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 20% 20%, #0f172a 0%, #020617 55%)', color: '#e2e8f0', padding: '1.25rem' }}>
        <div style={{ width: 'min(560px, 100%)', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15,23,42,0.78)', borderRadius: 16, padding: '1.25rem 1.1rem', boxShadow: '0 20px 80px rgba(0,0,0,0.45)' }}>
          <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>System Under Maintenance</h1>
          <p style={{ margin: '0.65rem 0 0', fontSize: '0.92rem', color: '#94a3b8', lineHeight: 1.6 }}>{maintenance.message}</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <RouteSeoGuard />
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/"                element={<HomePage />} />
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-email"    element={<VerifyEmailPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={[2, 3]}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={[1, 4, 5]}>
                <AdminDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/car-dashboard"
            element={
              <ProtectedRoute allowedRoles={[6]}>
                <CarOwnerDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
