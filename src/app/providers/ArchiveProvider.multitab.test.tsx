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
