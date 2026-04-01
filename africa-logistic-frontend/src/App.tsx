import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage            from './pages/LoginPage'
import RegisterPage         from './pages/RegisterPage'
import DashboardPage        from './pages/DashboardPage'
import AdminDashboardPage   from './pages/AdminDashboardPage'
import ForgotPasswordPage   from './pages/ForgotPasswordPage'
import VerifyEmailPage      from './pages/VerifyEmailPage'
import ProtectedRoute       from './components/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                element={<Navigate to="/login" replace />} />
        <Route path="/login"           element={<LoginPage />} />
        <Route path="/register"        element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/verify-email"    element={<VerifyEmailPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
