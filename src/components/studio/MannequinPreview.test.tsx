import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArchiveProvider } from '../../app/providers/ArchiveProvider'
import { MannequinPreview } from './MannequinPreview'
import { STORAGE_KEYS } from '../../lib/storage/storageTypes'
import { createEmptyOutfit } from '../../domain/outfitTypes'
import type { ClothingCategory } from '../../domain/garmentTypes'
import { makeGarment } from '../../test/factories'

// category → mannequin body-zone class (mirrors garmentTaxonomy CATEGORY_META).
// If a future taxonomy edit broke this routing, the prose wouldn't fail — these
// tests would.
const ZONE: Record<ClothingCategory, string> = {
  outerwear: 'zone-torsoOuter',
  top: 'zone-torso',
  pants: 'zone-legs',
  shoes: 'zone-feet',
  accessory: 'zone-accessory',
}

async function renderSelected(category: ClothingCategory) {
  const garment = makeGarment({ id: 'g', category, name: 'The Piece' })
  localStorage.setItem(STORAGE_KEYS.garments, JSON.stringify([garment]))
  localStorage.setItem(
    STORAGE_KEYS.currentOutfit,
    JSON.stringify({ ...createEmptyOutfit(), [category]: 'g' }),
  )
  const view = render(
    <ArchiveProvider>
      <MannequinPreview />
    </ArchiveProvider>,
  )
  await screen.findByAltText('The Piece') // wait for hydration
  return view
}

describe('MannequinPreview zone mapping', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  for (const category of Object.keys(ZONE) as ClothingCategory[]) {
    const zoneClass = ZONE[category]
    it(`routes a selected ${category} into ${zoneClass} only`, async () => {
      const { container } = await renderSelected(category)
      const img = screen.getByAltText('The Piece')

      // The garment image lands in its own body zone...
      expect(img.closest(`.${zoneClass}`)).not.toBeNull()
      // ...is the only garment image on the mannequin...
      expect(container.querySelectorAll('.mannequin__img')).toHaveLength(1)
      // ...and never leaks into another zone.
      const otherZone = zoneClass === 'zone-torso' ? 'zone-legs' : 'zone-torso'
      expect(
        container.querySelector(`.${otherZone} .mannequin__img`),
      ).toBeNull()
    })
  }

  it('renders intentional empty placeholders when nothing is selected', () => {
    const { container } = render(
      <ArchiveProvider>
        <MannequinPreview />
      </ArchiveProvider>,
    )
    // Empty both before and after hydration (no stored outfit).
    expect(container.querySelectorAll('.mannequin__empty')).toHaveLength(5)
    expect(container.querySelector('.mannequin__img')).toBeNull()
  })

  it('renders the asset display image, not the raw imageDataUrl', async () => {
    // Proves the surface threads getGarmentDisplayImage: a product-reference
    // garment renders its display image, not the uploaded original.
    const top = makeGarment({
      id: 'g',
      category: 'top',
      name: 'The Piece',
      imageDataUrl: 'data:RAW',
      asset: {
        originalImageUrl: 'data:RAW',
        displayImageUrl: 'data:DISPLAY',
        assetMode: 'product-reference',
      },
    })
    localStorage.setItem(STORAGE_KEYS.garments, JSON.stringify([top]))
    localStorage.setItem(
      STORAGE_KEYS.currentOutfit,
      JSON.stringify({ ...createEmptyOutfit(), top: 'g' }),
    )
    render(
      <ArchiveProvider>
        <MannequinPreview />
      </ArchiveProvider>,
    )
    const img = (await screen.findByAltText('The Piece')) as HTMLImageElement
    expect(img.getAttribute('src')).toBe('data:DISPLAY')
  })
})
