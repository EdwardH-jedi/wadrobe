> **Historical document — not current implementation status.**
> For what the repository actually contains today, see
> [`docs/PROJECT_STATUS.md`](../PROJECT_STATUS.md).

---

# Archived planning documents

These are the planning, review, and progress documents this project was built
against. They are kept because the reasoning in them is worth reading — why the
reducer takes its ids and timestamps as payloads, why persistence degrades
through three tiers, why the analyzer was gated behind two separate env
variables — but **none of them is a reliable status report.** Several contradict
each other and all of them predate the current code.

Nothing here is loaded by the app, referenced by a test, or maintained.

| Document | What it was | Why it is here |
| --- | --- | --- |
| `PLAN.md` | Phase-by-phase implementation plan for the wardrobe app (partly written in Korean). | Superseded as a status source by `docs/PROJECT_STATUS.md`. |
| `PROGRESS_REPORT.md` | A point-in-time progress snapshot. | Stale by construction. |
| `MASTER_SCOPE_ROADMAP.md` | Long-range scope sketch across both tracks. | Aspirational; describes work that was never started. |
| `AVATAR_VISUAL_PLAN.md` | **PLANNED / CONCEPT.** A three-step product concept (cutout → size fit → 3D avatar rotation). | The user-facing avatar experience it describes does not exist, and no sizing/fit logic exists at all. Generic backend foundations do exist (a procedural mannequin mesh and a bbox outfit fitter), but nothing personalised and nothing any frontend consumes. See its header for per-step status. |
| `track-b4a-jobs-api.md` | Design note for the async avatar jobs API. | The backend surface it describes exists; no frontend consumes it. |
| `vision-api-integration.md` | Design note for the optional vision analyzer. | The integration it plans is implemented (`api/analyze.ts`). |
| `vision-step2-consent-gate.md` | Design note for the vision consent gate. | Implemented (`src/lib/ai/visionConsent.ts`). |
| `PROJECT_SCOPE.md` | Scope statement for both tracks. | Its status claims contradict `AVATAR_TRACK.md`. |
| `ROADMAP.md` | Delivered-phases roadmap. | Phase numbering only makes sense against `PLAN.md`. |
| `CODEX_REVIEW.md` | Handoff notes prepared for an external review. | Describes a repository state ("no backend, no real AI, no real 3D") that no longer holds. |
| `REPORT.md` | An independent repository review (2026-08-12). | Its findings drove much of the rehabilitation work; kept as the "before" picture. |
| `README.draft.md` | A proposed README written during that review. | Its verified measurements fed the current `README.md`. |
