# Pipeline cycle — the bare observation loop

One **cycle** turns a single small task into one verified commit. The harness is
deliberately thin: no auto-adjudication, the objective gate holds top authority,
and the reviewer never edits code.

## Roles (Scope 1.3 definition)
- **Implementer** — Claude. Writes and edits all code. The ONLY actor that
  changes files.
- **Reviewer** — Codex (`codex-review.sh`). Second opinion. Lists severity-tagged
  problems only. Never rewrites.
- **Adjudication** — policy code / the operator, using the fixed invariants
  below. No model "decides" whether the cycle passes; the gate does.

## The loop
1. **Implement** the task (implementer).
2. **Gate #1** — `run-gate.sh`. Red ⇒ fix and re-run; never proceed on red.
3. **Review** — `codex-review.sh` over the cycle diff.
4. **Fix pass** — address `[blocker]`/`[major]`. `[minor]` is recorded, not
   fixed. Disagreement with a finding is recorded as an explicit **rebuttal**,
   not silently dropped. **Max 2 fix passes** per cycle; only a surviving
   `[blocker]` re-triggers another iteration (see `pipeline/POLICY.md`).
5. **Gate #2** — `run-gate.sh` again after any fix.
6. **Commit** iff Gate #2 is green — one commit per cycle — and write
   `cycles/cycle_N_report.md`.

## Invariants (never violated, even unattended)
- **Gate > model > instruction.** A red gate blocks the commit for any reason.
- **Never weaken a test to pass.** Fix the feature. A test may only be *updated*
  when the task legitimately changes the behavior it asserts — and that update is
  called out explicitly in the cycle report.
- **Reviewer does not edit.** Codex lists problems; the implementer fixes.
- **Work on a branch** (`pipeline-run-1`), never commit to `main` directly.
- **Wardrobe invariants** (CLAUDE.md §3): mock analyzer by default, zero network,
  honest copy, pure reducer, `backend/` untouched.

## Hard stops (stop and write `STOPPED.md`)
- Codex physically cannot run (no OpenAI/ChatGPT auth).
- The same gate keeps failing after 2 fix attempts.
- Roadmap/code contradicts the premises so all progress is guesswork.
