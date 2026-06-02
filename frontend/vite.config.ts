import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
