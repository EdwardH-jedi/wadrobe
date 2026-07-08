# DECISIONS — pipeline-run-1

Conservative defaults adopted at 🚩/🔶 roadmap decision points so the unattended
run can continue. **Every entry is reversible by the user.** Format: what / why /
how to revert.

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
- Max **2** fix passes per cycle.
- Only **[blocker]** findings trigger a re-fix in the loop; **[major]** are fixed
  in the same cycle when cheap and safe, else logged; **[minor]** logged only.
- On implementer/reviewer conflict: **if the gate is green, keep the
  implementation and record a rebuttal.**
- The objective gate always wins over any model opinion.
- **Revert:** Change the thresholds here and in `pipeline/harness/CYCLE.md`.
  (Provisional until the user ratifies — see Scope 1.3.)
