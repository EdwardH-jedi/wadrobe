import { describe, expect, it } from 'vitest'
import {
  initialPersistenceState,
  needsAttention,
  persistenceLabel,
  persistenceReducer,
  type PersistenceState,
} from './persistenceStatus'

const run = (
  events: Parameters<typeof persistenceReducer>[1][],
  from: PersistenceState = initialPersistenceState,
) => events.reduce(persistenceReducer, from)

describe('persistenceReducer', () => {
  it('starts idle with nothing in flight', () => {
    expect(initialPersistenceState).toEqual({
      status: 'idle',
      pending: 0,
      lastSavedAt: null,
      lastError: null,
      lastErrorKind: null,
      failedSlices: [],
      degraded: false,
    })
  })

  it('reports saving while a write is in flight, then saved', () => {
    const saving = run([{ type: 'SAVE_STARTED', slice: 'garments' }])
    expect(saving.status).toBe('saving')
    expect(saving.pending).toBe(1)

    const saved = run([{ type: 'SAVE_SUCCEEDED', slice: 'garments', at: 10 }], saving)
    expect(saved.status).toBe('saved')
    expect(saved.pending).toBe(0)
    expect(saved.lastSavedAt).toBe(10)
  })

  it('stays "saving" until every concurrent write is acknowledged', () => {
    // Three effects (garments, outfits, current outfit) can write at once.
    const state = run([
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_SUCCEEDED', slice: 'garments', at: 1 },
      { type: 'SAVE_SUCCEEDED', slice: 'garments', at: 2 },
    ])
    expect(state.status).toBe('saving')
    expect(state.pending).toBe(1)

    const done = run([{ type: 'SAVE_SUCCEEDED', slice: 'garments', at: 3 }], state)
    expect(done.status).toBe('saved')
    expect(done.pending).toBe(0)
  })

  it('surfaces a rejected write instead of swallowing it', () => {
    const failed = run([
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_FAILED', slice: 'garments', at: 5, error: 'QuotaExceededError' },
    ])
    expect(failed.status).toBe('failed')
    expect(failed.lastError).toBe('QuotaExceededError')
    expect(needsAttention(failed)).toBe(true)
  })

  it('keeps reporting failure while other writes are still in flight', () => {
    // A later success must not quietly mask an earlier failure...
    const state = run([
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_FAILED', slice: 'garments', at: 5, error: 'boom' },
    ])
    expect(state.status).toBe('failed')
    expect(state.pending).toBe(1)
  })

  it('clears the error once a later write is acknowledged', () => {
    // ...but once the store answers again, the archive is durable, so the
    // warning should go away rather than persist for the session.
    const recovered = run([
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_FAILED', slice: 'garments', at: 5, error: 'boom' },
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_SUCCEEDED', slice: 'garments', at: 6 },
    ])
    expect(recovered.status).toBe('saved')
    expect(recovered.lastError).toBeNull()
  })

  it('never reports a memory-backed store as saved', () => {
    const state = run([
      { type: 'BACKEND_RESOLVED', backend: 'memory' },
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_SUCCEEDED', slice: 'garments', at: 7 },
    ])
    expect(state.status).toBe('degraded')
    expect(state.lastSavedAt).toBe(7)
    expect(needsAttention(state)).toBe(true)
  })

  it('leaves durable backends alone', () => {
    for (const backend of ['indexeddb', 'localstorage'] as const) {
      const state = run([
        { type: 'BACKEND_RESOLVED', backend },
        { type: 'SAVE_STARTED', slice: 'garments' },
        { type: 'SAVE_SUCCEEDED', slice: 'garments', at: 1 },
      ])
      expect(state.status).toBe('saved')
      expect(needsAttention(state)).toBe(false)
    }
  })

  it('lets a failure outrank a degraded store', () => {
    const state = run([
      { type: 'BACKEND_RESOLVED', backend: 'memory' },
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_FAILED', slice: 'garments', at: 2, error: 'nope' },
    ])
    expect(state.status).toBe('failed')
  })

  it('never lets pending go negative', () => {
    const state = run([{ type: 'SAVE_SUCCEEDED', slice: 'garments', at: 1 }])
    expect(state.pending).toBe(0)
  })

  it('does NOT let one slice succeeding mask another slice failing', () => {
    // The regression this module exists for: all three effects fire together on
    // hydrate. A successful currentOutfit write must not clear a failed
    // garments write, or the user is told "Saved" while their wardrobe is not.
    const state = run([
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_STARTED', slice: 'currentOutfit' },
      { type: 'SAVE_FAILED', slice: 'garments', at: 1, error: 'quota' },
      { type: 'SAVE_SUCCEEDED', slice: 'currentOutfit', at: 2 },
    ])
    expect(state.status).toBe('failed')
    expect(state.failedSlices).toEqual(['garments'])
    expect(state.lastError).toBe('quota')

    // Only the garments slice recovering clears it.
    const healed = run(
      [
        { type: 'SAVE_STARTED', slice: 'garments' },
        { type: 'SAVE_SUCCEEDED', slice: 'garments', at: 3 },
      ],
      state,
    )
    expect(healed.status).toBe('saved')
    expect(healed.failedSlices).toEqual([])
    expect(healed.lastError).toBeNull()
  })

  it('records a failing slice only once', () => {
    const state = run([
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_FAILED', slice: 'garments', at: 1, error: 'a' },
      { type: 'SAVE_STARTED', slice: 'garments' },
      { type: 'SAVE_FAILED', slice: 'garments', at: 2, error: 'b' },
    ])
    expect(state.failedSlices).toEqual(['garments'])
    expect(state.lastError).toBe('b')
  })

  it('labels every status', () => {
    const statuses = ['idle', 'saving', 'saved', 'degraded', 'failed'] as const
    for (const status of statuses) {
      const label = persistenceLabel({ ...initialPersistenceState, status })
      expect(label.length).toBeGreaterThan(0)
    }
    expect(persistenceLabel({ ...initialPersistenceState, status: 'saved' })).toMatch(
      /saved/i,
    )
    expect(persistenceLabel({ ...initialPersistenceState, status: 'failed' })).toMatch(
      /failed/i,
    )
  })
})
