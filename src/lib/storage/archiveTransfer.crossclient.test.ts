// The only test that proves the two implementations agree.
//
// Everything else in this repository tests the web client against itself, and
// everything in the iOS package tests that package against itself. Both can be
// internally perfect and still disagree — and they did: the Swift encoder wrote
// no `kind`, so every file it produced would have been refused here, and
// nothing on either side could see it, because each round trip read its own
// output back with its own reader.
//
// This test runs the whole loop across the process boundary:
//
//   fixture → web importer → WEB EXPORTER → file
//           → swift decoder → SWIFT ENCODER → file
//           → web importer → compare
//
// It shells out to `wardrobe-verify reencode` in the Swift package. When that
// package is not present (CI, a clone without the sibling checkout) the suite
// skips rather than failing — a missing toolchain is not a format disagreement.
// `CROSSCLIENT_STRICT=1` turns the skip into a failure, which is what a machine
// that is supposed to have both should run.
import {
  requireWardrobeVerify,
  runVerifySync,
  SWIFT_PACKAGE,
  wardrobeDomainPresent,
} from '../../test/wardrobeDomain'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { GarmentItem } from '../../domain/garmentTypes'
import type { OutfitSelection, SavedOutfit } from '../../domain/outfitTypes'
import { writeArchiveExport, type ArchiveExportDeps, type ArchiveExportInput } from './archiveExport'
import { reviewArchiveImportText, type ArchiveImportReview } from './archiveImport'
import type { AssetBlobStore } from './assetBlobStore'

const FIXTURE_DIR = join(
  process.cwd(),
  'src/lib/storage/__fixtures__/archive-export',
)

const STRICT = process.env.CROSSCLIENT_STRICT === '1'
const available = wardrobeDomainPresent

if (STRICT && !available) {
  throw new Error(
    `CROSSCLIENT_STRICT=1 but no Swift package at ${SWIFT_PACKAGE}. ` +
      'Set WARDROBE_DOMAIN_PATH.',
  )
}

let workDir = ''

/** Run the Swift decoder+encoder over a file, returning what it wrote. */
function reencodeInSwift(name: string, json: string): string {
  const input = join(workDir, `${name}.web.json`)
  const output = join(workDir, `${name}.swift.json`)
  writeFileSync(input, json, 'utf8')

  // The built binary, not `swift run`: `swift run` re-resolves the package and
  // takes the SwiftPM lock on every call, which two parallel vitest workers
  // then contend for. globalSetup built this once before any worker started.
  runVerifySync(['reencode', input, output])

  return readFileSync(output, 'utf8')
}

/**
 * The full asset round trip, through real files on disk.
 *
 *   web export → Swift decode → one file per image → Swift read back → web
 *
 * `reencodeInSwift` proves the *fields* survive; this proves the *bytes* do,
 * having been through a filesystem in between. That is the gap
 * RECONCILIATION.md §5.1 describes: both sides treat an image field as an
 * opaque string, so a document round-trips byte for byte while every image in
 * it stays unusable.
 */
function materializeInSwift(
  name: string,
  json: string,
): { json: string; summary: Record<string, number | string>; assetFiles: string[] } {
  const input = join(workDir, `${name}.web.json`)
  const output = join(workDir, `${name}.materialized.json`)
  const assets = join(workDir, `${name}.assets`)
  mkdirSync(assets, { recursive: true })
  writeFileSync(input, json, 'utf8')

  const stdout = runVerifySync(['materialize', input, output, '--assets', assets])
  // The command prints one JSON line before its human output, so a test never
  // has to scrape prose.
  const line = stdout.split('\n').find((l) => l.trim().startsWith('{'))
  if (!line) throw new Error(`materialize printed no JSON summary:\n${stdout}`)

  return {
    json: readFileSync(output, 'utf8'),
    summary: JSON.parse(line) as Record<string, number | string>,
    assetFiles: readdirSync(assets),
  }
}

/**
 * The comparable content of a review. Deliberately not the whole object:
 * `exportedAt` is display-only metadata (§3) and `issues` describes the trip,
 * not the archive.
 */
function payload(review: ArchiveImportReview): {
  garments: GarmentItem[]
  savedOutfits: SavedOutfit[]
  currentOutfit: OutfitSelection
} {
  return {
    garments: review.garments,
    savedOutfits: review.savedOutfits,
    currentOutfit: review.currentOutfit,
  }
}

