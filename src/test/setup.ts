// Global test setup. Adds jest-dom matchers and wires React Testing Library
// cleanup. Cleanup is registered manually because we run Vitest with
// `globals: false`, so testing-library's automatic afterEach is not installed.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

afterEach(() => {
  cleanup()
})
