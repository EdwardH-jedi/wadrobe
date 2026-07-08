# Review-loop policy (Scope 1.3) — PROVISIONAL, pre user approval

> ⚠️ Provisional. Adopted with conservative defaults so the loop is
> well-defined and the unattended run can proceed. **Awaiting user ratification.**
> Grounded in the 3 observation cycles (`pipeline/observations.md`).

## The adjudication rule (who decides a cycle passes)
No model adjudicates. The **objective gate** (typecheck / lint / test / build on
Node 20) decides. Codex advises; Claude implements; the gate rules.
**Gate > model > instruction**, always.

## Loop parameters (conservative defaults)
1. **Max fix passes per cycle: 2.** After 2 fix passes, if the gate still can't
   go green *or* a blocker remains, **stop** and write `STOPPED.md` (hard stop).
2. **Re-fix (loop re-iteration) trigger: `[blocker]` only.** A blocker that
   survives a fix forces another review→fix iteration (within the cap of 2).
3. **Within a fix pass**, address `[blocker]` and `[major]` (a major is a real
   user-hittable bug — see cycle 2). `[minor]` is **logged, not fixed**.
   Majors are fixed opportunistically but do not, by themselves, force extra
   loop iterations beyond the pass.
4. **Conflict handling** (implementer disagrees with a finding): if the gate is
   **green**, **keep the implementation and record an explicit rebuttal** in the
   cycle report. Never silently drop a finding.
5. **The gate always wins.** A red gate blocks the commit for any reason,
   including "the reviewer said it was fine."

## Why these defaults (from the observations)
- Cycle 2 showed a `[major]` that no gate could catch (runtime stale-snapshot) —
  so majors must be fixable in-cycle, not deferred. Hence rule 3.
- Cycle 2 also showed a small task can balloon a fix (2 extra files). The 2-pass
  cap (rule 1) + blocker-only re-trigger (rule 2) bound that pressure.
- All 3 cycles confirmed the gate is a reliable hard backstop, so it — not a
  model — is the adjudicator.

## Enforcement (implementation)
- **Hard backstop:** `pipeline/harness/run-gate.sh` — mechanical, non-negotiable.
- **Procedural:** `pipeline/harness/CYCLE.md` encodes this loop; the implementer
  follows it and records each fix pass + any rebuttal in the cycle report.
- Severity is read from Codex's tagged output (`[blocker]/[major]/[minor]`); it is
  deliberately NOT auto-parsed into a pass/fail verdict — the gate is the verdict.

## Reversal
Change the numbers here + in `CYCLE.md` and DECISIONS D5. Provisional until the
user ratifies (Scope 1.3).
