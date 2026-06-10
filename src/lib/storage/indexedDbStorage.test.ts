import { describe, expect, it } from 'vitest'
import {
  isIndexedDbAvailable,
  tryCreateIndexedDbAdapter,
} from './indexedDbStorage'

// jsdom does not implement IndexedDB, so these assert the graceful-degrade path
// the storage facade depends on. The stalled-open() timeout fallback is covered
// by manual reasoning (see indexedDbStorage.ts withTimeout) and is left for a
// dedicated fake-timer pass to avoid flakiness in the unit suite.
describe('IndexedDB availability', () => {
  it('reports IndexedDB as unavailable in the jsdom environment', () => {
    expect(isIndexedDbAvailable()).toBe(false)
  })

  it('resolves to null (no adapter) when IndexedDB is unavailable', async () => {
    await expect(tryCreateIndexedDbAdapter()).resolves.toBeNull()
  })
})