/** A real export, produced by the real exporter, from a fixture's contents. */
async function exportFromFixture(
  name: string,
  blobStore?: AssetBlobStore,
): Promise<{ source: ArchiveImportReview; json: string }> {
  const source = reviewArchiveImportText(
    readFileSync(join(FIXTURE_DIR, name), 'utf8'),
  )
  expect(source.ok).toBe(true)

  const json = await exportToString(
    {
      garments: source.garments,
      savedOutfits: source.savedOutfits,
      currentOutfit: source.currentOutfit,
    },
    { blobStore: blobStore ?? null, now: 1_753_577_000_000 },
  )
  return { source, json }
}

/**
 * The real exporter, collected into a string. Deliberately `writeArchiveExport`
 * rather than `buildArchiveExportBlob`: this is the same chunk sink the Blob
 * path uses, and jsdom's `Blob` has no `text()`.
 */
async function exportToString(
  input: ArchiveExportInput,
  deps: ArchiveExportDeps,
): Promise<string> {
  const parts: string[] = []
  await writeArchiveExport(input, (chunk) => parts.push(chunk), deps)
  return parts.join('')
}

describe.skipIf(!available)('cross-client round trip (web ⇄ WardrobeDomain)', () => {
  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'archive-crossclient-'))
    // The build happened once in globalSetup, before any worker started. This
    // only asserts the binary is really there, so a missing one fails here with
    // an explanation rather than inside the first reencode.
    requireWardrobeVerify()
  }, 60_000)

  // The fixtures that represent a real archive. The malformed ones are the
  // other implementation's problem to reject, which Phase 3 already asserts on
  // both sides; a round trip needs something that survives the first leg.
  const ROUND_TRIPPABLE = [
    'minimal-valid.json',
    'empty-archive.json',
    'full-featured.json',
    'legacy-records.json',
    'blob-backed-inlined.json',
    'unrecognized-enums.json',
  ]

  it.each(ROUND_TRIPPABLE)(
    '%s survives web → Swift → web unchanged',
    async (name) => {
      const { source, json } = await exportFromFixture(name)
      const returned = reviewArchiveImportText(reencodeInSwift(name, json))

      expect(returned.ok).toBe(true)
      // Nothing may be dropped on the way back. A warning is acceptable (it
      // describes something the file already carried); a drop is data loss.
      expect(returned.issues.filter((i) => i.severity === 'dropped')).toEqual([])
      expect(payload(returned)).toEqual(payload(source))
    },
    300_000,
  )

  it('a Swift-written file is recognised as an archive export at all', async () => {
    const { json } = await exportFromFixture('full-featured.json')
    const swiftJson = reencodeInSwift('kind-check', json)
    const parsed = JSON.parse(swiftJson) as Record<string, unknown>

    // The divergence that broke this direction and that neither suite could
    // see on its own (§3).
    expect(parsed.kind).toBe('fit-archive.archive')
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.assetEncoding).toBe('inline-data-url')
  }, 300_000)

  it('image bytes cross the boundary intact, not just image fields', async () => {
    // The real question §5 asks: an export carries pixels, and a decoder that
    // treats an image field as an opaque string must return those exact bytes.
    const { source, json } = await exportFromFixture('full-featured.json')
    const returned = reviewArchiveImportText(reencodeInSwift('bytes', json))

    const before = source.garments.map((g) => g.imageDataUrl)
    const after = returned.garments.map((g) => g.imageDataUrl)
    expect(after).toEqual(before)
    expect(before.every((url) => url.startsWith('data:'))).toBe(true)

    // And the percent-encoded form, which is the one a base64-only decoder
    // silently mangles (§5.1).
    const legacy = await exportFromFixture('legacy-records.json')
    const legacyBack = reviewArchiveImportText(
      reencodeInSwift('bytes-legacy', legacy.json),
    )
    expect(legacyBack.garments.map((g) => g.imageDataUrl)).toEqual(
      legacy.source.garments.map((g) => g.imageDataUrl),
    )
    expect(legacy.source.garments[0].imageDataUrl).toContain('data:image/svg+xml,%3C')
  }, 300_000)

  // --- Assets: the bytes, through a filesystem ------------------------------

  /** A real 1x1 PNG. Genuine signature, IHDR, IDAT and IEND. */
  const ONE_PIXEL_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  /** A real minimal JPEG. */
  const TINY_JPEG_BASE64 =
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

  it('real image bytes survive web → Swift → files on disk → Swift → web', async () => {
    // The end-to-end proof for RECONCILIATION.md §5.1. Every other test here
    // compares image *fields*; this one writes the images to a filesystem in
    // between and compares the *bytes* on the far side.
    const png = `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`
    const jpeg = `data:image/jpeg;base64,${TINY_JPEG_BASE64}`

    const base = reviewArchiveImportText(
      readFileSync(join(FIXTURE_DIR, 'minimal-valid.json'), 'utf8'),
    )
    const garments: GarmentItem[] = [
      {
        ...base.garments[0],
        id: 'grm-png',
        imageDataUrl: png,
        asset: {
          originalImageUrl: png,
          displayImageUrl: png,
          assetMode: 'uploaded',
        },
      },
      {
        ...base.garments[0],
        id: 'grm-jpeg',
        imageDataUrl: jpeg,
        asset: {
          originalImageUrl: jpeg,
          displayImageUrl: jpeg,
          croppedImageUrl: png,
          assetMode: 'cropped',
        },
      },
    ]

    const json = await exportToString(
      {
        garments,
        savedOutfits: [],
        currentOutfit: base.currentOutfit as OutfitSelection,
      },
      { blobStore: null, now: 1_753_577_000_000 },
    )

    const { json: back, summary, assetFiles } = materializeInSwift('real-images', json)

    // Two distinct images, each appearing in several fields: two files, not six.
    expect(summary.imagesWritten).toBe(2)
    expect(summary.imageFailures).toBe(0)
    expect(assetFiles.length).toBe(2)
    // The extension comes from the bytes, so a PNG is stored as .png.
    expect(assetFiles.some((f) => f.endsWith('.png'))).toBe(true)
    expect(assetFiles.some((f) => f.endsWith('.jpg'))).toBe(true)

    // Every reference resolved once materialized — this is the count that was 16.
    expect(summary.unusableReferences).toBe(0)
    expect(summary.missingReferences).toBe(0)

    // And the bytes came back byte for byte, having been on a disk.
    const returned = reviewArchiveImportText(back)
    expect(returned.ok).toBe(true)
    const byId = new Map(returned.garments.map((g) => [g.id, g]))

    const pngBack = byId.get('grm-png')!
    expect(pngBack.imageDataUrl).toBe(png)
    expect(pngBack.asset?.originalImageUrl).toBe(png)
    expect(pngBack.asset?.displayImageUrl).toBe(png)

    const jpegBack = byId.get('grm-jpeg')!
    expect(jpegBack.imageDataUrl).toBe(jpeg)
    expect(jpegBack.asset?.croppedImageUrl).toBe(png)
  }, 300_000)

  it('a payload that is not an image is reported, and never written', async () => {
    // The other half of the contract: a bad image must not fail the document,
    // must not produce a file, and must be reported the way every other drop is.
    const good = `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`
    const notAnImage = `data:image/png;base64,${Buffer.from('definitely not an image').toString('base64')}`

    const base = reviewArchiveImportText(
      readFileSync(join(FIXTURE_DIR, 'minimal-valid.json'), 'utf8'),
    )
    const json = await exportToString(
      {
        garments: [
          { ...base.garments[0], id: 'grm-good', imageDataUrl: good },
          { ...base.garments[0], id: 'grm-bad', imageDataUrl: notAnImage },
        ],
        savedOutfits: [],
        currentOutfit: base.currentOutfit as OutfitSelection,
      },
      { blobStore: null, now: 1_753_577_000_000 },
    )

    const { json: back, summary, assetFiles } = materializeInSwift('bad-image', json)

    expect(summary.imagesWritten).toBe(1)
    expect(summary.imageFailures).toBe(1)
    expect(assetFiles.length).toBe(1)

    // Both garments survive; the document is not failed by one bad image.
    const returned = reviewArchiveImportText(back)
    expect(returned.ok).toBe(true)
    expect(returned.garments.map((g) => g.id).sort()).toEqual(['grm-bad', 'grm-good'])
    // The good one resolved; the bad one still carries what the producer wrote.
    const byId = new Map(returned.garments.map((g) => [g.id, g]))
    expect(byId.get('grm-good')!.imageDataUrl).toBe(good)
    expect(byId.get('grm-bad')!.imageDataUrl).toBe(notAnImage)
  }, 300_000)

  it('full-featured.json: every real image resolves, and the placeholders do not', async () => {
    // RECONCILIATION.md §5.1 records 16 unusable references for this fixture.
    // After materialization the ones that are genuinely images resolve; what
    // remains is the fixture's own ASCII placeholders — `crop-bytes`,
    // `thumb-bytes`, `cutout-bytes` — which are not images and which the
    // pipeline is CORRECT to refuse. Writing `crop-bytes` into a .jpg would be
    // the bug, not the fix.
    //
    // So the honest assertion is not "zero" but "zero that were ever images",
    // and this pins both halves so neither can regress.
    const { json } = await exportFromFixture('full-featured.json')
    const { summary } = materializeInSwift('full-featured-assets', json)

    // The eight real 38-byte WEBP payloads are identical, so they deduplicate
    // to a single file.
    expect(summary.imagesWritten).toBe(1)
    expect(summary.filesOnDisk).toBe(1)
    // Seven fields carry ASCII placeholders and are refused, with a reason.
    expect(summary.imageFailures).toBe(7)
    // Nothing that resolved is missing: no half-written files.
    expect(summary.missingReferences).toBe(0)
    // Down from 16, and every remaining one is a placeholder rather than an
    // image the pipeline failed to store.
    expect(summary.unusableReferences).toBeLessThan(16)
    expect(summary.unusableReferences).toBe(8)
  }, 300_000)

  it('blob-backed bytes resolved at export time survive the trip', async () => {
    // The one path a fixture cannot cover, because a fixture is already a file:
    // a garment whose crop lives in the IndexedDB blob store. The exporter must
    // inline it as base64 and drop the ref, and those bytes must come back.
    const cropped = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], {
      type: 'image/webp',
    })
    const store: AssetBlobStore = {
      put: async () => 'unused',
      get: async (key: string) =>
        key === 'asset_1753577000000_abc' ? cropped : null,
      delete: async () => {},
      keys: async () => ['asset_1753577000000_abc'],
      available: () => true,
    } as unknown as AssetBlobStore

    const base = reviewArchiveImportText(
      readFileSync(join(FIXTURE_DIR, 'minimal-valid.json'), 'utf8'),
    )
    const garment: GarmentItem = {
      ...base.garments[0],
      asset: {
        originalImageUrl: base.garments[0].imageDataUrl,
        displayImageUrl: '',
        assetMode: 'cropped',
        croppedImageRef: {
          kind: 'indexeddb-blob',
          key: 'asset_1753577000000_abc',
          mimeType: 'image/webp',
          byteSize: 8,
        },
      },
    }

    const exported = await exportToString(
      {
        garments: [garment],
        savedOutfits: [],
        currentOutfit: base.currentOutfit,
      },
      { blobStore: store, now: 1_753_577_000_000 },
    )

    // The exporter did its job: bytes inlined, pointer gone (§5.2).
    expect(exported).not.toContain('indexeddb-blob')
    expect(exported).toContain('data:image/webp;base64,AQIDBAUGBwg=')

    const returned = reviewArchiveImportText(reencodeInSwift('blob', exported))
    expect(returned.ok).toBe(true)
    expect(returned.garments).toHaveLength(1)
    expect(returned.garments[0].asset?.croppedImageUrl).toBe(
      'data:image/webp;base64,AQIDBAUGBwg=',
    )
    expect(returned.garments[0].asset?.croppedImageRef).toBeUndefined()
  }, 300_000)

  it('a second lap changes nothing — the trip is idempotent, not merely lossless', async () => {
    // One lap can hide a systematic rewrite that happens to be self-consistent.
    // Two laps that produce identical bytes cannot.
    const { json } = await exportFromFixture('full-featured.json')
    const first = reencodeInSwift('lap1', json)
    const second = reencodeInSwift('lap2', first)

    expect(second).toBe(first)
  }, 300_000)
})
