import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_SOURCE_LABEL,
  describeArchiveProvenance,
  formatConfidence,
} from './archiveProvenance'
import type { GarmentItem } from './garmentTypes'

function garment(overrides: Partial<GarmentItem> = {}): GarmentItem {
  return {
    id: 'g1',
    name: 'Piece',
    category: 'top',
    color: 'Charcoal',
    colorHex: '#2b2b30',
    styleTags: [],
    imageDataUrl: 'data:,',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

describe('describeArchiveProvenance', () => {
  it('reports the analyzer draft with confidence and edited flag', () => {
    const p = describeArchiveProvenance(
      garment({
        analysisSource: 'mock',
        analysisConfidence: 0.85,
        userEdited: true,
      }),
    )
    expect(p.analysis).toEqual({ source: 'mock', confidence: 0.85, edited: true })
  })

  it('treats a missing userEdited as not edited, and absent source as no analysis', () => {
    expect(
      describeArchiveProvenance(garment({ analysisSource: 'vision-api' }))
        .analysis,
    ).toEqual({ source: 'vision-api', confidence: undefined, edited: false })
    expect(describeArchiveProvenance(garment()).analysis).toBeNull()
  })

  it('surfaces a product reference only when a source URL is attached', () => {
    const withRef = describeArchiveProvenance(
      garment({
        asset: {
          originalImageUrl: 'data:,',
          displayImageUrl: 'data:,',
          assetMode: 'uploaded',
          sourceUrl: 'https://shop.example/p/jacket',
          sourceLabel: 'Racing Jacket',
        },
      }),
    )
    expect(withRef.reference).toEqual({
      url: 'https://shop.example/p/jacket',
      label: 'Racing Jacket',
    })
    expect(describeArchiveProvenance(garment()).reference).toBeNull()
  })
})

describe('formatConfidence', () => {
  it('renders a percentage or null', () => {
    expect(formatConfidence(0.85)).toBe('85%')
    expect(formatConfidence(undefined)).toBeNull()
    expect(formatConfidence(Number.NaN)).toBeNull()
  })
})

describe('ANALYSIS_SOURCE_LABEL', () => {
  it('uses honest, non-overclaiming labels', () => {
    expect(ANALYSIS_SOURCE_LABEL.mock).toBe('Demo guess')
    expect(ANALYSIS_SOURCE_LABEL['vision-api']).toBe('Vision draft')
  })
})
