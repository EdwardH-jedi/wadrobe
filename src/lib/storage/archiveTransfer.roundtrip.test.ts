// Export → file → import, end to end: what leaves the archive must come back
// unchanged, including images that only existed as IndexedDB blobs.
import { describe, expect, it } from 'vitest'
import { makeGarment } from '../../test/factories'
import { createEmptyOutfit, type SavedOutfit } from '../../domain/outfitTypes'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { createMemoryBlobStore } from './assetBlobStore'
import { buildArchiveExportBlob } from './archiveExport'
import {
  readArchiveFileText,
  reviewArchiveImportText,
  summarizeArchiveImport,
} from './archiveImport'
import {
  blobBackAsset,
  dataUrlToBlob,
  dehydrateGarmentForStorage,
  hydrateGarmentForRuntime,
} from './garmentAssetStorage'

const CUTOUT_DATA_URL = 'data:image/webp;base64,Y3V0b3V0LWJ5dGVz'

const look: SavedOutfit = {
  id: 'look-1',
  name: 'Sunday Editorial',
  selection: { ...createEmptyOutfit(), top: 'grm-top', shoes: 'grm-shoes' },
  createdAt: 1_699_000_000_000,
  coverHex: '#2b2b30',
}

async function roundTrip(
  input: Parameters<typeof buildArchiveExportBlob>[0],
  blobStore?: ReturnType<typeof createMemoryBlobStore>,
) {
  const { blob, stats } = await buildArchiveExportBlob(input, {
    blobStore,
    now: 1_700_000_000_000,
  })
  const review = reviewArchiveImportText(await readArchiveFileText(blob))
  return { review, stats }
}

describe('export → import round trip', () => {
  it('returns every garment, look and the current outfit unchanged', async () => {
    const top = makeGarment({ id: 'grm-top', category: 'top', name: 'Boxy Tee' })
    const shoes = makeGarment({
      id: 'grm-shoes',
      category: 'shoes',
      name: 'Runner',
      brand: 'Archive',
      notes: 'Bought in Tokyo',
      price: 240,
      currency: 'USD',
      marketValueHistory: [{ id: 'mkt-1', at: 1_699_500_000_000, value: 300 }],
    })
    const input = {
      garments: [top, shoes],
      savedOutfits: [look],
      currentOutfit: { ...createEmptyOutfit(), top: 'grm-top' },
    }

    const { review } = await roundTrip(input)

    expect(review.ok).toBe(true)
    expect(review.issues).toEqual([])
    expect(review.garments).toEqual(input.garments)
    expect(review.savedOutfits).toEqual(input.savedOutfits)
    expect(review.currentOutfit).toEqual(input.currentOutfit)
  })

  it('carries a blob-only image across as bytes the recipient can actually read', async () => {
    const store = createMemoryBlobStore(true, () => 1_700_000_000_000)

    // Build the garment the way an upload does: bytes into the blob store, refs
    // on the asset, then dehydrate (drops the data urls) + hydrate (what the app
    // holds after a reload).
    const uploaded = await blobBackAsset(
      makeGarment({
        id: 'grm-cutout',
        name: 'Cutout Piece',
        imageDataUrl: 'data:image/png;base64,dGh1bWI=',
        asset: {
          originalImageUrl: 'data:image/png;base64,dGh1bWI=',
          displayImageUrl: CUTOUT_DATA_URL,
          cutoutImageUrl: CUTOUT_DATA_URL,
          assetMode: 'cutout',
        },
      }),
      store,
    )
    const stored = dehydrateGarmentForStorage(uploaded)
    expect(stored.asset?.cutoutImageUrl).toBeUndefined() // bytes are blob-only now
    const live = await hydrateGarmentForRuntime(stored, store)
    expect(getGarmentDisplayImage(live)).toMatch(/^blob:/) // process-local handle

    const { review, stats } = await roundTrip(
      {
        garments: [live],
        savedOutfits: [],
        currentOutfit: createEmptyOutfit(),
      },
      store,
    )

    expect(stats.inlinedImageCount).toBe(1)
    expect(stats.unresolvedImageCount).toBe(0)
    const imported = review.garments[0]
    // The recipient gets real bytes, not a reference into a store they cannot read.
    expect(getGarmentDisplayImage(imported)).toBe(CUTOUT_DATA_URL)
    expect(imported.asset?.cutoutImageUrl).toBe(CUTOUT_DATA_URL)
    expect(imported.asset?.cutoutImageRef).toBeUndefined()
    expect(dataUrlToBlob(getGarmentDisplayImage(imported))?.size).toBe(12)
  })

  it('an imported archive can be re-exported and re-imported identically', async () => {
    const store = createMemoryBlobStore(true, () => 1_700_000_000_000)
    const first = await roundTrip(
      {
        garments: [makeGarment({ id: 'grm-1', category: 'top' })],
        savedOutfits: [
          { ...look, selection: { ...createEmptyOutfit(), top: 'grm-1' } },
        ],
        currentOutfit: { ...createEmptyOutfit(), top: 'grm-1' },
      },
      store,
    )

    const second = await roundTrip({
      garments: first.review.garments,
      savedOutfits: first.review.savedOutfits,
      currentOutfit: first.review.currentOutfit,
    })

    expect(second.review.garments).toEqual(first.review.garments)
    expect(second.review.savedOutfits).toEqual(first.review.savedOutfits)
    expect(second.review.issues).toEqual([])
  })

  it('re-importing a backup over the live archive adds nothing and removes nothing', async () => {
    const garments = [makeGarment({ id: 'grm-1' }), makeGarment({ id: 'grm-2' })]
    const { review } = await roundTrip({
      garments,
      savedOutfits: [look],
      currentOutfit: createEmptyOutfit(),
    })

    const summary = summarizeArchiveImport(
      review,
      { garments, savedOutfits: [look] },
      'merge',
    )
    expect(summary.garmentsAdded).toBe(0)
    expect(summary.garmentsSkipped).toBe(2)
    expect(summary.garmentsRemoved).toBe(0)
  })

  it('survives a legacy garment that has no asset bundle at all', async () => {
    const legacy = makeGarment({ id: 'grm-legacy', asset: undefined })
    const { review } = await roundTrip({
      garments: [legacy],
      savedOutfits: [],
      currentOutfit: createEmptyOutfit(),
    })
    expect(review.garments).toEqual([legacy])
    expect(getGarmentDisplayImage(review.garments[0])).toBe(legacy.imageDataUrl)
  })
})
