import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArchiveProvider } from '../../app/providers/ArchiveProvider'
import { MirrorPreview } from './MirrorPreview'
import { STORAGE_KEYS } from '../../lib/storage/storageTypes'
import { createEmptyOutfit } from '../../domain/outfitTypes'
import { makeGarment } from '../../test/factories'

describe('MirrorPreview (full) composition caption', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('labels the preview honestly (2.5D, never real 3D) and shows an empty CTA', async () => {
    render(
      <ArchiveProvider>
        <MirrorPreview variant="full" />
      </ArchiveProvider>,
    )
    expect(
      await screen.findByText('2.5D layered styling preview'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Select archive pieces to build a fit.'),
    ).toBeInTheDocument()
    // Never claims real 3D try-on / cloth simulation / garment physics.
    expect(
      screen.queryByText(/3d try-?on|cloth simulation|garment physics/i),
    ).not.toBeInTheDocument()
  })

  it('summarizes a selected piece with its category chip + reflects it on the mannequin', async () => {
    const top = makeGarment({ id: 't', category: 'top', name: 'Wool Tee' })
    localStorage.setItem(STORAGE_KEYS.garments, JSON.stringify([top]))
    localStorage.setItem(
      STORAGE_KEYS.currentOutfit,
      JSON.stringify({ ...createEmptyOutfit(), top: 't' }),
    )
    render(
      <ArchiveProvider>
        <MirrorPreview variant="full" />
      </ArchiveProvider>,
    )
    // The caption's category chip for the selected top...
    expect(await screen.findByText('Top')).toBeInTheDocument()
    // ...and the same piece reflected on the mannequin.
    expect(screen.getByAltText('Wool Tee')).toBeInTheDocument()
  })
})
