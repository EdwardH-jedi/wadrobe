import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArchiveProvider } from '../../app/providers/ArchiveProvider'
import { CurrentFitSlots } from './CurrentFitSlots'
import { STORAGE_KEYS } from '../../lib/storage/storageTypes'
import { createEmptyOutfit } from '../../domain/outfitTypes'
import { makeGarment } from '../../test/factories'

// Pre-seed storage with one selected top so the provider hydrates into a
// filled 'top' slot. Lets us assert the compact/non-compact clear-control
// difference without driving the upload UI.
function seedSelectedTop() {
  const top = makeGarment({ id: 'top-1', category: 'top', name: 'Wool Tee' })
  localStorage.setItem(STORAGE_KEYS.garments, JSON.stringify([top]))
  localStorage.setItem(
    STORAGE_KEYS.currentOutfit,
    JSON.stringify({ ...createEmptyOutfit(), top: 'top-1' }),
  )
}

describe('CurrentFitSlots', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows a per-slot clear control for filled slots when not compact', async () => {
    seedSelectedTop()
    render(
      <ArchiveProvider>
        <CurrentFitSlots />
      </ArchiveProvider>,
    )
    expect(await screen.findByLabelText('Remove Top')).toBeInTheDocument()
    expect(screen.getByAltText('Wool Tee')).toBeInTheDocument()
  })

  it('omits the clear control in compact mode but still shows the garment', async () => {
    seedSelectedTop()
    render(
      <ArchiveProvider>
        <CurrentFitSlots compact />
      </ArchiveProvider>,
    )
    expect(await screen.findByAltText('Wool Tee')).toBeInTheDocument()
    expect(screen.queryByLabelText('Remove Top')).not.toBeInTheDocument()
  })
})
