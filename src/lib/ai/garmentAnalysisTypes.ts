// Types for the (future) AI garment image analysis pipeline.
//
// This module deliberately contains NO model calls. It defines the contract a
// real Vision provider would implement so the UI and storage layers can be
// built against a stable shape today. See `docs/AI_IMAGE_PIPELINE.md`.
import type { ClothingCategory } from '../../domain/garmentTypes'

/** Where a guess came from. Only 'mock' is implemented in this build. */
export type AnalysisSource = 'mock' | 'vision-api'

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
 * Minimal input the analyzer needs. The real pipeline would also receive the
 * raw image bytes; the mock only needs lightweight hints so it can run in any
 * environment (including jsdom, where there is no canvas).
 */
export interface GarmentAnalysisInput {
  fileName: string
  fileSizeBytes?: number
  /** Optional dominant color sampled from the image by `imageFileUtils`. */
  dominantColorHex?: string
}

/** The contract any analyzer (mock or real) implements. */
export interface GarmentAnalyzer {
  analyze(input: GarmentAnalysisInput): Promise<GarmentAnalysisGuess>
}
