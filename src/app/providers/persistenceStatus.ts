// Persistence acknowledgement (pure).
//
// Writes used to be fire-and-forget: `void adapter.saveGarments(...)`. A
// rejected write was swallowed, so the UI kept implying an archive was safe
// while nothing had reached disk — the worst failure mode for a local-first app,
// because the user has no server copy to fall back on.
//
// This models the outcome as a small state machine. It is pure and holds no
// timers or promises, so the transitions are unit-testable without faking
// storage; the provider owns the async plumbing and feeds events in.

import type { StorageBackend } from '../../lib/storage/storageTypes'

/** What the UI should tell the user about the durability of their archive. */
export type PersistenceStatus =
  /** Nothing written yet this session. */
  | 'idle'
  /** At least one write is in flight. */
  | 'saving'
  /** Every write so far has been acknowledged by the store. */
  | 'saved'
  /** Writes are landing, but in a store that will not survive a reload. */
  | 'degraded'
  /** A write was rejected. The stored archive may be behind what is on screen. */
  | 'failed'

/**
 * Which slice of the archive a write covers.
 *
 * Failures are tracked PER SLICE. The three persistence effects run
 * independently, so a successful `currentOutfit` write must not clear a failed
 * `garments` write — collapsing them into one flag is exactly how a real
 * failure gets masked, which is the bug this module exists to prevent.
 */
export type PersistenceSlice = 'garments' | 'savedOutfits' | 'currentOutfit'

export interface PersistenceState {
  status: PersistenceStatus
  /** Number of writes currently in flight. */
  pending: number
  /** Epoch ms of the last acknowledged write, or null. */
  lastSavedAt: number | null
  /** Message from the most recent failure, or null when no slice is failing. */
  lastError: string | null
  /** Slices whose most recent write was rejected. */
  failedSlices: PersistenceSlice[]
  /** True once a non-durable (in-memory) backend is resolved. Never clears. */
  degraded: boolean
}

export type PersistenceEvent =
  | { type: 'SAVE_STARTED'; slice: PersistenceSlice }
  | { type: 'SAVE_SUCCEEDED'; slice: PersistenceSlice; at: number }
  | { type: 'SAVE_FAILED'; slice: PersistenceSlice; at: number; error: string }
  /** The resolved backend. `memory` can never be durable. */
  | { type: 'BACKEND_RESOLVED'; backend: StorageBackend }

export const initialPersistenceState: PersistenceState = {
  status: 'idle',
  pending: 0,
  lastSavedAt: null,
  lastError: null,
  failedSlices: [],
  degraded: false,
}

/**
 * Status priority: a rejected write outranks everything (the user may have lost
 * work), then a non-durable store, then work in flight, then success.
 */
function resolveStatus(state: PersistenceState): PersistenceStatus {
  if (state.failedSlices.length > 0) return 'failed'
  if (state.degraded) return 'degraded'
  if (state.pending > 0) return 'saving'
  return state.lastSavedAt === null ? 'idle' : 'saved'
}

/** Recompute the derived status after any change to the underlying facts. */
function settle(state: PersistenceState): PersistenceState {
  return { ...state, status: resolveStatus(state) }
}

export function persistenceReducer(
  state: PersistenceState,
  event: PersistenceEvent,
): PersistenceState {
  switch (event.type) {
    case 'BACKEND_RESOLVED':
      if (event.backend !== 'memory') return state
      return settle({ ...state, degraded: true })

    case 'SAVE_STARTED':
      return settle({ ...state, pending: state.pending + 1 })

    case 'SAVE_SUCCEEDED': {
      // Only this slice recovers; another slice's outstanding failure stands.
      const failedSlices = state.failedSlices.filter((s) => s !== event.slice)
      return settle({
        ...state,
        pending: Math.max(0, state.pending - 1),
        failedSlices,
        lastSavedAt: event.at,
        lastError: failedSlices.length > 0 ? state.lastError : null,
      })
    }

    case 'SAVE_FAILED': {
      const failedSlices = state.failedSlices.includes(event.slice)
        ? state.failedSlices
        : [...state.failedSlices, event.slice]
      return settle({
        ...state,
        pending: Math.max(0, state.pending - 1),
        failedSlices,
        lastError: event.error,
      })
    }

    default:
      return state
  }
}

/** Short, non-alarming label for the storage badge. */
export function persistenceLabel(state: PersistenceState): string {
  switch (state.status) {
    case 'idle':
      return 'Ready'
    case 'saving':
      return 'Saving…'
    case 'saved':
      return 'Saved locally'
    case 'degraded':
      return 'Storage degraded — not saved'
    case 'failed':
      return 'Save failed'
  }
}

/** True when the UI should show a persistent warning, not just a badge. */
export function needsAttention(state: PersistenceState): boolean {
  return state.status === 'failed' || state.status === 'degraded'
}
