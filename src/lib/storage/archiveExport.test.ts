import { describe, expect, it } from 'vitest'
import { makeGarment } from '../../test/factories'
import { createEmptyOutfit, type SavedOutfit } from '../../domain/outfitTypes'
import type { GarmentItem } from '../../domain/garmentTypes'
import { createMemoryBlobStore } from './assetBlobStore'
import { readArchiveFileText } from './archiveImport'
import { dataUrlToBlob } from './garmentAssetStorage'
import {
  ARCHIVE_EXPORT_ASSET_ENCODING,
  ARCHIVE_EXPORT_KIND,
  ARCHIVE_EXPORT_SCHEMA_VERSION,
  blobToDataUrl,
  buildArchiveExportBlob,
  suggestArchiveExportFileName,
  writeArchiveExport,
  type ArchiveExportInput,
} from './archiveExport'

const CUTOUT_DATA_URL = 'data:image/webp;base64,Y3V0b3V0LWJ5dGVz' // "cutout-bytes"
const CROP_DATA_URL = 'data:image/jpeg;base64,Y3JvcC1ieXRlcw==' // "crop-bytes"

const emptyInput = (
  garments: GarmentItem[] = [],
  savedOutfits: SavedOutfit[] = [],
): ArchiveExportInput => ({
  garments,
  savedOutfits,
  currentOutfit: createEmptyOutfit(),
})

/** Collect the writer's chunks; joining them must yield the whole document. */
async function collect(
  input: ArchiveExportInput,
  deps?: Parameters<typeof writeArchiveExport>[2],
) {
  const chunks: string[] = []
  const stats = await writeArchiveExport(input, (c) => chunks.push(c), {
    now: 1_700_000_000_000,
    ...deps,
  })
  return { chunks, stats, json: chunks.join('') }
}

describe('export document shape', () => {
  it('writes a versioned, self-describing envelope around the whole archive', async () => {
    const garment = makeGarment({ id: 'grm-a', name: 'Wool Overcoat' })
    const outfit: SavedOutfit = {
      id: 'look-1',
      name: 'Sunday',
      selection: { ...createEmptyOutfit(), top: 'grm-a' },
      createdAt: 1_699_000_000_000,
      coverHex: '#2b2b30',
    }
    const { json } = await collect({
      garments: [garment],
      savedOutfits: [outfit],
      currentOutfit: { ...createEmptyOutfit(), top: 'grm-a' },
    })

    const doc = JSON.parse(json)
    expect(doc.kind).toBe(ARCHIVE_EXPORT_KIND)
    expect(doc.schemaVersion).toBe(ARCHIVE_EXPORT_SCHEMA_VERSION)
    expect(doc.assetEncoding).toBe(ARCHIVE_EXPORT_ASSET_ENCODING)
    expect(doc.exportedAt).toBe(1_700_000_000_000)
    expect(doc.garments).toHaveLength(1)
    expect(doc.garments[0].name).toBe('Wool Overcoat')
    expect(doc.savedOutfits).toEqual([outfit])
    expect(doc.currentOutfit.top).toBe('grm-a')
  })

  it('produces valid JSON for an empty archive', async () => {
    const { json, stats } = await collect(emptyInput())
    expect(JSON.parse(json)).toMatchObject({ garments: [], savedOutfits: [] })
    expect(stats.garmentCount).toBe(0)
  })

  it('serializes one garment per chunk so no full copy is held twice', async () => {
    const garments = [makeGarment(), makeGarment(), makeGarment()]
    const { chunks } = await collect(emptyInput(garments))
    // header + one chunk per garment + footer
    expect(chunks).toHaveLength(garments.length + 2)
    expect(JSON.parse(chunks[1]).id).toBe(garments[0].id)
    expect(chunks[2].startsWith(',')).toBe(true)
  })

  it('buildArchiveExportBlob returns an application/json blob of the same text', async () => {
    const garments = [makeGarment({ name: 'Selvedge Denim' })]
    const { blob, stats } = await buildArchiveExportBlob(emptyInput(garments), {
      now: 1_700_000_000_000,
    })
    expect(blob.type).toBe('application/json')
    expect(stats.garmentCount).toBe(1)
    expect(await readArchiveFileText(blob)).toContain('Selvedge Denim')
  })
})

