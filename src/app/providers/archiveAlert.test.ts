// The words the app uses when an archive is not safe.
//
// These assertions look pedantic — they check sentences, not state. That is the
// point: every other piece of the persistence work is machinery for DETECTING
// trouble, and machinery that detects trouble silently is worth nothing to the
// person whose wardrobe is at stake. The message is the deliverable, so the
// message is what is tested.
import { describe, expect, it } from 'vitest'
import {
  ArchiveConflictError,
  archiveAlert,
  classifyPersistenceError,
  initialPersistenceState,
  persistenceReducer,
  type PersistenceState,
} from './persistenceStatus'

function failed(kind?: 'quota' | 'conflict' | 'unknown'): PersistenceState {
  return persistenceReducer(
    persistenceReducer(initialPersistenceState, {
      type: 'SAVE_STARTED',
      slice: 'garments',
    }),
    { type: 'SAVE_FAILED', slice: 'garments', at: 1, error: 'boom', kind },
  )
}

describe('classifyPersistenceError', () => {
  it('recognises the conflict this app raises itself', () => {
    expect(classifyPersistenceError(new ArchiveConflictError('stale'))).toBe(
      'conflict',
    )
  })

  it('recognises a full store by DOMException name', () => {
    // What localStorage throws in every browser that matters.
    const quota = Object.assign(new Error('exceeded'), {
      name: 'QuotaExceededError',
    })
    expect(classifyPersistenceError(quota)).toBe('quota')
  })

  it('recognises a full store by legacy numeric code', () => {
    // Older engines report quota with a code and a useless message.
    expect(classifyPersistenceError({ name: 'Error', code: 22 })).toBe('quota')
    expect(classifyPersistenceError({ name: 'Error', code: 1014 })).toBe('quota')
  })

  it('recognises a full store by message when nothing else identifies it', () => {
    // IndexedDB surfaces this as a plain request error on some engines.
    expect(
      classifyPersistenceError(new Error('The quota has been exceeded.')),
    ).toBe('quota')
  })

  it('does not guess: anything unrecognised stays unknown', () => {
    expect(classifyPersistenceError(new Error('disk on fire'))).toBe('unknown')
    expect(classifyPersistenceError(null)).toBe('unknown')
    expect(classifyPersistenceError('nope')).toBe('unknown')
  })
})

describe('archiveAlert', () => {
  it('says nothing while the archive is behaving', () => {
    expect(archiveAlert(initialPersistenceState, { conflict: false })).toBeNull()

    const saved = persistenceReducer(
      persistenceReducer(initialPersistenceState, {
        type: 'SAVE_STARTED',
        slice: 'garments',
      }),
      { type: 'SAVE_SUCCEEDED', slice: 'garments', at: 1 },
    )
    expect(archiveAlert(saved, { conflict: false })).toBeNull()
  })

  it('puts the multi-tab conflict first — it is the one that is losing work now', () => {
    // A refused write sets BOTH conflict and failed. The user must be told one
    // thing, and it has to be the one with an action attached.
    const alert = archiveAlert(failed('conflict'), { conflict: true })
    expect(alert?.kind).toBe('conflict')
    expect(alert?.offerReload).toBe(true)
    expect(alert?.title).toMatch(/another tab/i)
  })

  it('tells the user what to do about a full store, not what the exception was', () => {
    const alert = archiveAlert(failed('quota'), { conflict: false })
    expect(alert?.kind).toBe('quota')
    expect(alert?.detail).toMatch(/export a backup/i)
    // The raw DOMException name must never be the message.
    expect(alert?.title).not.toMatch(/QuotaExceededError|DOMException/)
    expect(alert?.offerReload).toBe(false)
  })

  it('reports an unclassified failure honestly instead of blaming quota', () => {
    const alert = archiveAlert(failed('unknown'), { conflict: false })
    expect(alert?.kind).toBe('failed')
    expect(alert?.detail).toMatch(/export a backup/i)
    expect(alert?.detail).not.toMatch(/full/i)
  })

  it('ranks a wholly unreadable store above a partly unreadable one', () => {
    // Both are "your data is about to be overwritten"; the total case has more
    // at stake and hides better, so it is the one that gets said.
    const alert = archiveAlert(initialPersistenceState, {
      conflict: false,
      storeUnreadable: true,
      unreadableGarments: 3,
    })
    expect(alert?.kind).toBe('store-unreadable')
    expect(alert?.detail).toMatch(/import it from the Closet/i)
  })

  it('reports a partial loss with its count', () => {
    const one = archiveAlert(initialPersistenceState, {
      conflict: false,
      unreadableGarments: 1,
    })
    expect(one?.kind).toBe('unreadable')
    expect(one?.title).toMatch(/^One stored piece/)

    const many = archiveAlert(initialPersistenceState, {
      conflict: false,
      unreadableGarments: 4,
    })
    expect(many?.title).toMatch(/^4 stored pieces/)
  })

  it('warns about a non-durable store before anything is lost', () => {
    const memory = persistenceReducer(initialPersistenceState, {
      type: 'BACKEND_RESOLVED',
      backend: 'memory',
    })
    const alert = archiveAlert(memory, { conflict: false })
    expect(alert?.kind).toBe('degraded')
    expect(alert?.tone).toBe('warning')
    expect(alert?.title).toMatch(/reload/i)
  })

  it('does not warn about localStorage — it is smaller, not disposable', () => {
    const local = persistenceReducer(initialPersistenceState, {
      type: 'BACKEND_RESOLVED',
      backend: 'localstorage',
    })
    expect(archiveAlert(local, { conflict: false })).toBeNull()
  })
})
