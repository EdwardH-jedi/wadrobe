# Skill: product-vision

Project-local context for The Archive (Fit Archive). Keep this in mind on every
task here.

## What it is

An interactive fashion archive: upload clothes you own → archive them with a
**local demo** (mock) classification you confirm → browse a digital closet →
style a tall faceless **2.5D** mannequin → run a Fit Check → save looks.

## The feeling to protect

Premium fashion archive · dark editorial showroom · designer's private styling
studio · streetwear/vintage wardrobe OS. Uploaded clothing photos are the hero.

## Hard rules

- NOT cute, childish, beige, cozy, or a kids game.
- Mannequin is **tall and faceless**. Never a chibi/character avatar.
- NO real 3D virtual try-on, and never claim there is one. The mannequin is an
  explicit **2.5D** layered composition.
- The demo suggestion is **never binding** — the user confirms/edits (a name is
  required) before saving. Never claim real AI recognition.
- No auth, accounts, or cloud storage. Wardrobe data is local, always.
- The optional serverless routes in `api/` are inert unless `VITE_API_BASE` is
  configured; the experimental FastAPI service in `backend/` is local-only and
  hidden unless `VITE_ENABLE_EXPERIMENTAL_3D` is set. Keep both opt-in.
- No dependency bloat; justify anything new.

## The core loop

`upload → demo scan → draft suggestion → confirm → Archive Piece →
closet / rail / room → style mannequin → Fit Check → save look → board`.

When adding features, ask: does this strengthen that loop and the premium
editorial feel, without overbuilding? See `CLAUDE.md` and `docs/` for detail.

## Working here

`docs/CURRENT_STATE.md` is the source of truth for what exists — read it first.
Keep changes small and verified (typecheck / lint / test / build), and write code
comments in **English**. Historical plans live in `docs/archive/` and are not
status.
