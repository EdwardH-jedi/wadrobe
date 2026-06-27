// Types for the garment image analysis pipeline.
//
// This module defines the analyzer contract. The DEFAULT analyzer is the local
// deterministic mock (no model, no network). An OPTIONAL real vision provider
// can be selected via env (Phase 4 — `createAnalyzer.ts` + `api/analyze.ts`),
// off by default. See `docs/AI_IMAGE_PIPELINE.md`.
import type {
  ClothingCategory,
  GarmentDraft,
} from '../../domain/garmentTypes'

// Canonical home is the domain (so `GarmentItem` can record provenance without
// an upward import). Re-exported here for existing call sites.
export type { AnalysisSource } from '../../domain/garmentTypes'
import type { AnalysisSource } from '../../domain/garmentTypes'

/**
 * A non-binding guess about a garment from its image. The user must always
 * confirm or edit these values before a garment is saved.
 */
export interface GarmentAnalysisGuess {
  category: ClothingCategory
  color: string
  colorHex: string
  styleTags: string[]
  /** Brand detection is a future capability; the mock never fabricates one. */
  brand?: string
  /** Model confidence, 0..1. */
  confidence: number
  source: AnalysisSource
}

/**
 * Input the analyzer receives. The mock only needs the lightweight hints
 * (`fileName`/`fileSizeBytes`/`dominantColorHex`) so it runs anywhere (including
 * jsdom, where there is no canvas). A real vision provider also needs the image:
 * `imageDataUrl` carries the **downscaled thumbnail** data URL (Phase 4) and is
 * optional — the mock ignores it.
 */
export interface GarmentAnalysisInput {
  fileName: string
  fileSizeBytes?: number
  /** Optional dominant color sampled from the image by `imageFileUtils`. */
  dominantColorHex?: string
  /** Downscaled thumbnail data URL, for a real vision provider (Phase 4). */
  imageDataUrl?: string
}

/** The contract any analyzer (mock or real) implements. */
export interface GarmentAnalyzer {
  analyze(input: GarmentAnalysisInput): Promise<GarmentAnalysisGuess>
}

/**
 * The analysis-provenance fields carried onto a stored garment (Phase 1). These
 * are NOT user-editable draft fields — they are derived from the guess at archive
 * time, so they live outside `GarmentDraft`.
 */
export interface GarmentAnalysisProvenance {
  analysisConfidence?: number
  analysisSource?: AnalysisSource
  userEdited?: boolean
}

/**
 * Did the user change any field the guess actually suggested? Compares only what
 * a guess carries (category, color, colorHex, styleTags, brand); `styleTags` is
 * order-insensitive. Name and notes are never compared — the guess never
 * suggests them.
 */
export function didUserEditGuess(
  draft: Pick<
    GarmentDraft,
    'category' | 'color' | 'colorHex' | 'styleTags' | 'brand'
  >,
  guess: GarmentAnalysisGuess,
): boolean {
  if (draft.category !== guess.category) return true
  if (draft.color !== guess.color) return true
  if (draft.colorHex !== guess.colorHex) return true
  if ((draft.brand ?? '') !== (guess.brand ?? '')) return true
  const a = [...draft.styleTags].sort()
  const b = [...guess.styleTags].sort()
  if (a.length !== b.length) return true
  return a.some((tag, i) => tag !== b[i])
}

/**
 * Map an accepted draft + its originating guess to the provenance fields stored
 * on the garment. Pass `guess: null` (e.g. a hand-built garment) to record
 * nothing.
 */
export function deriveAnalysisProvenance(
  draft: Pick<
    GarmentDraft,
    'category' | 'color' | 'colorHex' | 'styleTags' | 'brand'
  >,
  guess: GarmentAnalysisGuess | null,
): GarmentAnalysisProvenance {
  if (!guess) return {}
  return {
    analysisConfidence: guess.confidence,
    analysisSource: guess.source,
    userEdited: didUserEditGuess(draft, guess),
  }
}
