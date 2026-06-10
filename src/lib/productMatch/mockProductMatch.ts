// Mock product / reference matching.
//
// Returns a small list of LOCAL DEMO reference candidates derived from draft
// metadata. It is deterministic, performs no network calls, and does NOT
// recognize the actual product — it never claims an exact/official/internet
// match. A manual-entry candidate is always offered first so the user stays in
// control. This is the seam where a real provider (with user consent) could one
// day return genuine source candidates; today it does not.
import type { ClothingCategory } from '../../domain/garmentTypes'
import type {
  ProductMatchCandidate,
  ProductMatchInput,
} from './productMatchTypes'

/** The always-present manual-entry candidate id. */
export const MANUAL_CANDIDATE_ID = 'manual-entry'

const CATEGORY_NOUN: Record<ClothingCategory, string> = {
  outerwear: 'outerwear',
  top: 'top',
  pants: 'trousers',
  shoes: 'footwear',
  accessory: 'accessory',
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Deterministic demo candidates. Manual entry is always first; the rest are
 * generic category/color/tag references (never the user's specific item).
 */
export function mockProductMatch(
  input: ProductMatchInput,
): ProductMatchCandidate[] {
  const noun = CATEGORY_NOUN[input.category]
  const color = input.color ? input.color.trim().toLowerCase() : ''
  const primaryTag = input.styleTags?.find((t) => t.trim().length > 0)

  const candidates: ProductMatchCandidate[] = [
    {
      id: MANUAL_CANDIDATE_ID,
      productName: 'User-confirmed manual archive entry',
      confidence: 1,
      reason: 'Enter your own product / reference details — nothing is matched for you.',
      tags: [],
      candidateType: 'manual',
    },
    {
      id: `demo-${input.category}`,
      productName: titleCase(`${color ? color + ' ' : ''}${noun} reference`),
      confidence: 0.6,
      reason: 'Local demo reference from category & color — confirm or edit.',
      tags: [input.category],
      candidateType: 'demo',
    },
  ]

  if (primaryTag) {
    candidates.push({
      id: `demo-${input.category}-${primaryTag}`,
      productName: titleCase(`${primaryTag} ${noun} reference`),
      confidence: 0.5,
      reason: 'Local demo reference from your style tags — confirm or edit.',
      tags: [primaryTag, input.category],
      candidateType: 'demo',
    })
  }

  return candidates
}
