import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArchiveProvider } from '../../app/providers/ArchiveProvider'
import { MannequinPreview } from './MannequinPreview'
import { STORAGE_KEYS } from '../../lib/storage/storageTypes'
import { createEmptyOutfit } from '../../domain/outfitTypes'
import { CATEGORY_META } from '../../domain/garmentTaxonomy'
import { ZONE_BOXES } from '../../domain/garmentLayout'
import type { ClothingCategory, GarmentAsset } from '../../domain/garmentTypes'
import { makeGarment } from '../../test/factories'

const CATEGORIES: ClothingCategory[] = [
  'outerwear',
  'top',
  'pants',
  'shoes',
  'accessory',
]

async function renderSelected(
  category: ClothingCategory,
  asset?: GarmentAsset,
) {
  const garment = makeGarment({ id: 'g', category, name: 'The Piece', asset })
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

/** A cutout asset whose garment sits in the middle of a mostly-empty frame. */
function cutoutAsset(bounds?: Partial<GarmentAsset['contentBounds']>): GarmentAsset {
  return {
    originalImageUrl: 'data:RAW',
    displayImageUrl: 'data:CUT',
    cutoutImageUrl: 'data:CUT',
    assetMode: 'cutout',
    contentBounds:
      bounds === undefined
        ? undefined
        : {
            x: 0.1,
            y: 0.35,
            width: 0.8,
            height: 0.3,
            sourceAspect: 1,
            ...bounds,
          },
  }
}

describe('MannequinPreview zone mapping', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  for (const category of CATEGORIES) {
    const zone = CATEGORY_META[category].zone
    it(`places a selected ${category} on the ${zone} zone only`, async () => {
      const { container } = await renderSelected(category)
      const img = screen.getByAltText('The Piece')
      const panel = img.closest('.mannequin__zone') as HTMLElement

      // The geometry now comes from ZONE_BOXES rather than a CSS class, so the
      // routing is asserted against the numbers themselves — which is the thing
      // that actually has to be right.
      const box = ZONE_BOXES[zone]
      expect(panel.style.left).toBe(`${box.x * 100}%`)
      expect(panel.style.top).toBe(`${box.y * 100}%`)
      expect(panel.style.width).toBe(`${box.width * 100}%`)
      expect(panel.style.height).toBe(`${box.height * 100}%`)

      // ...and it is the only garment on the mannequin.
      expect(container.querySelectorAll('.mannequin__img')).toHaveLength(1)
    })
  }

  it('gives every category a distinct zone', async () => {
    // A taxonomy edit that pointed two categories at one zone would stack them
    // invisibly; the prose would not fail, this does.
    const seen = new Set(CATEGORIES.map((c) => CATEGORY_META[c].zone))
    expect(seen.size).toBe(CATEGORIES.length)
  })

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

  it('positions empty placeholders from the same geometry as filled ones', () => {
    const { container } = render(
      <ArchiveProvider>
        <MannequinPreview />
      </ArchiveProvider>,
    )
    const placeholders = Array.from(
      container.querySelectorAll<HTMLElement>('.mannequin__empty'),
    )
    for (const category of CATEGORIES) {
      const box = ZONE_BOXES[CATEGORY_META[category].zone]
      expect(
        placeholders.some((el) => el.style.left === `${box.x * 100}%`),
      ).toBe(true)
    }
  })

  it('renders the asset display image, not the raw imageDataUrl', async () => {
    // Proves the surface threads getGarmentDisplayImage: a product-reference
    // garment renders its display image, not the uploaded original.
    await renderSelected('top', {
      originalImageUrl: 'data:RAW',
      displayImageUrl: 'data:DISPLAY',
      assetMode: 'product-reference',
    })
    const img = screen.getByAltText('The Piece') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('data:DISPLAY')
  })
})

