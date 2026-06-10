# Skill: ui-style-guide

How to keep the UI on-brand. Tokens live in `src/styles/archive-theme.css`
(`:root`); reset/base in `globals.css`.

## Palette & materials

- Surfaces: warm near-blacks `--ink-900 … --ink-500` (charcoal/off-black/grey).
- Text: warm greys `--text-100 … --text-500` (`--text-100` ≈ off-white).
- Accent: warm **brass** `--accent` / `--accent-bright`. Use **sparingly** —
  active nav, primary buttons, key highlights. Brass is the spotlight, not the
  wallpaper.
- Materials: `--chrome` (brushed metal), `--walnut-*` (wood), `--concrete`,
  `--paper` (light matte for garment panels).
- Danger: `--danger`.

**Always use tokens.** Don't hardcode new hex values; add a token if needed.

## Typography

- Display/titles: `--font-display` (Bodoni Moda → system serif). Editorial.
- UI/body: `--font-sans` (Inter → system).
- Eyebrows: `.eyebrow` (uppercase, tracked, small).

## Components

Reuse the primitives in `components/ui/`: `Button` (variants: default, primary,
ghost, quiet, danger), `Badge`, `Panel`, `Modal`, `EmptyState`, `Icon`
(inline line icons — add new ones to `Icon.tsx`, stroke-based, currentColor).

## Garment imagery

Show garment photos inside **light matte panels** with
`mix-blend-mode: multiply` (drops white flat-lay backgrounds for free). This is
the pattern on cards, the rail, the mannequin, the rack, the shelf, and saved
looks. Keep it consistent. Add framed/vignette treatment, not raw rectangles.

## Motion

- Keep it subtle and premium: `fadeUp`, `archiveIn`, `shimmer`, `scanSweep`,
  `spotlightBreath`. Avoid bouncy/playful easing.
- `prefers-reduced-motion` is honored globally — don't fight it.

## Layout

- App shell: `.app` (sidebar + main). Views scroll in `.view`; the studio uses
  `.view--flush`. The rail (`.filmstrip`) is fixed at the bottom — reserve space
  for it (already handled).
- Responsive breakpoints at ~1040px, ~860px (sidebar → icons), ~560px (stack).
