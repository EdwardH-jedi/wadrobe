// Types for the (future) product / reference matching pipeline.
//
// These describe REFERENCE CANDIDATES only. There is **no** real internet
// search, product recognition, or image scraping. Candidates are local demo or
// manual references that the user confirms or edits — the user is always in
// control, and nothing is matched automatically.
import type { ClothingCategory } from '../../domain/garmentTypes'

export type CandidateType = 'demo' | 'manual' | 'reference'

export interface ProductMatchCandidate {
  id: string
  brand?: string
  productName?: string
  sourceUrl?: string
  imageUrl?: string
  /** 0..1 — a local demo heuristic score, NOT a real recognition confidence. */
  confidence: number
  /** Short, honest explanation shown to the user. */
  reason: string
  tags: string[]
  candidateType: CandidateType
}

export interface ProductMatchInput {
  category: ClothingCategory
  color?: string
  styleTags?: string[]
  name?: string
  brand?: string
}
