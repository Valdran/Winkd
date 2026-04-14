import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        app: 'app.html',
        login: 'login.html',
        legacy: 'winkd_website.html',
      },
    },
  },
  server: {
    port: 3000,
    // Core Winkd app entry is app.html (not the React playground at index.html).
    open: '/app.html',
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})
