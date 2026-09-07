// Multi-tab write safety (pure core + a thin browser channel).
//
// The archive is one shared browser-profile resource, but each tab holds its
// own copy in React state and persists the whole array on every change. Two
// tabs open meant last-writer-wins: tab B, opened before tab A archived three
// pieces, would overwrite them on its next unrelated change. Nothing warned
// anyone, and there is no server copy to recover from.
//
// ONE counter covers BOTH durable slices — garments and saved looks — because a
// stale tab is stale for the whole archive, not for one key of it. The current
// rail is deliberately outside the guard: it is a working selection, not
// content, and guarding it would make merely browsing in a second tab burn
// revisions and raise conflicts over nothing.
//
// The fix is deliberately not a CRDT. A monotonically increasing revision is
// stored beside the data. A tab records the revision it loaded, and before
// writing it checks whether the stored revision has moved on. If it has,
// another tab wrote in the meantime and this tab's array is stale — so the
// write is refused rather than allowed to clobber newer work.
//
// Residual race: the check and the write are not atomic, so two tabs writing
// within the same tick can still interleave. That window is milliseconds wide
// and both tabs then see the conflict on their next write. Closing it fully
// needs a single transaction across a store that supports it (IndexedDB does;
// localStorage does not), which is documented as remaining work rather than
// pretended away.

/** Revision of an archive that has never been written by a revision-aware tab. */
export const UNVERSIONED = 0

export type WriteDecision =
  /** Safe to write; persist `revision` alongside the data. */
  | { ok: true; revision: number }
  /** Refuse: another tab has written since this one loaded. */
  | { ok: false; reason: 'stale'; storedRevision: number; ourRevision: number }

/**
 * Decide whether this tab may overwrite the shared archive.
 *
 * `ourRevision` is what the tab last loaded or successfully wrote.
 * `storedRevision` is what is in the store right now.
 *
 * Legacy data has no revision at all and reads as `UNVERSIONED`, which is never
 * newer than anything — so a first write from a revision-aware tab is always
 * allowed and simply starts the sequence.
 */
export function decideWrite(
  ourRevision: number,
  storedRevision: number,
): WriteDecision {
  if (storedRevision > ourRevision) {
    return { ok: false, reason: 'stale', storedRevision, ourRevision }
  }
  return { ok: true, revision: storedRevision + 1 }
}

/** Human-readable explanation for the conflict banner. */
export function describeConflict(decision: WriteDecision): string | null {
  if (decision.ok) return null
  return (
    'Another tab has updated this archive since this one loaded it. ' +
    'Reload to see the latest version — saving from here would overwrite it.'
  )
}

// --- Cross-tab notification -------------------------------------------------

/** The channel name is versioned so a future format change cannot half-talk. */
export const ARCHIVE_CHANNEL = 'fitarchive:archive:v1'

export interface ArchiveWriteNotice {
  /** Revision that was just written. */
  revision: number
  /** Identifies the sender so a tab ignores its own broadcast. */
  senderId: string
}

export interface ArchiveChannel {
  post(notice: ArchiveWriteNotice): void
  close(): void
}

/**
 * Subscribe to writes from other tabs.
 *
 * `BroadcastChannel` is feature-detected: where it is missing (older engines,
 * some test environments) this returns a no-op channel and the revision check
 * above still prevents data loss on its own. The channel is an optimisation —
 * it lets a tab learn it is stale immediately instead of at its next write.
 */
export function openArchiveChannel(
  senderId: string,
  onRemoteWrite: (notice: ArchiveWriteNotice) => void,
): ArchiveChannel {
  const Ctor = (globalThis as { BroadcastChannel?: typeof BroadcastChannel })
    .BroadcastChannel
  if (typeof Ctor !== 'function') {
    return { post: () => {}, close: () => {} }
  }

  const channel = new Ctor(ARCHIVE_CHANNEL)
  channel.onmessage = (event: MessageEvent) => {
    const notice = parseNotice(event.data)
    // Ignore our own echo; some implementations deliver to the sender.
    if (notice && notice.senderId !== senderId) onRemoteWrite(notice)
  }
  return {
    post: (notice) => {
      try {
        channel.postMessage(notice)
      } catch {
        // A closed or unavailable channel must never break a save.
      }
    },
    close: () => {
      try {
        channel.close()
      } catch {
        // Already closed.
      }
    },
  }
}

/** Validate a message from another tab — it is untrusted input like any other. */
export function parseNotice(value: unknown): ArchiveWriteNotice | null {
  if (typeof value !== 'object' || value === null) return null
  const { revision, senderId } = value as Record<string, unknown>
  if (typeof revision !== 'number' || !Number.isFinite(revision)) return null
  if (typeof senderId !== 'string' || senderId.length === 0) return null
  return { revision, senderId }
}
