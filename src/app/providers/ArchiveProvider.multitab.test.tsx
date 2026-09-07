// Two tabs, one browser profile, one archive.
//
// Before the revision guard this was last-writer-wins: a second tab that loaded
// earlier would overwrite everything the first had archived, with no warning and
// no server copy to recover from. These tests mount two independent providers
// over the same (jsdom localStorage) store and assert the loser is refused
// rather than allowed to clobber.
import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { GarmentDraft } from '../../domain/garmentTypes'
import { makeGarment } from '../../test/factories'
import { ArchiveProvider } from './ArchiveProvider'
import { useArchive } from './useArchive'

const wrapper = ({ children }: { children: ReactNode }) => (
  <ArchiveProvider>{children}</ArchiveProvider>
)

const draft = (name: string): GarmentDraft => ({
  name,
  category: 'top',
  color: 'Charcoal',
  colorHex: '#2b2b30',
  styleTags: [],
  imageDataUrl: 'data:image/svg+xml,<svg/>',
})

async function mountTab() {
  const tab = renderHook(() => useArchive(), { wrapper })
  await waitFor(() => expect(tab.result.current.hydrated).toBe(true))
  return tab
}

describe('ArchiveProvider — multi-tab write safety', () => {
  beforeEach(() => localStorage.clear())

  it('bumps the stored revision on every archive write', async () => {
    const tab = await mountTab()
    act(() => {
      tab.result.current.addGarment(draft('First'))
    })
    await waitFor(() =>
      expect(tab.result.current.persistence.status).toBe('saved'),
    )
    expect(Number(localStorage.getItem('fitarchive:revision'))).toBeGreaterThan(0)
  })

  it('refuses a stale tab’s write instead of destroying newer work', async () => {
    // Tab A and tab B both load an empty archive at revision 0.
    const tabA = await mountTab()
    const tabB = await mountTab()

    // A archives a piece and moves the store on.
    act(() => {
      tabA.result.current.addGarment(draft('A-only'))
    })
    await waitFor(() =>
      expect(tabA.result.current.persistence.status).toBe('saved'),
    )
    const afterA = localStorage.getItem('fitarchive:garments')
    expect(afterA).toContain('A-only')

    // B, still holding its own stale array, tries to write.
    act(() => {
      tabB.result.current.addGarment(draft('B-only'))
    })

    // The write is refused and reported, not silently applied...
    await waitFor(() =>
      expect(tabB.result.current.persistence.status).toBe('failed'),
    )
    expect(tabB.result.current.archiveConflict).toBe(true)

    // ...and A's garment is still in the store.
    expect(localStorage.getItem('fitarchive:garments')).toContain('A-only')
  })


  it('refuses a stale tab’s SAVED LOOK write, not only its garments write', async () => {
    // Saved looks are archive content too. Guarding garments alone left a whole
    // board of looks overwritable by a tab that had been sitting open — the
    // exact bug the revision guard exists to stop, on a different key.
    const shared = makeGarment({ id: 'grm-shared', category: 'top' })
    localStorage.setItem('fitarchive:garments', JSON.stringify([shared]))

    // Both tabs load the same archive at the same revision.
    const tabA = await mountTab()
    const tabB = await mountTab()

    // A moves the store on with an unrelated edit.
    act(() => {
      tabA.result.current.updateGarment('grm-shared', {
        ...shared,
        name: 'Renamed by A',
      })
    })
    await waitFor(() =>
      expect(tabA.result.current.persistence.status).toBe('saved'),
    )

    // B, now stale, styles and saves a look.
    act(() => {
      tabB.result.current.selectGarment('grm-shared')
    })
    act(() => {
      tabB.result.current.saveOutfit('B-look')
    })

    await waitFor(() =>
      expect(tabB.result.current.persistence.failedSlices).toContain(
        'savedOutfits',
      ),
    )
    expect(tabB.result.current.archiveConflict).toBe(true)
    // Nothing of B's reached the store, and A's rename survived.
    expect(localStorage.getItem('fitarchive:savedOutfits') ?? '').not.toContain(
      'B-look',
    )
    expect(localStorage.getItem('fitarchive:garments')).toContain('Renamed by A')
  })

  it('does not burn a revision merely for having saved looks open', async () => {
    // The change-detection guard has to cover saved looks as well, or opening a
    // second tab on an archive that HAS looks instantly makes its sibling stale.
    localStorage.setItem(
      'fitarchive:savedOutfits',
      JSON.stringify([
        {
          id: 'look-1',
          name: 'Existing',
          selection: { outerwear: null, top: null, pants: null, shoes: null, accessory: null },
          createdAt: 1,
          coverHex: '#2b2b30',
        },
      ]),
    )
    localStorage.setItem('fitarchive:revision', '4')

    const tab = await mountTab()
    await waitFor(() => expect(tab.result.current.savedOutfits).toHaveLength(1))
    // Give any stray persist effect a chance to run before asserting.
    await waitFor(() =>
      expect(tab.result.current.persistence.pending).toBe(0),
    )
    expect(localStorage.getItem('fitarchive:revision')).toBe('4')
    expect(tab.result.current.archiveConflict).toBe(false)
  })

  it('leaves a single tab entirely unaffected', async () => {
    const tab = await mountTab()
    for (const name of ['One', 'Two', 'Three']) {
      act(() => {
        tab.result.current.addGarment(draft(name))
      })
      await waitFor(() =>
        expect(tab.result.current.persistence.status).toBe('saved'),
      )
    }
    expect(tab.result.current.garments).toHaveLength(3)
    expect(tab.result.current.archiveConflict).toBe(false)
    const stored = localStorage.getItem('fitarchive:garments') ?? ''
    for (const name of ['One', 'Two', 'Three']) expect(stored).toContain(name)
  })
})
