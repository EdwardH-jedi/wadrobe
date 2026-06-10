import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vite + Vitest configuration.
// The `test` block is typed via `vitest/config`'s re-exported `defineConfig`.
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev-only: forward the Track B Proxy 3D Lab API to the local FastAPI
    // backend (backend/README.md). Same-origin from the browser's view, so
    // no CORS configuration is needed on either side.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
