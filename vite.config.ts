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
    // Playwright drives the real browser suite; keep it out of the unit run.
    exclude: ['e2e/**', 'node_modules/**'],
    poolOptions: {
      // Node 22 shipped a built-in Web Storage implementation and Node 25 has
      // it on by default, so `globalThis.localStorage` exists *before* jsdom
      // installs its own. jsdom cannot replace a global Node already owns, so
      // `window.localStorage` resolves to Node's object — which is not a
      // `Storage`: no `clear`, no `setItem`. Every storage test then dies with
      // `TypeError: localStorage.clear is not a function`, pointing at the test
      // rather than at the runtime.
      //
      // Turning Node's implementation off is what lets jsdom's through. It
      // lives here, not in an npm script, so `npm test`, `npx vitest` and an
      // IDE runner all get it — a fix that only works through one entry point
      // is how this class of bug survives.
      forks: { execArgv: ['--no-experimental-webstorage'] },
      threads: { execArgv: ['--no-experimental-webstorage'] },
    },
  },
})
