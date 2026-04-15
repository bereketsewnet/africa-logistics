import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'

import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import AdminPage from './pages/AdminPage'

import ChatPage from './pages/dashboard/ChatPage'
import KeysPage from './pages/dashboard/KeysPage'
import UsagePage from './pages/dashboard/UsagePage'
import PlansPage from './pages/dashboard/PlansPage'
import PaymentHistoryPage from './pages/dashboard/PaymentHistoryPage'

import AdminUsersTab from './pages/admin/UsersTab'
import AdminPaymentsTab from './pages/admin/PaymentsTab'
import AdminUsageTab from './pages/admin/UsageTab'
import AdminKeysTab from './pages/admin/KeysTab'
import AdminPlansTab from './pages/admin/PlansTab'
import AdminSessionsTab from './pages/admin/SessionsTab'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* User dashboard */}
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}>
            <Route index element={<Navigate to="chat" replace />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="keys" element={<KeysPage />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="history" element={<PaymentHistoryPage />} />
          </Route>

          {/* Admin */}
          <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>}>
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsersTab />} />
            <Route path="payments" element={<AdminPaymentsTab />} />
            <Route path="usage" element={<AdminUsageTab />} />
            <Route path="keys" element={<AdminKeysTab />} />
            <Route path="plans" element={<AdminPlansTab />} />
            <Route path="sessions" element={<AdminSessionsTab />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}


