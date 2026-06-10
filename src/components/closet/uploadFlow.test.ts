import { describe, expect, it } from 'vitest'
import {
  UPLOAD_COPY,
  initialUploadState,
  uploadReducer,
  type UploadState,
} from './uploadFlow'
import { emptyGarmentDraft } from '../../domain/garmentDraft'
import { buildUploadedAsset } from '../../domain/garmentAsset'
import type { GarmentAnalysisGuess } from '../../lib/ai/garmentAnalysisTypes'
import type { ProductMatchCandidate } from '../../lib/productMatch/productMatchTypes'
import { makeGarment } from '../../test/factories'
import { FORBIDDEN_CLAIM_TERMS } from '../../test/honesty'

const guess: GarmentAnalysisGuess = {
  category: 'top',
  color: 'Charcoal',
  colorHex: '#2b2b30',
  styleTags: ['minimal'],
  confidence: 0.8,
  source: 'mock',
}

const cropState = (): UploadState =>
  uploadReducer(initialUploadState, {
    type: 'SUGGESTED',
    // The modal seeds an "uploaded" asset at scan time; mirror that here.
    draft: {
      ...emptyGarmentDraft('data:img'),
      asset: buildUploadedAsset('data:img'),
    },
    guess,
  })

// The crop step (skippable) lands on the cutout step.
const cutoutState = (): UploadState =>
  uploadReducer(cropState(), { type: 'APPLY_CROP', croppedImageUrl: null })

// The cutout step (skippable) lands on review; from review onwards behaves as before.
const reviewState = (): UploadState =>
  uploadReducer(cutoutState(), { type: 'APPLY_CUTOUT', cutoutImageUrl: null })

