# Cycle 1 — Empty market-value state guidance (Scope 2 backlog #1)

> ⚠️ 에이전트 자체 평가 — 자기평가 편향 가능, 사용자 재검토 필요.
> (Agent self-evaluation. Self-assessment bias is possible; user re-review needed.)

## Task
Scope 2 backlog #1 — "빈 시세 상태 안내": pieces with no recorded market value
showed nothing on the archive card, hiding the manual tracker. Add a
discoverability hint for un-recorded pieces.

## What changed
- `marketValueCopy.ts` — new honest `emptyHint` copy string.
- `ArchiveCard.tsx` — render the hint when there is no `valueEntry`
  (`!valueEntry`), directly after the trend block.
- `archive-theme.css` — `.archive-card__value-empty` (muted, small).
- `ArchiveCard.test.tsx` — **updated** the "no history" test to the new intent
  (trend/sparkline still absent; hint now present). See DECISIONS D4 — this is a
  requirement-changed test update, not a weakened gate; called out explicitly.

## Pipeline record
| Stage | Result |
|---|---|
| Gate #1 (typecheck/lint/test/build, Node 20) | GREEN — 433 tests |
| Codex review (review-only) | **[blocker] none · [major] none · [minor] none** |
| Fix pass | not triggered (no blocker/major) |
| Gate #2 | not needed (no fix; Gate #1 authoritative) |

Codex independently verified the hint's "when you edit this piece" pointer maps
to a real workflow (the market-value entry UI lives in the edit modal), so the
copy is not pointing at a missing flow.

## Honesty check
`emptyHint` contains no FORBIDDEN_CLAIM_TERMS and keeps the "manual estimate"
framing; the `MarketValuePanel` honesty test (which joins all copy) stays green.

## Observation checklist (draft — user to re-review)
- **Was the gate authoritative?** Yes — gate ran before review; a hypothetical
  red would have blocked the commit regardless of review opinion.
- **Did the reviewer stay in-lane (no rewrites)?** Yes — Codex returned
  problems-only (here, none) and explored read-only.
- **Did the loop need the fix pass?** No — clean review. This cycle exercises the
  happy path (green gate + clean review).
- **Test-integrity risk?** One test updated for a legitimately-changed
  requirement, documented in D4. No test weakened to pass a broken feature.
- **Friction noted:** Codex `exec` emits a harmless `no such table: jobs` memories
  warning; the review verdict is unaffected. The review prints exploration noise
  before the verdict — the harness should capture full output to a file (done).
