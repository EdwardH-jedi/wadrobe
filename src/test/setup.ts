// Global test setup. Adds jest-dom matchers and wires React Testing Library
// cleanup. Cleanup is registered manually because we run Vitest with
// `globals: false`, so testing-library's automatic afterEach is not installed.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// --- Tripwire: the jsdom `localStorage` has to actually be jsdom's ----------
//
// `vite.config.ts` passes `--no-experimental-webstorage` so Node's own Web
// Storage cannot shadow jsdom's. This asserts it worked. It is the tripwire for
// the day that stops working — a Node release that ignores the flag, a runner
// that drops `execArgv`, an IDE that spawns its own worker. It fails once, at
// setup, naming the cause, instead of failing later at whichever line happened
// to touch storage first.
const REQUIRED_STORAGE_METHODS = [
  'clear',
  'getItem',
  'setItem',
  'removeItem',
  'key',
] as const

function assertRealWebStorage(name: 'localStorage' | 'sessionStorage'): void {
  const storage = (globalThis as Record<string, unknown>)[name]
  if (storage == null) {
    throw new Error(
      `[test setup] globalThis.${name} is missing. The jsdom environment did ` +
        `not install it; check \`environment: 'jsdom'\` in vite.config.ts.`,
    )
  }
  const missing = REQUIRED_STORAGE_METHODS.filter(
    (m) => typeof (storage as Record<string, unknown>)[m] !== 'function',
  )
  if (missing.length > 0) {
    throw new Error(
      `[test setup] globalThis.${name} is not a Web Storage — missing ` +
        `${missing.join(', ')}.\nThis is Node's built-in Web Storage shadowing ` +
        `jsdom's (node ${process.version}).\nFix: vite.config.ts must pass ` +
        `--no-experimental-webstorage via test.poolOptions.<pool>.execArgv.`,
    )
  }
}

assertRealWebStorage('localStorage')
assertRealWebStorage('sessionStorage')

afterEach(() => {
  cleanup()
})
