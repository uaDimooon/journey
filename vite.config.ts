import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy target for /api. Defaults to the dev server; a test frontend can point
// at the test API via VITE_API_TARGET (e.g. http://localhost:8788).
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiTarget,
    },
  },
})