describe('uploadReducer', () => {
  it('starts idle', () => {
    expect(initialUploadState.status).toBe('idle')
  })

  it('rejects an invalid file without leaving idle', () => {
    const s = uploadReducer(initialUploadState, {
      type: 'REJECT',
      message: 'not an image',
    })
    expect(s.status).toBe('idle')
    expect(s.error).toBe('not an image')
    expect(s.draft).toBeNull()
  })

  it('moves idle → scanning, and scanning → error on a read failure', () => {
    const scanning = uploadReducer(initialUploadState, { type: 'SCAN_START' })
    expect(scanning.status).toBe('scanning')

    const failed = uploadReducer(scanning, {
      type: 'SCAN_FAIL',
      message: 'unreadable',
    })
    expect(failed.status).toBe('error')
    expect(failed.error).toBe('unreadable')
  })

  it('SUGGESTED carries the draft + guess into the crop step', () => {
    const s = cropState()
    expect(s.status).toBe('crop')
    expect(s.draft?.imageDataUrl).toBe('data:img')
    expect(s.guess).toBe(guess)
  })

  it('APPLY_CROP with a crop sets croppedImageUrl + assetMode cropped, then cutout', () => {
    const s = uploadReducer(cropState(), {
      type: 'APPLY_CROP',
      croppedImageUrl: 'data:cropped',
    })
    expect(s.status).toBe('cutout')
    expect(s.draft?.asset?.croppedImageUrl).toBe('data:cropped')
    expect(s.draft?.asset?.displayImageUrl).toBe('data:cropped')
    expect(s.draft?.asset?.assetMode).toBe('cropped')
  })

  it('APPLY_CROP with null skips crop — assetMode stays uploaded, display unchanged', () => {
    const s = uploadReducer(cropState(), {
      type: 'APPLY_CROP',
      croppedImageUrl: null,
    })
    expect(s.status).toBe('cutout')
    expect(s.draft?.asset?.assetMode).toBe('uploaded')
    expect(s.draft?.asset?.croppedImageUrl).toBeUndefined()
    expect(s.draft?.asset?.displayImageUrl).toBe('data:img')
  })

  it('ignores APPLY_CROP outside the crop step', () => {
    expect(
      uploadReducer(initialUploadState, {
        type: 'APPLY_CROP',
        croppedImageUrl: 'data:cropped',
      }),
    ).toBe(initialUploadState)
  })

  it('APPLY_CUTOUT accepting a cutout sets cutoutImageUrl + display + assetMode cutout, then review', () => {
    const s = uploadReducer(cutoutState(), {
      type: 'APPLY_CUTOUT',
      cutoutImageUrl: 'data:cutout',
    })
    expect(s.status).toBe('review')
    expect(s.draft?.asset?.cutoutImageUrl).toBe('data:cutout')
    expect(s.draft?.asset?.displayImageUrl).toBe('data:cutout')
    expect(s.draft?.asset?.assetMode).toBe('cutout')
  })

  it('APPLY_CUTOUT with null skips cutout — display + assetMode unchanged (non-blocking)', () => {
    const s = uploadReducer(cutoutState(), {
      type: 'APPLY_CUTOUT',
      cutoutImageUrl: null,
    })
    expect(s.status).toBe('review')
    expect(s.draft?.asset?.assetMode).toBe('uploaded')
    expect(s.draft?.asset?.cutoutImageUrl).toBeUndefined()
    expect(s.draft?.asset?.displayImageUrl).toBe('data:img')
  })

  it('a skipped/failed cutout still reaches review — the flow never gets stuck', () => {
    // Reaching review (and thus archiving) after APPLY_CUTOUT null proves a
    // failed/unavailable cutout is non-blocking.
    expect(reviewState().status).toBe('review')
  })

  it('ignores APPLY_CUTOUT outside the cutout step', () => {
    expect(
      uploadReducer(initialUploadState, {
        type: 'APPLY_CUTOUT',
        cutoutImageUrl: 'data:cutout',
      }),
    ).toBe(initialUploadState)
  })

  it('EDIT_DRAFT patches the draft only while in review', () => {
    const edited = uploadReducer(reviewState(), {
      type: 'EDIT_DRAFT',
      patch: { name: 'Wool Tee' },
    })
    expect(edited.draft?.name).toBe('Wool Tee')

    // No-op outside review (returns the same state reference).
    expect(
      uploadReducer(initialUploadState, {
        type: 'EDIT_DRAFT',
        patch: { name: 'x' },
      }),
    ).toBe(initialUploadState)
  })

  it('moves review → reference (with candidates) and back', () => {
    const candidates: ProductMatchCandidate[] = [
      {
        id: 'manual-entry',
        confidence: 1,
        reason: 'demo',
        tags: [],
        candidateType: 'manual',
      },
    ]
    const reference = uploadReducer(reviewState(), {
      type: 'TO_REFERENCE',
      candidates,
    })
    expect(reference.status).toBe('reference')
    expect(reference.candidates).toBe(candidates)

    expect(uploadReducer(reference, { type: 'BACK_TO_REVIEW' }).status).toBe(
      'review',
    )
  })

  it('reference is skippable — the scan-built uploaded asset is unchanged with no edits', () => {
    const reference = uploadReducer(reviewState(), {
      type: 'TO_REFERENCE',
      candidates: [],
    })
    expect(reference.draft?.asset?.assetMode).toBe('uploaded')
    expect(reference.draft?.asset?.displayImageUrl).toBe('data:img')
  })

  it('EDIT_DRAFT also applies in the reference step', () => {
    const reference = uploadReducer(reviewState(), {
      type: 'TO_REFERENCE',
      candidates: [],
    })
    const edited = uploadReducer(reference, {
      type: 'EDIT_DRAFT',
      patch: {
        asset: {
          ...reference.draft!.asset!,
          assetMode: 'product-reference',
          displayImageUrl: 'https://ref.example/img.jpg',
        },
      },
    })
    expect(edited.draft?.asset?.assetMode).toBe('product-reference')
  })

  it('confirms only from the reference step: review → reference → archiving → archived', () => {
    const garment = makeGarment({ id: 'grm-1', name: 'Wool Tee' })
    // ARCHIVE_START is ignored from review — confirm must come from reference.
    expect(
      uploadReducer(reviewState(), { type: 'ARCHIVE_START', garment }).status,
    ).toBe('review')

    const reference = uploadReducer(reviewState(), {
      type: 'TO_REFERENCE',
      candidates: [],
    })
    const archiving = uploadReducer(reference, { type: 'ARCHIVE_START', garment })
    expect(archiving.status).toBe('archiving')
    expect(archiving.garment).toBe(garment)

    const archived = uploadReducer(archiving, { type: 'ARCHIVE_DONE' })
    expect(archived.status).toBe('archived')
    expect(archived.garment).toBe(garment)
  })

  it('ignores ARCHIVE_START unless in the reference step', () => {
    const garment = makeGarment({ id: 'grm-1' })
    expect(
      uploadReducer(initialUploadState, { type: 'ARCHIVE_START', garment }),
    ).toBe(initialUploadState)
  })

  it('RESET returns to idle from any state', () => {
    expect(uploadReducer(reviewState(), { type: 'RESET' })).toEqual(
      initialUploadState,
    )
  })
})

describe('UPLOAD_COPY honesty', () => {
  it('never implies real AI / product recognition / 3D try-on', () => {
    for (const value of Object.values(UPLOAD_COPY)) {
      expect(value).not.toMatch(FORBIDDEN_CLAIM_TERMS)
    }
  })
})
