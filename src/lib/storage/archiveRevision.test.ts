import { describe, expect, it } from 'vitest'
import {
  UNVERSIONED,
  decideWrite,
  describeConflict,
  parseNotice,
} from './archiveRevision'

describe('decideWrite — multi-tab write safety', () => {
  it('allows the first write over legacy, unversioned data', () => {
    const decision = decideWrite(UNVERSIONED, UNVERSIONED)
    expect(decision).toEqual({ ok: true, revision: 1 })
  })

  it('allows a write when this tab is current', () => {
    expect(decideWrite(4, 4)).toEqual({ ok: true, revision: 5 })
  })

  it('REFUSES a write when another tab has moved the archive on', () => {
    // The data-loss case: tab B loaded at revision 2, tab A has since written
    // three garments and left the store at 5. B's whole-array write would
    // destroy them.
    const decision = decideWrite(2, 5)
    expect(decision.ok).toBe(false)
    expect(decision).toMatchObject({ reason: 'stale', storedRevision: 5, ourRevision: 2 })
  })

  it('allows a write when this tab is somehow ahead (never blocks on our own)', () => {
    // Defensive: if a store rolls back (cleared in another tab, say) we must not
    // deadlock the only tab that still has data.
    expect(decideWrite(7, 3)).toEqual({ ok: true, revision: 4 })
  })

  it('explains a conflict for the UI, and says nothing when there is none', () => {
    expect(describeConflict(decideWrite(2, 5))).toMatch(/another tab/i)
    expect(describeConflict(decideWrite(2, 2))).toBeNull()
  })
})

describe('parseNotice — cross-tab messages are untrusted input', () => {
  it('accepts a well-formed notice', () => {
    expect(parseNotice({ revision: 3, senderId: 'abc' })).toEqual({
      revision: 3,
      senderId: 'abc',
    })
  })

  it('rejects malformed notices instead of trusting them', () => {
    for (const bad of [
      null,
      undefined,
      'string',
      42,
      {},
      { revision: 3 },
      { senderId: 'abc' },
      { revision: 'three', senderId: 'abc' },
      { revision: Number.NaN, senderId: 'abc' },
      { revision: 3, senderId: '' },
    ]) {
      expect(parseNotice(bad)).toBeNull()
    }
  })
})
