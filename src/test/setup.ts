// Global test setup. Adds jest-dom matchers and wires React Testing Library
// cleanup. Cleanup is registered manually because we run Vitest with
// `globals: false`, so testing-library's automatic afterEach is not installed.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// The jsdom `localStorage` has to actually be jsdom's.
//
// Node 22 shipped a built-in Web Storage implementation and Node 25 enables it
// by default, so `globalThis.localStorage` can exist before jsdom installs its
// own — and jsdom cannot replace a global Node already owns. When that happens
// `localStorage` is present but is not a `Storage`: no `clear`, no `setItem`,
// no `getItem`. Every test that touches it dies with
// `TypeError: localStorage.clear is not a function`, pointing at the test
// rather than at the environment, which is a long way from the cause.
//
// `vite.config.ts` prevents it with `--no-experimental-webstorage`. This is the
// tripwire for the day that stops working — a Node release that ignores the
// flag, a runner that drops `execArgv`, an IDE that spawns its own worker. It
// fails once, at setup, naming the cause, instead of seven times at whichever
// line happened to touch storage first.
const REQUIRED_STORAGE_METHODS = ['clear', 'getItem', 'setItem', 'removeItem', 'key'] as const

function assertRealWebStorage(name: 'localStorage' | 'sessionStorage'): void {
  const storage = (globalThis as Record<string, unknown>)[name]
  if (storage == null) {
    throw new Error(
      `[test setup] globalThis.${name} is missing entirely. The jsdom ` +
        `environment did not install it; check \`environment: 'jsdom'\` in vite.config.ts.`,
    )
  }
  const missing = REQUIRED_STORAGE_METHODS.filter(
    (method) => typeof (storage as Record<string, unknown>)[method] !== 'function',
  )
  if (missing.length > 0) {
    throw new Error(
      `[test setup] globalThis.${name} is not a Web Storage — missing ${missing.join(', ')}.\n` +
        `This is almost certainly Node's own built-in localStorage shadowing jsdom's ` +
        `(node ${process.version}).\n` +
        `Fix: vite.config.ts must pass --no-experimental-webstorage via ` +
        `test.poolOptions.<pool>.execArgv. Verify with:\n` +
        `  node --no-experimental-webstorage -e "console.log(typeof localStorage)"  # undefined\n` +
        `  node -e "console.log(typeof localStorage)"                               # object`,
    )
  }
}

assertRealWebStorage('localStorage')
assertRealWebStorage('sessionStorage')

afterEach(() => {
  cleanup()
})
