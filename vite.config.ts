import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vite + Vitest configuration.
// The `test` block is typed via `vitest/config`'s re-exported `defineConfig`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
