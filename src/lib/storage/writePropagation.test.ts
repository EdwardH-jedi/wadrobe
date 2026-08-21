// Writes must PROPAGATE failure. Both adapters used to swallow write errors
// with a console.warn, which is why a full quota could look like a successful
// save: the provider had nothing to catch. Reads stay tolerant on purpose.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalStorageAdapter } from './localStorageFallback'

describe('storage writes propagate failure', () => {
  afterEach(() => vi.restoreAllMocks())

  it('rejects when localStorage refuses the write', async () => {
    const adapter = createLocalStorageAdapter()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new Error('QuotaExceededError')
      err.name = 'QuotaExceededError'
      throw err
    })

    await expect(adapter.saveGarments([])).rejects.toThrow(/quota/i)
  })

  it('still reads tolerantly when the stored value is corrupt', async () => {
    // The asymmetry is deliberate: an unreadable key is a recoverable empty
    // archive, an unwritable key is data the user is about to lose.
    localStorage.setItem('fitarchive:garments', '{not json')
    const adapter = createLocalStorageAdapter()

    const result = await adapter.loadGarmentsResult()
    expect(result.status).toBe('unavailable')
    expect(result.garments).toEqual([])
  })

  it('resolves normally on a healthy write', async () => {
    localStorage.clear()
    const adapter = createLocalStorageAdapter()
    await expect(adapter.saveGarments([])).resolves.toBeUndefined()
  })
})
