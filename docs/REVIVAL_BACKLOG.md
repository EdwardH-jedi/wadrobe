# Revival Backlog

Deferred ideas found during the Phase 0–2 revival pass. Nothing here is
scheduled; this file exists so a good idea met at the wrong moment is written
down instead of either forgotten or allowed to derail the phase in hand.

Direction lives in [`REVIVAL_ROADMAP.md`](REVIVAL_ROADMAP.md). Status lives in
[`PROJECT_STATUS.md`](PROJECT_STATUS.md).

---

## Deferred during Phase 0

### Split `archive-theme.css`
~3.1k lines in one file. It is well-organised and heavily commented, and a split
into per-surface files would touch nearly every component's styling at once —
maximum churn, zero user-visible gain, right before a responsive pass. Revisit
when the layout has settled, not during it.

### Quiet the 733 kB `three.module` build warning
`build.rollupOptions.output.manualChunks` or a raised
`chunkSizeWarningLimit` would silence it. The chunk is already dynamically
imported and never reaches a default visitor, so this is cosmetic — and raising
a warning limit to hide a real number is the kind of fix worth thinking about
rather than reaching for.

### Push the branch
The repository is many commits ahead of `origin/main` and none of it is pushed.
Publishing is the user's decision, not a task step.

---

## Deferred during Phase 1

### `SidebarNav` still owns the storage badge
The persistence badge lives inside the desktop sidebar, so on mobile — where the
sidebar is not rendered — durability is communicated only by `ArchiveAlertBanner`
when something is actually wrong. That is arguably the correct behaviour (tell
the user on failure, stay quiet on success), but it means the mobile user has no
ambient "saved locally" reassurance. Worth a deliberate design decision rather
than leaving it as a side effect of the layout.

### Studio deserves a mobile-native treatment
The Studio room restacks correctly on a phone and no longer clips, but it was
composed as a wide editorial stage. It reads as a desktop scene squeezed into a
column rather than something designed for the width. Since Studio is explicitly
demoted to a secondary showroom surface, redesigning it is not Core v1 work.

### A real router
Navigation is local `useState` in `ArchiveStudio`. This is sufficient and keeps
the bundle small, but it means no deep links, no back-button support, and no
shareable view URLs. On a phone the missing back-button behaviour is the most
noticeable of the three. Worth doing when there is a reason beyond tidiness.

---

## Deferred during Phase 2

### Manual preview transform (user-adjustable placement)
The domain could carry an optional per-garment
`previewTransform?: { scale, x, y, rotation }` so a user could nudge a piece
that auto-fit placed imperfectly. **Deliberately not built**: auto-fit comes
first, and shipping a manual override before the automatic placement is good
would be building an escape hatch instead of fixing the problem. Revisit only
once Phase 2's automatic fitting has been used on real photos and found
genuinely insufficient — and if it is, the domain addition is small.

### Higher-quality segmentation behind the cutout seam
The provider chain (`better segmentation → local flood fill → original image`)
is designed for this and the local fallback is permanent. Adding an actual ML
segmenter means weighing a large dependency against the quality gain, which is
Phase 4's question, not Phase 2's.

### Content bounds for non-cutout images
Bounds are computed only for transparent cutouts, where alpha gives an unambiguous
answer. An opaque flat-lay photo has no alpha channel to measure, so finding its
subject means a luminance/edge heuristic — a different and much less reliable
problem. Opaque garments keep the honest matte-panel presentation instead.

### Backfill bounds for previously-accepted cutouts
Garments whose cutout was accepted before Phase 2 have no stored
`contentBounds` and fall back to the zone-fitted presentation. A one-off
migration could measure them at hydration, but that means canvas work during
startup for a cosmetic gain on a small number of records. Re-accepting a cutout
already produces bounds.

### Per-garment aspect-aware empty zones
Empty mannequin zones are drawn from the same geometry as filled ones, which is
correct and consistent. A more editorial treatment (ghosted category
silhouettes rather than dashed boxes) would make an empty mannequin read better
as an invitation. Purely visual polish.
