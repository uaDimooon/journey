import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Proxy target for /api. Defaults to the dev server; a test frontend can point
// at the test API via VITE_API_TARGET (e.g. http://localhost:8788).
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Installable PWA: web manifest + service worker (offline app shell).
    // The SW only activates over a secure context (HTTPS or localhost); over a
    // plain-HTTP tailnet, iOS "Add to Home Screen" still gives a standalone
    // icon via the Apple meta tags in index.html.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // Don't try to precache the huge pdf.worker chunk.
      workbox: { maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 },
      manifest: {
        name: 'Journey',
        short_name: 'Journey',
        description:
          'Visualize your goals, priorities, and traits on an infinite, zoomable canvas.',
        theme_color: '#0f1115',
        background_color: '#0f1115',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': apiTarget,
    },
  },
})
