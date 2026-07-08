# Proposal report — Backlog #3: Expose market value on the closet card

> **Not implemented (by instruction).** Concrete proposal only. Today market
> value shows on the `ArchiveCard` (details modal + lookbook) but not on the
> `GarmentCard` (the closet grid). The user found that under-discoverable.

## Where it stands now
`GarmentCard.tsx` (the grid tile) shows: category badge, optional 3D badge,
photo, name, brand, color dot + name, `createdAt`, up to 3 tags, and the action
row (Style / 3D / Details / Edit / Remove). **No market value.** The value trend
lives only on `ArchiveCard` (`archive-card__value`), reached via the Details
(info) button. Cycle 1 added an empty-state hint there too — but a user scanning
the grid still sees nothing about value.

## Proposal — a compact value chip in the card meta row
Add ONE compact, honest line to the closet card, only when a value is recorded,
so the grid stays calm for un-valued pieces.

**Placement:** a new muted row directly under the existing
`garment-card__meta` row (color + date), e.g.:

```
[● Charcoal] ............ Mar 3        ← existing meta
Value 140 USD ▲ +40                    ← NEW, only when latestMarketValue exists
```

**Form / rules**
- Reuse `latestMarketValue(garment)` + `marketValueDelta(garment)` (already pure,
  tested) — no new math.
- Label with the honest framing: reuse `MARKET_VALUE_COPY.cardLabel`
  ("Market value · manual estimate") as a `title`/`aria`, show a compact
  "Value <n> <ccy>" inline. Keep the delta arrow tiny; drop the percent on the
  grid (space).
- **Do NOT** show the empty-state hint on the grid tile — that would add noise to
  every un-valued card. Discoverability for un-valued pieces stays on the
  Details card (cycle 1). The grid only *rewards* pieces that have a value.
- Respect the existing multiply/light-panel and token rules (CLAUDE.md §4); use
  `var(--text-*)`, no hardcoded colors; reuse `.archive-card__delta--{up,down}`
  color intent or a new `.garment-card__value` scoped class.

**Why a chip, not the full trend:** the grid tile is dense and reused in the
styling flow; a full sparkline/updates/as-of block belongs on the Details card.
One value + arrow is enough signal to make the feature discoverable and to invite
a click into Details.

## Expected changed files
- `src/components/closet/GarmentCard.tsx` — import the two helpers + `MARKET_VALUE_COPY`;
  render the conditional chip after the meta row (~10 lines).
- `src/styles/archive-theme.css` — `.garment-card__value` (+ up/down accent),
  compact, muted.
- `src/components/closet/GarmentCard.test.tsx` (if present) or a new test —
  assert the chip shows with history and is absent without.

## Risk / size
**S.** Pure-helper reuse, one conditional block, no state, no provider change. The
only judgment call is visual density on the grid — a **user taste decision**
(hence proposal-only): confirm the chip earns its space before building.
