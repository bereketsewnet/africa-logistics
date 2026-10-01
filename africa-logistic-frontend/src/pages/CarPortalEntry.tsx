import { Suspense } from 'react'
import { lazyWithReload } from '../lib/lazyWithReload'
import { useAuth } from '../context/AuthContext'
import ErrorBoundary from '../components/ErrorBoundary'

/**
 * Decides which car portal a role-6 login gets.
 *
 * Role 6 is both individual car owners and transport companies, and they need
 * genuinely different screens: an individual has a handful of trucks on one
 * scrolling page, a company can have hundreds and needs paging, search and a
 * driver roster.
 *
 * This component is the ONLY place that branch happens. The three role→portal
 * sites (App.tsx, ProtectedRoute, LoginPage) still send every role-6 user to
 * /car-dashboard and are deliberately untouched — changing any of them would
 * lock out every existing car owner.
 *
 * It fails safe: anything other than a confirmed company id renders the
 * individual dashboard, which is the screen that already works.
 */
const CarOwnerDashboard = lazyWithReload(() => import('./CarOwnerDashboard'))
const CompanyDashboard = lazyWithReload(() => import('./company/CompanyDashboard'))

export default function CarPortalEntry() {
  const { user } = useAuth()
  const isCompany = Boolean(user?.company_id)

  return (
    <ErrorBoundary title="This dashboard could not load" showSignIn={false}>
    <Suspense fallback={
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', color: 'var(--clr-muted)', fontSize: '0.9rem' }}>
        Loading…
      </div>
    }>
      {isCompany ? <CompanyDashboard /> : <CarOwnerDashboard />}
    </Suspense>
    </ErrorBoundary>
  )
}
