import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* AuthProvider wraps the entire app so every component can access auth state */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
