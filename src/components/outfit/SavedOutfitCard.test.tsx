import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchiveProvider } from '../../app/providers/ArchiveProvider'
import { SavedOutfitCard } from './SavedOutfitCard'
import { STORAGE_KEYS } from '../../lib/storage/storageTypes'
import { createEmptyOutfit, type SavedOutfit } from '../../domain/outfitTypes'
import type { GarmentItem } from '../../domain/garmentTypes'
import { makeGarment } from '../../test/factories'

function seed(garments: GarmentItem[]) {
  localStorage.setItem(STORAGE_KEYS.garments, JSON.stringify(garments))
}

const look = (selection: Partial<SavedOutfit['selection']>): SavedOutfit => ({
  id: 'look-1',
  name: 'Test Look',
  selection: { ...createEmptyOutfit(), ...selection },
  createdAt: 1_700_000_000_000,
  coverHex: '#2b2b30',
})

describe('SavedOutfitCard', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders garment thumbnails, category labels and a vibe label', async () => {
    seed([
      makeGarment({ id: 'top-1', category: 'top', name: 'Wool Tee', styleTags: ['minimal'] }),
      makeGarment({ id: 'pant-1', category: 'pants', name: 'Cargo', styleTags: ['minimal'] }),
    ])
    render(
      <ArchiveProvider>
        <SavedOutfitCard
          outfit={look({ top: 'top-1', pants: 'pant-1' })}
          onRestore={vi.fn()}
          onRemove={vi.fn()}
        />
      </ArchiveProvider>,
    )

    expect(await screen.findByAltText('Wool Tee')).toBeInTheDocument()
    expect(screen.getByAltText('Cargo')).toBeInTheDocument()
    expect(screen.getByText('Test Look')).toBeInTheDocument()
    expect(screen.getByText(/Top · Pants/)).toBeInTheDocument() // category labels
    expect(screen.getByText('Minimal layer')).toBeInTheDocument() // vibe
  })

  it('fires restore and delete callbacks with the look id', async () => {
    const user = userEvent.setup()
    const onRestore = vi.fn()
    const onRemove = vi.fn()
    seed([makeGarment({ id: 'top-1', category: 'top', name: 'Wool Tee' })])
    render(
      <ArchiveProvider>
        <SavedOutfitCard
          outfit={look({ top: 'top-1' })}
          onRestore={onRestore}
          onRemove={onRemove}
        />
      </ArchiveProvider>,
    )
    await screen.findByAltText('Wool Tee')

    await user.click(screen.getByRole('button', { name: /Restore fit/ }))
    expect(onRestore).toHaveBeenCalledWith('look-1')

    await user.click(screen.getByRole('button', { name: /Delete look/ }))
    expect(onRemove).toHaveBeenCalledWith('look-1')
  })

  it('renders gracefully when the look references deleted garments', async () => {
    // No garments seeded — the selection points at ids that won't resolve.
    render(
      <ArchiveProvider>
        <SavedOutfitCard
          outfit={look({ top: 'gone' })}
          onRestore={vi.fn()}
          onRemove={vi.fn()}
        />
      </ArchiveProvider>,
    )
    expect(await screen.findByText('Test Look')).toBeInTheDocument()
    // A hollow look hides the vibe (never leaks the "Unstyled" degenerate value)
    // and still offers its actions.
    expect(screen.queryByText('Unstyled')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Restore fit/ }),
    ).toBeInTheDocument()
  })
})
