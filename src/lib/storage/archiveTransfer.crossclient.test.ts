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
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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

/** Overridable so this can run against a checkout somewhere else. */
const SWIFT_PACKAGE =
  process.env.WARDROBE_DOMAIN_PATH ??
  join(process.env.HOME ?? '', 'Desktop/archive-ios/WardrobeDomain')

const STRICT = process.env.CROSSCLIENT_STRICT === '1'
const available = existsSync(join(SWIFT_PACKAGE, 'Package.swift'))

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

  execFileSync('swift', ['run', '-q', 'wardrobe-verify', 'reencode', input, output], {
    cwd: SWIFT_PACKAGE,
    encoding: 'utf8',
    // A slow first build must not look like a hang; a real failure surfaces as
    // a non-zero exit with Swift's own message attached.
    timeout: 300_000,
    env: { ...process.env, NO_COLOR: '1' },
  })

  return readFileSync(output, 'utf8')
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
    // Build once, out of band, so the first test is not charged for it and a
    // compile error reads as a compile error rather than a timeout.
    execFileSync('swift', ['build'], {
      cwd: SWIFT_PACKAGE,
      encoding: 'utf8',
      timeout: 600_000,
    })
  }, 600_000)

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