describe('MannequinPreview — cutout fitting (revival Phase 2)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('fits a cutout with measured bounds instead of dropping it in a panel', async () => {
    // Case A: the garment is placed by its content, so it is NOT inside the
    // rectangular matte panel at all.
    const { container } = await renderSelected('top', cutoutAsset({}))
    const img = screen.getByAltText('The Piece')

    expect(img.closest('.mannequin__fitted')).not.toBeNull()
    expect(img.closest('.mannequin__zone')).toBeNull()
    expect(container.querySelector('.mannequin__zone--cutout')).toBeNull()
  })

  it('draws a sparse cutout larger than the stage so its content is life-sized', async () => {
    // Case C: a shoe occupying a fifth of its frame. Fitting the CANVAS is what
    // made shoes come out absurdly small; fitting the CONTENT means the frame
    // is drawn several times over.
    await renderSelected(
      'shoes',
      cutoutAsset({ x: 0.4, y: 0.45, width: 0.2, height: 0.1 }),
    )
    const layer = screen
      .getByAltText('The Piece')
      .closest('.mannequin__fitted') as HTMLElement

    expect(parseFloat(layer.style.width)).toBeGreaterThan(100)
  })

  it('places shoes down at the feet and a top up on the torso', async () => {
    // Cases B/C: the anchor actually reaches the right part of the figure.
    const { unmount } = await renderSelected('shoes', cutoutAsset({}))
    const shoeTop = parseFloat(
      (screen.getByAltText('The Piece').closest('.mannequin__fitted') as HTMLElement)
        .style.top,
    )
    unmount()
    localStorage.clear()

    await renderSelected('top', cutoutAsset({}))
    const topTop = parseFloat(
      (screen.getByAltText('The Piece').closest('.mannequin__fitted') as HTMLElement)
        .style.top,
    )

    expect(shoeTop).toBeGreaterThan(topTop)
    expect(shoeTop).toBeGreaterThan(50)
  })

  it('layers an accepted outerwear cutout above the top', async () => {
    // Case D: with transparency the occlusion problem disappears, so the
    // jacket takes its natural place over the shirt.
    const garments = [
      makeGarment({
        id: 'coat',
        category: 'outerwear',
        name: 'Coat',
        asset: cutoutAsset({}),
      }),
      makeGarment({
        id: 'tee',
        category: 'top',
        name: 'Tee',
        asset: cutoutAsset({}),
      }),
    ]
    localStorage.setItem(STORAGE_KEYS.garments, JSON.stringify(garments))
    localStorage.setItem(
      STORAGE_KEYS.currentOutfit,
      JSON.stringify({ ...createEmptyOutfit(), outerwear: 'coat', top: 'tee' }),
    )
    render(
      <ArchiveProvider>
        <MannequinPreview />
      </ArchiveProvider>,
    )

    const coat = (await screen.findByAltText('Coat')).closest(
      '.mannequin__fitted',
    ) as HTMLElement
    const tee = screen.getByAltText('Tee').closest('.mannequin__fitted') as HTMLElement

    expect(Number(coat.style.zIndex)).toBeGreaterThan(Number(tee.style.zIndex))
  })

  it('falls back to the matte panel for a cutout with no measured bounds', async () => {
    // A cutout accepted before Phase 2 existed. It must still render, in the
    // presentation it always had — no migration failure.
    await renderSelected('outerwear', cutoutAsset(undefined))
    const img = screen.getByAltText('The Piece')

    expect(img.closest('.mannequin__fitted')).toBeNull()
    expect(img.classList.contains('mannequin__img--cutout')).toBe(true)
    expect(img.closest('.mannequin__zone--cutout')).not.toBeNull()
  })

  it('falls back rather than rendering NaN% for corrupt bounds', async () => {
    // The bounds survive a round trip through storage, where a hand-edited or
    // truncated record is a real possibility.
    await renderSelected(
      'top',
      cutoutAsset({ width: 0 as number, height: 0 as number }),
    )
    const img = screen.getByAltText('The Piece')
    const layer = img.closest('.mannequin__zone') as HTMLElement

    expect(img.closest('.mannequin__fitted')).toBeNull()
    expect(layer.style.left).not.toContain('NaN')
  })

  it('keeps an opaque garment in its matte panel with the multiply blend', async () => {
    // Case E: an ordinary flat-lay photo has no alpha to measure, and is not
    // dragged into a presentation its image cannot support.
    await renderSelected('top')
    const img = screen.getByAltText('The Piece')

    expect(img.closest('.mannequin__fitted')).toBeNull()
    expect(img.classList.contains('mannequin__img--cutout')).toBe(false)
    expect(img.closest('.mannequin__zone--cutout')).toBeNull()
    expect(img.classList.contains('mannequin__img')).toBe(true)
  })
})
