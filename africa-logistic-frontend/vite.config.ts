import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Tailwind v4 — no config file needed
  ],
  server: {
    // Bind to all interfaces so the VPS serves it on the public IP
    host: '0.0.0.0',
    port: 5174,
    // Allow connections from any host (needed when accessing via VPS IP)
    allowedHosts: ['all'],
  },
  preview: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: ['all'],
  },
})
