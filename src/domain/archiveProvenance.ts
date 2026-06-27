// Honest provenance descriptor for an archived piece (Wardrobe Flow A2).
//
// The stored provenance is garment-LEVEL (analysisSource/confidence/userEdited)
// plus the structural fact of whether a product reference URL was attached. We
// therefore describe origin at the granularity the data actually supports —
// "the category/color/tags are an analyzer draft" and "these came from a product
// page you provided" — and never claim per-field certainty we do not store.
import type { AnalysisSource, GarmentItem } from './garmentTypes'

export interface AnalysisProvenance {
  source: AnalysisSource
  /** 0..1 when recorded. */
  confidence?: number
  /** True once the user changed a suggested field (or edited the piece). */
  edited: boolean
}

export interface ReferenceProvenance {
  url: string
  /** The product name read from / entered for the reference, when present. */
  label?: string
}

export interface ArchiveProvenance {
  /** Draft analysis behind category/color/style tags. null when none recorded. */
  analysis: AnalysisProvenance | null
  /** A user-provided product page the reference meta came from. null when none. */
  reference: ReferenceProvenance | null
}

/** Honest, human-readable label for the analysis source (never "AI"/"exact"). */
export const ANALYSIS_SOURCE_LABEL: Record<AnalysisSource, string> = {
  mock: 'Demo guess',
  'vision-api': 'Vision draft',
}

export function describeArchiveProvenance(garment: GarmentItem): ArchiveProvenance {
  const analysis: AnalysisProvenance | null = garment.analysisSource
    ? {
        source: garment.analysisSource,
        confidence: garment.analysisConfidence,
        edited: garment.userEdited === true,
      }
    : null

  const url = garment.asset?.sourceUrl
  const reference: ReferenceProvenance | null = url
    ? { url, label: garment.asset?.sourceLabel }
    : null

  return { analysis, reference }
}

/** "85%" for a 0..1 confidence, or null when not recorded. */
export function formatConfidence(confidence: number | undefined): string | null {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null
  return `${Math.round(confidence * 100)}%`
}
