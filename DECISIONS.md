# DECISIONS — pipeline-run-1 / avatar-visual-1

Conservative defaults adopted at 🚩/🔶 roadmap decision points so the unattended
run can continue. **Every entry is reversible by the user.** Format: what / why /
how to revert.

---

## AVATAR-VISUAL run (branch `avatar-visual-1`, off `pipeline-run-1`)

### AV0 — User pre-approved 1b; backend unfrozen for 1b scope only
- **What:** The user waived the 1a quality-judgement gate and pre-approved through
  step 1b. `backend/` is therefore unfrozen **only for the background-removal
  endpoint** (1b). No other backend file may change.
- **Why:** Explicit user instruction. Keeps the freeze everywhere except the one
  sanctioned endpoint.
- **Revert:** Re-freeze `backend/`; drop the `/api/cutout` endpoint + its deps.

### AV1 — Quality judgement replaced by side-by-side evidence
- **What:** The 🚩 1a quality gate becomes "collect comparison evidence": the same
  input run through the 1a heuristic and the 1b ML path, saved side by side under
  `evidence/`, for the user to judge after the fact.
- **Why:** Unattended run cannot make the taste call. Evidence preserves it.
- **Revert:** Delete `evidence/`; make the call manually in dev.

### AV2 — 1a generation is item-level (studio affordance), not upload-only
- **What:** The plan allows "upload OR item-level" cutout generation. This run
  uses an **item-level** path: an additive `asset.mannequinCutoutUrl` field + a
  provider action `prepareMannequinCutout(id)` + a small honest studio control,
  reusing the existing on-device flood-fill (`lib/image/garmentCutout.ts`), so the
  EXISTING closet benefits immediately (better demo/evidence).
- **Why:** Item-level lets current items show a cutout without re-uploading; avoids
  churning the heavily-tested upload flow. Additive field survives persist/load
  with no storage change (parser preserves `asset`).
- **Revert:** Drop the field + action + control; render surfaces fall back to the
  original automatically (helper degrades to `getGarmentDisplayImage`).

### AV3 — `mannequinCutoutUrl` stored inline (data URL), not blob-backed (1a)
- **What:** The mannequin cutout is a ≤640px WebP data URL kept inline on the
  asset (like the `imageDataUrl` thumbnail), NOT moved into the IDB blob store /
  `garmentBlobKeys` / orphan sweep.
- **Why:** Comparable in size to the thumbnail already stored inline; blob-backing
  it would touch the orphan-sweep invariant surface — out of proportion for 1a.
- **Revert:** Add a `mannequinCutoutRef` + register it in `garmentBlobKeys` and the
  dehydrate/hydrate paths (documented follow-up).

### AV4 — Existing items backfill on demand only (no auto-migration)
- **What:** Pre-feature items get a mannequin cutout only when the user triggers
  the studio control; there is no bulk auto-generation on load.
- **Why:** Auto-processing the whole closet (canvas work, silent writes) is
  surprising and heavier than 1a warrants. On-demand is honest and bounded.
- **Revert:** Add a background migration effect that prepares cutouts for styled
  items lacking one.

---

## D1 — Work in a branch of this repo, not a separate pipeline repo
- **What:** Scope 0 lists "create a dedicated pipeline repo, separate from the
  wardrobe repo." Instead all pipeline work lives on branch `pipeline-run-1`
  inside the wardrobe repo, under `pipeline/`.
- **Why:** The run instructions explicitly say "work only on a work branch
  (pipeline-run-1)"; the observation tasks ARE wardrobe changes, so keeping them
  in-repo avoids cross-repo plumbing for a validation run. Conservative: no new
  repo, no history rewrite.
- **Revert:** `git format-patch main..pipeline-run-1 -- pipeline/` (or a subtree
  split) to lift the harness + reports into a standalone repo later.

## D2 — "Harness" = documented cycle + gate/review scripts, not a Claude-driving daemon
- **What:** Scope 1.1 asks for a "bare observation cycle script." Implemented as
  `pipeline/harness/` (`run-gate.sh`, `codex-review.sh`, `CYCLE.md`) plus the
  agent executing the loop. The scripts automate the two objective stages (gate,
  review); the implementer step is Claude in-session.
- **Why:** A fully autonomous bash script that spawns Claude non-interactively is
  Scope 1.4 (Discord/Hermes) territory — explicitly out of Scope 1's completion
  bar. The thin harness satisfies "gate first, Codex review, no auto-judgement"
  without over-building.
- **Revert:** Wrap the loop in a driver script once the CLI-invocation format is
  fixed (Scope 1.4); the two stage scripts are already reusable.

## D3 — Node 20 pinned advisory, not engine-strict
- **What:** `.nvmrc=20` + `package.json` `engines.node=20.x`, but no
  `.npmrc engine-strict=true`.
- **Why:** Tests need Node 20 (jsdom vs Node 25 native localStorage). Hard-strict
  would break the user's Node 25 workflows for non-test commands. Advisory states
  intent; the gate script enforces Node 20 for the gate itself.
- **Revert:** Add `.npmrc` with `engine-strict=true` to make it hard, or drop
  `engines` to remove the hint.

## D4 — ArchiveCard "no history" test updated to new intent (Cycle 1)
- **What:** `ArchiveCard.test.tsx` asserted "shows no market-value block when
  there is no history." Cycle 1 (Scope 2 backlog #1) deliberately adds an
  empty-state record hint, so that test is updated to assert the new intent (hint
  present; trend/sparkline still absent).
- **Why:** The behavior legitimately changed by requirement. Per the invariant,
  this is an *update to match a changed requirement*, not weakening a test to pass
  a broken feature — and it is called out in the cycle report.
- **Revert:** Drop backlog item #1 and restore the original assertion.

## D5 — Review-loop policy (Scope 1.3) — PROVISIONAL, pre user approval
> Adopted provisionally so the loop is well-defined; **awaiting user approval.**
> Full text + rationale in `pipeline/POLICY.md`; encoded in
> `pipeline/harness/CYCLE.md`; hard-enforced by `run-gate.sh`.
- Max **2** fix passes per cycle; exceeding is a hard stop (`STOPPED.md`).
- **Re-fix loop re-trigger: `[blocker]` only.** Within a fix pass, both
  `[blocker]` and `[major]` are addressed (a major is a real user-hittable bug,
  see cycle 2); `[minor]` is **logged only**.
- On implementer/reviewer conflict: **if the gate is green, keep the
  implementation and record an explicit rebuttal** in the cycle report.
- The objective gate always wins over any model opinion.
- **Revert:** Change the thresholds in `pipeline/POLICY.md`, `CYCLE.md`, and here.
  (Provisional until the user ratifies — see Scope 1.3.)
