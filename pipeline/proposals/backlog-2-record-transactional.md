# Proposal report — Backlog #2: Record-value append-only vs transactional

> **Not implemented (by instruction).** Current append-only behavior is kept as
> the default; the transactional/modal-confirm variant is a UX decision reserved
> for the user. This report compares the two so that decision is informed.

## Current behavior (append-only, immediate commit)
`MarketValuePanel` → `recordMarketValue(id, value)`
(`ArchiveProvider.tsx:221`). On the **Record value** click it *immediately*:
1. Builds an entry `{ id, at: Date.now(), value, currency: garment.currency }`.
2. Appends it to `marketValueHistory` and dispatches `UPDATE_GARMENT` with a
   `garment_updated` event.
3. Persists (fire-and-forget).

So each click is a committed, timestamped, **append-only** history entry. There
is no staging, no Cancel, no undo. The record panel lives inside the edit modal,
but its writes are independent of the modal's **Save changes / Cancel** (those
gate the *draft fields* via `updateGarment`, not the value history).

## Option A — Keep append-only (current default)
**Pros**
- **Model integrity:** the history is an event log — each estimate is a real,
  monotonic observation with its own timestamp. The sparkline/delta/"as of"
  features (cycles 1–3) all assume this. Editing/rescinding past points would
  make the trend a lie.
- **Simplicity & determinism:** one action, one reducer path, already unit-tested
  and matches the pure-reducer architecture (CLAUDE.md §5). No staging state.
- **Honesty:** "your own number, kept over time" is literally true — nothing is
  silently discarded.
- **Cross-surface consistency:** the panel is self-contained (no prop threading);
  a commit-on-modal-confirm model would couple it to whatever host modal it sits
  in (today the editor; tomorrow elsewhere).

**Cons**
- **Cancel expectation mismatch:** a user who mis-types then hits Cancel on the
  modal still recorded the value (the field edits were discarded, the value was
  not). This is the exact friction the backlog item names.
- **No correction path:** a fat-fingered `1400` instead of `140` is permanent
  (only outweighable by recording again; the bad point stays in the trend).

## Option B — Transactional (stage, commit on modal confirm)
**Pros**
- Matches the modal's mental model: **Cancel** discards *everything*, **Save**
  commits everything, including a pending value.
- Allows pre-commit correction of a mistyped value with no history pollution.

**Cons**
- **Breaks the event-log semantics:** a single "pending value" per modal open is
  a draft, not an observation; multiple records per session would need queueing
  rules (replace? append all on save?). Ambiguous.
- **Couples the panel to a host** with Save/Cancel — the panel is currently
  drop-anywhere. Surfaces without a confirm affordance (e.g. a future inline
  card) would have no commit point.
- **More state + tests:** pending-value state, reset-on-cancel, commit-on-save,
  and interaction with the now id-keyed draft re-seed (cycle 2). Bigger surface,
  bigger regression risk.
- Still doesn't give **undo of already-committed** points — only pre-commit edit.

## Recommendation (for the user to decide)
If the goal is "fix mistypes," a **cheaper, model-preserving** middle path beats
full transactionality: keep append-only, but add **undo-the-last-entry** (remove
the most recent history point) and/or a confirm on obviously-large values. That
addresses the correction gap without turning an event log into a draft. If the
user specifically wants "Cancel means the value never happened," Option B is the
route — accept the coupling and the extra state.

**Expected files if B is chosen later:** `MarketValuePanel.tsx` (pending state +
props for commit/cancel signals), `GarmentEditor.tsx` (wire commit to Save,
reset to Cancel), `ArchiveProvider.tsx` (unchanged or add a batch record),
`MarketValuePanel.test.tsx` (staging/commit/cancel tests). Middle-path undo would
instead add a `removeLastMarketValue(id)` provider action + reducer-safe removal.
