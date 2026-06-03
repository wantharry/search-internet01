import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      base: '/static/',
      scope: '/static/',
      manifest: {
        name: 'PulseWire',
        short_name: 'PulseWire',
        description: 'AI-powered live news reader',
        start_url: '/static/',
        scope: '/static/',
        display: 'standalone',
        background_color: '#07090f',
        theme_color: '#818cf8',
        orientation: 'portrait-primary',
        icons: [
          { src: '/static/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/static/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache live news API responses for 5 min offline fallback
            urlPattern: /\/live\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'live-api-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  base: '/static/',
  server: {
    proxy: {
      '/search': 'http://localhost:8000',
      '/live': 'http://localhost:8000',
      '/models': 'http://localhost:8000',
      '/providers': 'http://localhost:8000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
