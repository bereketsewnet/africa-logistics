import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Apply saved theme immediately so the splash screen respects user preference.
// Wrapped: localStorage throws outright in privacy modes that block site data, and
// an exception here runs before React mounts — it would take the whole app down
// rather than merely losing a theme preference.
;(function initTheme() {
  let stored: string | null = null
  try {
    stored =
      localStorage.getItem('admin-theme') ??
      localStorage.getItem('car-theme') ??
      localStorage.getItem('login-theme')
  } catch { /* no stored preference available — fall through to the light default */ }
  document.documentElement.setAttribute('data-theme', (stored ?? 'light').toLowerCase())
})()
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
