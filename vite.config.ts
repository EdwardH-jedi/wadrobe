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
    // Builds the Swift verification binary once, in the main process, before
    // any worker starts — so no test calls `swift run` and no two workers
    // contend for the SwiftPM lock. See src/test/wardrobeDomain.ts.
    globalSetup: ['./src/test/globalSetup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    poolOptions: {
      // Node 22 shipped a built-in Web Storage implementation and Node 25 has
      // it on by default, so `globalThis.localStorage` now exists *before*
      // jsdom installs its own. jsdom's environment cannot replace a global
      // Node already owns, so `window.localStorage` resolves to Node's object
      // — which is not a `Storage`: it has no `clear`, no `setItem`, and
      // touching it prints
      //   Warning: `--localstorage-file` was provided without a valid path
      //
      // Measured on node v25.8.0, inside the jsdom environment:
      //   default                       typeof clear = undefined, ctor = undefined
      //   --no-experimental-webstorage  typeof clear = function,  ctor = Storage
      //
      // Turning Node's off is what lets jsdom's real implementation through.
      // It lives here rather than in an npm script so that `npx vitest`,
      // `npm test` and an IDE runner all get it; a fix that only works through
      // one entry point is how this broke in the first place.
      forks: { execArgv: ['--no-experimental-webstorage'] },
      threads: { execArgv: ['--no-experimental-webstorage'] },
    },
  },
})