describe('blob-backed images are inlined as base64', () => {
  it('resolves a cutout ref into an inline data url and drops the ref', async () => {
    const store = createMemoryBlobStore(true, () => 1_700_000_000_000)
    const key = (await store.put(dataUrlToBlob(CUTOUT_DATA_URL)!))!
    // A garment as it looks after a reload: heavy bytes in the blob store, the
    // display url resolved to a (process-local) object url.
    const garment = makeGarment({
      asset: {
        originalImageUrl: 'data:image/png;base64,dGh1bWI=',
        displayImageUrl: `blob:memory/${key}`,
        assetMode: 'cutout',
        cutoutImageRef: { kind: 'indexeddb-blob', key },
      },
    })

    const { json, stats } = await collect(emptyInput([garment]), {
      blobStore: store,
    })
    const asset = JSON.parse(json).garments[0].asset

    expect(stats.inlinedImageCount).toBe(1)
    expect(stats.unresolvedImageCount).toBe(0)
    expect(asset.cutoutImageUrl).toBe(CUTOUT_DATA_URL)
    expect(asset.cutoutImageRef).toBeUndefined()
    // The display choice is re-derived from assetMode onto the inlined bytes.
    expect(asset.displayImageUrl).toBe(CUTOUT_DATA_URL)
  })

  it('inlines a cropped ref and keeps the assetMode precedence', async () => {
    const store = createMemoryBlobStore(true, () => 1_700_000_000_000)
    const key = (await store.put(dataUrlToBlob(CROP_DATA_URL)!))!
    const garment = makeGarment({
      asset: {
        originalImageUrl: '',
        displayImageUrl: '', // dehydrated
        assetMode: 'cropped',
        croppedImageRef: { kind: 'indexeddb-blob', key },
      },
    })

    const { json } = await collect(emptyInput([garment]), { blobStore: store })
    const asset = JSON.parse(json).garments[0].asset
    expect(asset.croppedImageUrl).toBe(CROP_DATA_URL)
    expect(asset.croppedImageRef).toBeUndefined()
    expect(asset.displayImageUrl).toBe(CROP_DATA_URL)
    // A blanked originalImageUrl falls back to the durable thumbnail.
    expect(asset.originalImageUrl).toBe(garment.imageDataUrl)
  })

  it('never writes a process-local object url into the document', async () => {
    const garment = makeGarment({
      asset: {
        originalImageUrl: 'blob:memory/gone',
        displayImageUrl: 'blob:memory/gone',
        assetMode: 'uploaded',
      },
    })
    const { json } = await collect(emptyInput([garment]))
    expect(json).not.toContain('blob:')
    const asset = JSON.parse(json).garments[0].asset
    expect(asset.displayImageUrl).toBe(garment.imageDataUrl)
  })

  it('a product reference is never shadowed by a stored cutout', async () => {
    const store = createMemoryBlobStore(true, () => 1_700_000_000_000)
    const key = (await store.put(dataUrlToBlob(CUTOUT_DATA_URL)!))!
    const garment = makeGarment({
      asset: {
        originalImageUrl: '',
        displayImageUrl: '',
        assetMode: 'product-reference',
        productReferenceImageUrl: 'https://example.test/ref.jpg',
        cutoutImageRef: { kind: 'indexeddb-blob', key },
      },
    })
    const { json } = await collect(emptyInput([garment]), { blobStore: store })
    const asset = JSON.parse(json).garments[0].asset
    expect(asset.displayImageUrl).toBe('https://example.test/ref.jpg')
    expect(asset.cutoutImageUrl).toBe(CUTOUT_DATA_URL) // still carried, just not shown
  })

  it('counts an unreadable ref and still exports the piece', async () => {
    const store = createMemoryBlobStore(true, () => 1_700_000_000_000)
    const garment = makeGarment({
      name: 'Orphaned Crop',
      asset: {
        originalImageUrl: '',
        displayImageUrl: '',
        assetMode: 'cropped',
        croppedImageRef: { kind: 'indexeddb-blob', key: 'asset_1_missing' },
      },
    })

    const { json, stats } = await collect(emptyInput([garment]), {
      blobStore: store,
    })
    expect(stats.unresolvedImageCount).toBe(1)
    expect(stats.inlinedImageCount).toBe(0)
    const exported = JSON.parse(json).garments[0]
    expect(exported.name).toBe('Orphaned Crop')
    // Degrades to the thumbnail rather than exporting a dead reference.
    expect(exported.asset.croppedImageUrl).toBeUndefined()
    expect(exported.asset.displayImageUrl).toBe(garment.imageDataUrl)
  })

  it('leaves a legacy garment without an asset untouched', async () => {
    const garment = makeGarment({ asset: undefined })
    const { json, stats } = await collect(emptyInput([garment]))
    expect(JSON.parse(json).garments[0]).toEqual(garment)
    expect(stats.inlinedImageCount).toBe(0)
  })
})

describe('blobToDataUrl', () => {
  it('round-trips with dataUrlToBlob', async () => {
    const blob = dataUrlToBlob(CUTOUT_DATA_URL)!
    expect(await blobToDataUrl(blob)).toBe(CUTOUT_DATA_URL)
  })
})

describe('suggestArchiveExportFileName', () => {
  it('is a dated, sortable json file name', () => {
    // Built from local-time parts, so assert against the same calendar day.
    const at = new Date(2026, 6, 27, 13, 45).getTime()
    expect(suggestArchiveExportFileName(at)).toBe('the-archive-2026-07-27.json')
  })
})
