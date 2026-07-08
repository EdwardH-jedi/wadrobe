# Proposal report — Improvement candidates (Scope 2 #4/#5 replacement)

> ⚠️ 에이전트 자체 평가 — 자기평가 편향 가능, 사용자 재검토 필요.
> Backlog #4 (polish round 2) and #5 (feature gaps) require the user's taste input
> first, so **nothing here is implemented.** This is a candidate menu; each item
> is roughly one pipeline cycle. Surveyed read-only across Track A source.
> **Scope 3 areas (eBay/market-auto-update, 3D/Track-B avatar, Vibe-Trading) and
> the mannequin-room styling were excluded.**

## Safest first-cycle picks (low risk, clearly correct, user-visible)
These need little taste judgment and would flow cleanly through the pipeline:
- **C10 — empty provenance `<p>` on ArchiveCard.** When a piece has neither
  analysis nor reference (all seed pieces), the footer renders an empty
  paragraph. `ArchiveCard.tsx` ~L256-263. Guard the `<p>` / show honest fallback.
  Size XS. *Pure correctness — no taste call.*
- **C11 — inconsistent confidence copy.** Same upload modal shows "Draft · {n}%"
  vs "Demo · {n}% · a guess you confirm". `UploadGarmentModal.tsx` ~L975 /
  ~L1041. Unify the honest phrasing. Size XS. *Honesty consistency.*
- **C2 — filmstrip has no "more off-screen" affordance.** CSS mask/edge-fade on
  `.filmstrip__track`. `GarmentFilmstrip.tsx`. Size XS. *CSS-only.*
- **C3 — hydrating placeholder icon doesn't read as a spinner.**
  `ArchiveStudio.tsx` ~L75-82 — add an explicit spin (respect
  `prefers-reduced-motion`). Size XS. *CSS-only.*

## Accessibility (higher value, small each)
- **C1 — modals don't move focus in / don't trap Tab.** `ui/Modal.tsx` — sets
  `aria-modal` + Escape, but no focus-in or focus-trap; every modal inherits it.
  Size M. *Highest-value a11y item; slightly larger.*
- **C7 — toggle buttons never expose selected state to AT.** No
  `aria-pressed`/`aria-selected` on tag chips (`ClosetPanel`), category/color
  pills (`GarmentEditor`), display-source pills (`UploadGarmentModal`); selection
  is class-only. Size S.
- **C8 — incomplete ARIA tabs.** `CategoryTabs.tsx` uses `role="tab"` without
  `tabpanel`/`aria-controls` or arrow-key roving focus. Size S.
- **C9 — no live-region for transient feedback.** The provider builds event
  strings (saved/removed/recorded) but nothing is announced; "Saved to the board"
  is visual-only. Size S/M.

## Discoverability / UX consistency (some taste)
- **C4 — wall-board "Save current look" saves silently as "Untitled Look".**
  `OutfitWallBoard.tsx` ~L41 `saveOutfit('')` vs the named + confirmed path in
  `OutfitInspector.tsx`. Inconsistent; no acknowledgement. Size S. *Confirm which
  path is canonical (taste).* 
- **C5 — "The Mannequin" and "The Mirror" zones both open the same `mirror`
  view.** `StudioScene.tsx` ~L79-89 — reads as a duplicate/dead hotspot.
  *Navigation wiring only, NOT mannequin styling.* Size XS. *Confirm intended
  destinations (taste).* 
- **C6 — crop offset sliders disable silently when `zoom <= 1`.**
  `UploadGarmentModal.tsx` ~L830-863 — no hint to zoom first. Size S.

## Larger / needs a design decision
- **C12 — native `window.confirm` for destructive deletes** clashes with the
  editorial UI (`ClosetPanel.tsx` ~L57, `OutfitWallBoard.tsx` ~L26). A styled
  confirm affordance. Size M. *Design + reused component decision.*
- **C13 (optional) — GarmentCard color line uses inline `overflow/ellipsis`**
  instead of a class (`GarmentCard.tsx` ~L83). Style-in-JSX inconsistency. Size XS.

## Recommendation
Start the next observation round with **C10 → C11 → C2 → C3** (pure
correctness/honesty/CSS, no taste gate), then the a11y batch **C1/C7/C8/C9** which
is high-value and mostly mechanical. Defer C4/C5/C6/C12 until the user rules on
the UX/taste questions flagged above.
