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

/**
 * Why a write was rejected. The three cases need materially different words:
 * a full store is the user's to fix, a stale tab needs a reload, and anything
 * else is a genuine unknown that should not be dressed up as either.
 */
export type PersistenceFailureKind = 'quota' | 'conflict' | 'unknown'

/** Marker for the one failure the provider raises itself (multi-tab staleness). */
export class ArchiveConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArchiveConflictError'
  }
}

const QUOTA_NAMES = new Set([
  'QuotaExceededError',
  'NS_ERROR_DOM_QUOTA_REACHED',
])

/**
 * Classify a rejected write so the UI can say something a person can act on.
 *
 * Deliberately duck-typed rather than `instanceof DOMException`: the same
 * failure arrives as a `DOMException` from localStorage, as an `IDBRequest`
 * error from IndexedDB, and as a plain `Error` from a test double, and the user
 * needs the same sentence in all three cases.
 */
export function classifyPersistenceError(
  error: unknown,
): PersistenceFailureKind {
  if (error instanceof ArchiveConflictError) return 'conflict'
  if (error == null) return 'unknown'
  const name =
    typeof (error as { name?: unknown }).name === 'string'
      ? (error as { name: string }).name
      : ''
  if (name === 'ArchiveConflictError') return 'conflict'
  if (QUOTA_NAMES.has(name)) return 'quota'
  // Legacy engines report quota by numeric code only (22 / 1014).
  const code = (error as { code?: unknown }).code
  if (code === 22 || code === 1014) return 'quota'
  const message =
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : String(error)
  if (/quota|storage is full|exceeded the quota/i.test(message)) return 'quota'
  return 'unknown'
}

export interface PersistenceState {
  status: PersistenceStatus
  /** Number of writes currently in flight. */
  pending: number
  /** Epoch ms of the last acknowledged write, or null. */
  lastSavedAt: number | null
  /** Message from the most recent failure, or null when no slice is failing. */
  lastError: string | null
  /** Why the most recent failure happened, or null when no slice is failing. */
  lastErrorKind: PersistenceFailureKind | null
  /** Slices whose most recent write was rejected. */
  failedSlices: PersistenceSlice[]
  /** True once a non-durable (in-memory) backend is resolved. Never clears. */
  degraded: boolean
}

export type PersistenceEvent =
  | { type: 'SAVE_STARTED'; slice: PersistenceSlice }
  | { type: 'SAVE_SUCCEEDED'; slice: PersistenceSlice; at: number }
  | {
      type: 'SAVE_FAILED'
      slice: PersistenceSlice
      at: number
      error: string
      /** Optional so a caller with nothing better to say records an honest
       *  'unknown' rather than being forced to guess a category. */
      kind?: PersistenceFailureKind
    }
  /** The resolved backend. `memory` can never be durable. */
  | { type: 'BACKEND_RESOLVED'; backend: StorageBackend }

export const initialPersistenceState: PersistenceState = {
  status: 'idle',
  pending: 0,
  lastSavedAt: null,
  lastError: null,
  lastErrorKind: null,
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
        lastErrorKind:
          failedSlices.length > 0 ? state.lastErrorKind : null,
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
        lastErrorKind: event.kind ?? 'unknown',
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

// --- User-facing alert ------------------------------------------------------
//
// `needsAttention` answers "is something wrong"; this answers "what do I tell
// the user". It is pure and lives here rather than in the component so the exact
// wording is unit-testable — the whole point of the persistence work is that a
// local-first app must never let someone believe an archive is safe when it is
// not, and that promise is kept in words, not in state.

export interface ArchiveAlert {
  /** Which of the underlying conditions produced this message. */
  kind:
    | 'conflict'
    | 'quota'
    | 'failed'
    | 'store-unreadable'
    | 'unreadable'
    | 'degraded'
  /** `danger` means work is already at risk; `warning` means it will be. */
  tone: 'danger' | 'warning'
  title: string
  detail: string
  /** True when reloading the tab is the actual fix. */
  offerReload: boolean
}

/**
 * The single most important thing to say right now, or null when the archive is
 * behaving. Priority is by consequence: a stale tab is losing work as it types,
 * a rejected write has already lost the last change, and a non-durable store
 * will lose everything on reload but has lost nothing yet.
 */
export function archiveAlert(
  state: PersistenceState,
  options: {
    conflict: boolean
    unreadableGarments?: number
    storeUnreadable?: boolean
  },
): ArchiveAlert | null {
  if (options.conflict) {
    return {
      kind: 'conflict',
      tone: 'danger',
      title: 'Another tab is ahead of this one',
      detail:
        'This tab loaded an older version of the archive, so its changes were ' +
        'not saved — they would have overwritten the newer ones. Reload to ' +
        'pick up the latest version.',
      offerReload: true,
    }
  }

  if (state.status === 'failed') {
    if (state.lastErrorKind === 'quota') {
      return {
        kind: 'quota',
        tone: 'danger',
        title: 'This browser’s storage is full',
        detail:
          'The last change could not be saved. Export a backup from the ' +
          'Closet, then remove a few pieces to free space.',
        offerReload: false,
      }
    }
    return {
      kind: 'failed',
      tone: 'danger',
      title: 'The last change was not saved',
      detail:
        'What is on screen is ahead of what this browser has stored. Export a ' +
        'backup from the Closet so the work is not lost.',
      offerReload: false,
    }
  }

  // The whole stored record was unreadable, so the app is showing an EMPTY
  // archive that is not evidence of an empty archive. Ranked above the
  // per-record count because more is at stake and the same short window
  // applies: the next ordinary save replaces the unreadable blob outright.
  if (options.storeUnreadable) {
    return {
      kind: 'store-unreadable',
      tone: 'danger',
      title: 'The stored archive could not be read',
      detail:
        'Nothing from it is shown, and the next change you save will replace ' +
        'it. If you have a backup file, import it from the Closet before ' +
        'editing anything.',
      offerReload: false,
    }
  }

  // Records that could not be read back. Ranked above the durability warning
  // because this loss has ALREADY happened and there is a short window — before
  // the next write re-persists the array without them — in which importing a
  // backup still recovers it.
  const unreadable = options.unreadableGarments ?? 0
  if (unreadable > 0) {
    return {
      kind: 'unreadable',
      tone: 'danger',
      title:
        unreadable === 1
          ? 'One stored piece could not be read'
          : `${unreadable} stored pieces could not be read`,
      detail:
        'They are not shown, and the next change you save will remove them ' +
        'from this browser. If you have a backup file, import it from the ' +
        'Closet before editing anything.',
      offerReload: false,
    }
  }

  if (state.status === 'degraded') {
    return {
      kind: 'degraded',
      tone: 'warning',
      title: 'Nothing here will survive a reload',
      detail:
        'This browser is blocking local storage, so the archive is being held ' +
        'in memory only. Export a backup from the Closet before closing the tab.',
      offerReload: false,
    }
  }

  return null
}
