import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Apply saved theme immediately so the splash screen respects user preference
;(function initTheme() {
  const stored =
    localStorage.getItem('admin-theme') ??
    localStorage.getItem('car-theme') ??
    localStorage.getItem('login-theme')
  document.documentElement.setAttribute('data-theme', (stored ?? 'light').toLowerCase())
})()
import 'leaflet/dist/leaflet.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { LanguageProvider } from './context/LanguageContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      {/* AuthProvider wraps the entire app so every component can access auth state */}
      <AuthProvider>
        <App />
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
)
